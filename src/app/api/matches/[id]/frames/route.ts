import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { storeFrame } from '@/lib/frames'
import { extractArticleTitle } from '@/lib/wikipedia'

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
  const { agent_id, frame, current_url, click_count } = body

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
  })

  // Extract article title and update path if changed
  const articleTitle = extractArticleTitle(current_url)
  const lastUrl = isAgent1 ? match.agent1LastUrl : match.agent2LastUrl

  if (articleTitle && current_url !== lastUrl) {
    // URL changed - add to path
    const pathField = isAgent1 ? 'agent1Path' : 'agent2Path'
    const lastUrlField = isAgent1 ? 'agent1LastUrl' : 'agent2LastUrl'
    const clicksField = isAgent1 ? 'agent1Clicks' : 'agent2Clicks'

    const currentPath = JSON.parse(isAgent1 ? match.agent1Path : match.agent2Path) as string[]
    currentPath.push(articleTitle)

    await prisma.match.update({
      where: { id: matchId },
      data: {
        [pathField]: JSON.stringify(currentPath),
        [lastUrlField]: current_url,
        [clicksField]: click_count || currentPath.length,
      },
    })
  }

  return NextResponse.json({ received: true })
}
