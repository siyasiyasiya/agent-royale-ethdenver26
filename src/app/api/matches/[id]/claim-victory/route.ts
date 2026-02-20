import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { extractArticleTitle } from '@/lib/wikipedia'
import { getFrame, clearMatchFrames, emitMatchEvent } from '@/lib/frames'

// POST /api/matches/[id]/claim-victory - Claim victory
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
  const { agent_id, final_url } = body

  if (agent_id !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  // Find the match
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agent1: true,
      agent2: true,
    },
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

  // Get the URL to verify (from request or from last frame)
  let urlToVerify = final_url
  if (!urlToVerify) {
    const lastFrame = getFrame(matchId, agent_id)
    urlToVerify = lastFrame?.currentUrl
  }

  if (!urlToVerify) {
    return NextResponse.json({ error: 'No URL to verify. Include final_url or push frames.' }, { status: 400 })
  }

  // Extract article title from URL
  const articleTitle = extractArticleTitle(urlToVerify)

  if (!articleTitle) {
    return NextResponse.json({
      result: 'rejected',
      message: 'Could not parse article from URL',
      url: urlToVerify,
    }, { status: 400 })
  }

  // Check if it matches the target (case-insensitive, handle underscores)
  const normalizedTitle = articleTitle.toLowerCase().replace(/_/g, ' ')
  const normalizedTarget = match.targetArticle.toLowerCase().replace(/_/g, ' ')

  if (normalizedTitle !== normalizedTarget) {
    return NextResponse.json({
      result: 'rejected',
      verified_article: articleTitle,
      target_article: match.targetArticle,
      message: `You are on '${articleTitle}', not the target. Keep going!`,
    })
  }

  // Victory confirmed!
  const clickCount = isAgent1 ? match.agent1Clicks : match.agent2Clicks
  const agentPath = JSON.parse(isAgent1 ? match.agent1Path : match.agent2Path) as string[]
  const now = new Date()
  const timeElapsed = match.startedAt
    ? Math.floor((now.getTime() - match.startedAt.getTime()) / 1000)
    : 0

  // Update match status
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: 'complete',
      winnerId: agent_id,
      completedAt: now,
    },
  })

  // Update winner stats
  await prisma.agent.update({
    where: { id: agent_id },
    data: {
      wins: { increment: 1 },
      totalEarnings: { increment: match.prizePool },
      bestClickCount: agent.bestClickCount === null || clickCount < agent.bestClickCount
        ? clickCount
        : agent.bestClickCount,
    },
  })

  // Update loser stats
  const loserId = isAgent1 ? match.agent2Id : match.agent1Id
  if (loserId) {
    await prisma.agent.update({
      where: { id: loserId },
      data: {
        losses: { increment: 1 },
      },
    })
  }

  // Emit match complete event to spectators
  emitMatchEvent(matchId, 'match_complete', {
    winner: {
      agent_id: agent_id,
      name: agent.name,
      click_count: clickCount,
      path: agentPath,
    },
    time_elapsed_seconds: timeElapsed,
    prize_pool: match.prizePool,
  })

  // Clear frames from memory
  clearMatchFrames(matchId)

  return NextResponse.json({
    result: 'victory',
    verified_article: articleTitle,
    click_count: clickCount,
    path: agentPath,
    time_elapsed_seconds: timeElapsed,
    prize_won: match.prizePool,
    message: `Congratulations! You reached ${match.targetArticle} in ${clickCount} clicks.`,
  })
}
