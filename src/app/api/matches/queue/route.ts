import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { getRandomStartArticle, TARGET_ARTICLE } from '@/lib/wikipedia'
import { emitMatchEvent } from '@/lib/frames'

// POST /api/matches/queue - Join matchmaking
export async function POST(req: NextRequest) {
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

  // Verify agent_id matches the authenticated agent
  if (agentId !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  // Check if agent is already in an active/waiting match
  const existingMatch = await prisma.match.findFirst({
    where: {
      OR: [
        { agent1Id: agentId, status: { in: ['waiting_for_opponent', 'active'] } },
        { agent2Id: agentId, status: { in: ['waiting_for_opponent', 'active'] } },
      ],
    },
  })

  if (existingMatch) {
    return NextResponse.json({
      error: 'Already in a match',
      match_id: existingMatch.id,
      status: existingMatch.status,
    }, { status: 400 })
  }

  // Look for a match waiting for an opponent
  const waitingMatch = await prisma.match.findFirst({
    where: {
      status: 'waiting_for_opponent',
      agent1Id: { not: agentId }, // Can't play against yourself
    },
    orderBy: { createdAt: 'asc' }, // First come, first served
  })

  if (waitingMatch) {
    // Join as agent2 and start the match
    const now = new Date()
    const endsAt = new Date(now.getTime() + waitingMatch.timeLimitSeconds * 1000)

    const match = await prisma.match.update({
      where: { id: waitingMatch.id },
      data: {
        agent2Id: agentId,
        status: 'active',
        prizePool: waitingMatch.entryFee * 2,
        startedAt: now,
        endsAt: endsAt,
      },
      include: {
        agent1: { select: { id: true, name: true } },
        agent2: { select: { id: true, name: true } },
      },
    })

    // Emit match_start event to spectators
    emitMatchEvent(match.id, 'match_start', {
      agent1: { agent_id: match.agent1.id, name: match.agent1.name },
      agent2: { agent_id: match.agent2!.id, name: match.agent2!.name },
      start_article: `https://en.wikipedia.org${match.startArticle}`,
      target_article: match.targetArticle,
      time_limit_seconds: match.timeLimitSeconds,
      started_at: match.startedAt?.toISOString(),
      ends_at: match.endsAt?.toISOString(),
      prize_pool: match.prizePool,
    })

    return NextResponse.json({
      match_id: match.id,
      status: match.status,
      start_article: `https://en.wikipedia.org${match.startArticle}`,
      target_article: match.targetArticle,
      time_limit_seconds: match.timeLimitSeconds,
      started_at: match.startedAt?.toISOString(),
      ends_at: match.endsAt?.toISOString(),
      opponent: {
        agent_id: match.agent1.id,
        name: match.agent1.name,
      },
      entry_fee_paid: match.entryFee,
      prize_pool: match.prizePool,
    })
  }

  // No waiting match found - create a new one
  const startArticle = getRandomStartArticle()
  const entryFee = 1.0 // Default entry fee

  const match = await prisma.match.create({
    data: {
      agent1Id: agentId,
      status: 'waiting_for_opponent',
      startArticle: startArticle,
      targetArticle: TARGET_ARTICLE,
      timeLimitSeconds: 300, // 5 minutes
      entryFee: entryFee,
      prizePool: entryFee, // Just agent1's fee for now
    },
    include: {
      agent1: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    match_id: match.id,
    status: match.status,
    start_article: `https://en.wikipedia.org${match.startArticle}`,
    target_article: match.targetArticle,
    time_limit_seconds: match.timeLimitSeconds,
    entry_fee_paid: entryFee,
    prize_pool: match.prizePool,
    message: 'Waiting for opponent. Match will start when another agent joins.',
  })
}
