import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { getFrame, clearMatchFrames, emitMatchEvent } from '@/lib/frames'
import { runOracle } from '@/lib/oracle'

// POST /api/matches/[id]/claim-victory - Triggers 0G oracle judging
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const agent = await getAgentFromApiKey(apiKey)
  if (!agent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await req.json()
  const { agent_id } = body

  if (agent_id !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  // Atomically transition active -> judging only for participants and before timeout.
  const now = new Date()
  const transitioned = await prisma.match.updateMany({
    where: {
      id: matchId,
      status: 'active',
      OR: [{ agent1Id: agent_id }, { agent2Id: agent_id }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    data: { status: 'judging' },
  })

  if (transitioned.count === 0) {
    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    if (match.status === 'judging') {
      return NextResponse.json({ message: '0G oracle is already judging this match.' }, { status: 202 })
    }
    if (match.endsAt && now > match.endsAt) {
      return NextResponse.json({ error: 'Match has timed out' }, { status: 400 })
    }
    if (match.agent1Id !== agent_id && match.agent2Id !== agent_id) {
      return NextResponse.json({ error: 'You are not in this match' }, { status: 403 })
    }
    return NextResponse.json({ error: `Match is not active (status: ${match.status})` }, { status: 400 })
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { agent1: true, agent2: true },
  })

  if (!match || !match.agent1Id || !match.agent2Id) {
    return NextResponse.json({ error: 'Match participants are incomplete' }, { status: 400 })
  }

  const isAgent1 = match.agent1Id === agent_id

  emitMatchEvent(matchId, 'judging_started', { claiming_agent: agent_id })

  const frame1 = getFrame(matchId, match.agent1Id)
  const frame2 = getFrame(matchId, match.agent2Id)

  const verdict = await runOracle({
    taskDescription: match.taskDescription,
    targetArticle: match.targetArticle,
    agent1: {
      agentId: match.agent1Id,
      name: match.agent1?.name ?? 'Agent 1',
      clickCount: match.agent1Clicks,
      lastUrl: frame1?.currentUrl ?? match.agent1LastUrl,
    },
    agent2: {
      agentId: match.agent2Id,
      name: match.agent2?.name ?? 'Agent 2',
      clickCount: match.agent2Clicks,
      lastUrl: frame2?.currentUrl ?? match.agent2LastUrl,
    },
  })

  const winnerId = verdict.winnerId
  const elapsedNow = new Date()
  const timeElapsed = match.startedAt
    ? Math.floor((elapsedNow.getTime() - match.startedAt.getTime()) / 1000)
    : 0

  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: 'complete',
      winnerId,
      oracleVerdict: JSON.stringify(verdict),
      completedAt: elapsedNow,
    },
  })

  if (winnerId) {
    const loserId = winnerId === match.agent1Id ? match.agent2Id : match.agent1Id
    await prisma.agent.update({
      where: { id: winnerId },
      data: { wins: { increment: 1 }, totalEarnings: { increment: match.prizePool } },
    })
    if (loserId) {
      await prisma.agent.update({ where: { id: loserId }, data: { losses: { increment: 1 } } })
    }
  } else {
    for (const participantId of [match.agent1Id, match.agent2Id]) {
      await prisma.agent.update({ where: { id: participantId }, data: { draws: { increment: 1 } } })
    }
  }

  emitMatchEvent(matchId, 'match_complete', {
    result: verdict.winner,
    winner: winnerId
      ? {
        agent_id: winnerId,
        name: winnerId === match.agent1Id ? match.agent1?.name : match.agent2?.name,
      }
      : null,
    oracle_reasoning: verdict.reasoning,
    time_elapsed_seconds: timeElapsed,
    prize_pool: match.prizePool,
  })

  clearMatchFrames(matchId)

  const myResult = winnerId === null ? 'draw' : winnerId === agent_id ? 'victory' : 'defeat'

  return NextResponse.json({
    result: myResult,
    oracle_reasoning: verdict.reasoning,
    click_count: isAgent1 ? match.agent1Clicks : match.agent2Clicks,
    time_elapsed_seconds: timeElapsed,
    prize_won: myResult === 'victory' ? match.prizePool : 0,
    message:
      myResult === 'victory'
        ? 'Congratulations! The oracle ruled in your favor.'
        : myResult === 'draw'
          ? 'The oracle declared a draw.'
          : 'The oracle ruled against you. Better luck next time.',
  })
}
