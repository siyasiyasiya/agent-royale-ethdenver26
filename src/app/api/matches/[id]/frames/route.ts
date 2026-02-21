// IMPORTANT: Must be 'nodejs' runtime, NOT the default Edge runtime.
// This route calls storeFrame() which stores frames in the global frameStore Map
// (an in-memory structure defined in src/lib/frames.ts and shared across the
// Node.js process). It also calls emitMatchEvent() which uses global.io.
// Both of these depend on shared global process memory that only exists in the
// Node.js runtime — the Edge runtime gets its own isolated V8 context where
// global.io is undefined and the frameStore is a completely separate instance.
// Without this declaration: frames would be stored in an unreachable Map instance,
// match broadcasts would silently fail, and the spectator view would never update.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { storeFrame } from '@/lib/frames'

// POST /api/matches/[id]/frames - Push screen frame during competition
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params

  // Authenticate
  const apiKey = getApiKey(req)
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const agent = await getAgentFromApiKey(apiKey)
  if (!agent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await req.json()
  const { agent_id, frame, current_url, click_count, thought } = body

  if (agent_id !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  if (!frame || !current_url) {
    return NextResponse.json({ error: 'frame and current_url required' }, { status: 400 })
  }

  // Find the match and verify agent is a participant
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  if (match.status !== 'active') {
    return NextResponse.json({ error: 'Match is not active' }, { status: 400 })
  }

  // Check for timeout
  if (match.endsAt && new Date() > match.endsAt) {
    return NextResponse.json({ error: 'Match has timed out' }, { status: 400 })
  }

  const isAgent1 = match.agent1Id === agent_id
  const isAgent2 = match.agent2Id === agent_id

  if (!isAgent1 && !isAgent2) {
    return NextResponse.json({ error: 'You are not in this match' }, { status: 403 })
  }

  // Store frame in memory for streaming
  storeFrame(matchId, agent_id, {
    frame,
    currentUrl: current_url,
    clickCount: click_count || 0,
    timestamp: Date.now(),
    thought: thought || '',
  })

  // Update last URL and click count in DB
  const lastUrl = isAgent1 ? match.agent1LastUrl : match.agent2LastUrl
  const urlChanged = current_url !== lastUrl

  // Persist thought to database if present and URL changed (new article)
  const thoughtText = thought?.trim()
  if (urlChanged) {
    const thoughtsField = isAgent1 ? 'agent1Thoughts' : 'agent2Thoughts'
    const existingThoughts = isAgent1 ? match.agent1Thoughts : match.agent2Thoughts

    let thoughtsArray: Array<{thought: string, article: string, timestamp: number}> = []
    if (existingThoughts) {
      try { thoughtsArray = JSON.parse(existingThoughts) } catch {}
    }

    // Extract article name from URL
    const article = current_url
      ? decodeURIComponent(current_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
      : 'Unknown'

    // Add new thought if present
    if (thoughtText) {
      thoughtsArray.push({ thought: thoughtText, article, timestamp: Date.now() })
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        [isAgent1 ? 'agent1LastUrl' : 'agent2LastUrl']: current_url,
        [isAgent1 ? 'agent1Clicks' : 'agent2Clicks']: click_count || 0,
        [thoughtsField]: JSON.stringify(thoughtsArray),
      },
    })
  }

  return NextResponse.json({ received: true })
}
