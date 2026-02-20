import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
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

  // Look for a waiting match with an open slot for this agent
  const waitingMatch = await prisma.match.findFirst({
    where: {
      status: 'waiting_for_opponent',
      agent2Id: null,
      OR: [
        { agent1Id: null },
        { agent1Id: { not: agentId } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  if (waitingMatch) {
    // If slot 1 is empty, fill it and keep waiting
    if (!waitingMatch.agent1Id) {
      await prisma.match.update({
        where: { id: waitingMatch.id },
        data: { agent1Id: agentId },
      })

      return NextResponse.json({
        match_id: waitingMatch.id,
        status: 'waiting_for_opponent',
        task_description: waitingMatch.taskDescription,
        start_url: waitingMatch.startUrl,
        time_limit_seconds: waitingMatch.timeLimitSeconds,
        message: 'Joined as agent 1. Waiting for opponent.',
      })
    }

    // Slot 1 is taken — fill slot 2 and start the match
    const now = new Date()
    const endsAt = new Date(now.getTime() + waitingMatch.timeLimitSeconds * 1000)

    const match = await prisma.match.update({
      where: { id: waitingMatch.id },
      data: {
        agent2Id: agentId,
        status: 'active',
        prizePool: waitingMatch.entryFee * 2,
        startedAt: now,
        endsAt,
      },
      include: {
        agent1: { select: { id: true, name: true } },
        agent2: { select: { id: true, name: true } },
      },
    })

    // Emit match_start event to spectators
    emitMatchEvent(match.id, 'match_start', {
      agent1: { agent_id: match.agent1!.id, name: match.agent1!.name },
      agent2: { agent_id: match.agent2!.id, name: match.agent2!.name },
      task_description: match.taskDescription,
      start_url: match.startUrl,
      time_limit_seconds: match.timeLimitSeconds,
      started_at: match.startedAt?.toISOString(),
      ends_at: match.endsAt?.toISOString(),
      prize_pool: match.prizePool,
    })

    return NextResponse.json({
      match_id: match.id,
      status: match.status,
      task_description: match.taskDescription,
      start_url: match.startUrl,
      time_limit_seconds: match.timeLimitSeconds,
      started_at: match.startedAt?.toISOString(),
      ends_at: match.endsAt?.toISOString(),
      opponent: {
        agent_id: match.agent1!.id,
        name: match.agent1!.name,
      },
      entry_fee_paid: match.entryFee,
      prize_pool: match.prizePool,
    })
  }

  // No waiting match — create one, but require task_description
  const taskDescription = body.task_description?.trim()
  if (!taskDescription) {
    return NextResponse.json({
      error: 'No waiting match found. Provide task_description to create one, or use POST /api/matches/create.',
    }, { status: 400 })
  }

  const startUrl = body.start_url?.trim() || ''
  const timeLimitSeconds = Number(body.time_limit_seconds) || 300
  const entryFee = 1.0

  const match = await prisma.match.create({
    data: {
      agent1Id: agentId,
      status: 'waiting_for_opponent',
      taskDescription,
      startUrl,
      timeLimitSeconds,
      entryFee,
      prizePool: entryFee,
    },
  })

  return NextResponse.json({
    match_id: match.id,
    status: match.status,
    task_description: match.taskDescription,
    start_url: match.startUrl,
    time_limit_seconds: match.timeLimitSeconds,
    entry_fee_paid: entryFee,
    prize_pool: match.prizePool,
    message: 'Waiting for opponent. Match will start when another agent joins.',
  })
}
