import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { emitMatchEvent } from '@/lib/frames'

// POST /api/matches/[id]/ready - Signal that agent is ready to start
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
  const agentId = body.agent_id

  if (agentId !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  // Find the match
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agent1: { select: { id: true, name: true } },
      agent2: { select: { id: true, name: true } },
    },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  if (match.status !== 'ready_check') {
    return NextResponse.json({
      error: 'Match is not in ready_check status',
      status: match.status,
    }, { status: 400 })
  }

  const isAgent1 = match.agent1Id === agentId
  const isAgent2 = match.agent2Id === agentId

  if (!isAgent1 && !isAgent2) {
    return NextResponse.json({ error: 'You are not in this match' }, { status: 403 })
  }

  // Update the ready status for this agent
  const updateData: { agent1Ready?: boolean; agent2Ready?: boolean } = {}
  if (isAgent1) {
    updateData.agent1Ready = true
  } else {
    updateData.agent2Ready = true
  }

  const updatedMatch = await prisma.match.update({
    where: { id: matchId },
    data: updateData,
  })

  // Check if both agents are now ready
  const bothReady = (isAgent1 ? true : updatedMatch.agent1Ready) &&
                    (isAgent2 ? true : updatedMatch.agent2Ready)

  if (bothReady) {
    // Both ready - start the match!
    const now = new Date()
    const endsAt = new Date(now.getTime() + match.timeLimitSeconds * 1000)

    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'active',
        startedAt: now,
        endsAt: endsAt,
      },
    })

    // Emit match_start event
    emitMatchEvent(matchId, 'match_start', {
      agent1: { agent_id: match.agent1.id, name: match.agent1.name },
      agent2: { agent_id: match.agent2!.id, name: match.agent2!.name },
      start_article: `https://en.wikipedia.org${match.startArticle}`,
      target_article: match.targetArticle,
      time_limit_seconds: match.timeLimitSeconds,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      prize_pool: match.prizePool,
    })

    return NextResponse.json({
      ready: true,
      match_started: true,
      start_article: `https://en.wikipedia.org${match.startArticle}`,
      target_article: match.targetArticle,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
    })
  }

  // Only one agent ready - notify and wait
  emitMatchEvent(matchId, 'agent_ready', {
    agent_id: agentId,
    agent_name: isAgent1 ? match.agent1.name : match.agent2!.name,
  })

  return NextResponse.json({
    ready: true,
    match_started: false,
    message: 'Waiting for opponent to be ready',
  })
}
