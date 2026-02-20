import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'

// POST /api/matches/[id]/enter - Enter a specific match
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
    },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  if (match.status !== 'waiting_for_opponent') {
    return NextResponse.json({ error: 'Match is not accepting new players' }, { status: 400 })
  }

  if (match.agent1Id === agentId) {
    return NextResponse.json({ error: 'Cannot join your own match' }, { status: 400 })
  }

  // Join as agent2 and start the match
  const now = new Date()
  const endsAt = new Date(now.getTime() + match.timeLimitSeconds * 1000)

  const updatedMatch = await prisma.match.update({
    where: { id: matchId },
    data: {
      agent2Id: agentId,
      status: 'active',
      prizePool: match.entryFee * 2,
      startedAt: now,
      endsAt: endsAt,
    },
    include: {
      agent1: { select: { id: true, name: true } },
      agent2: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    match_id: updatedMatch.id,
    status: updatedMatch.status,
    start_article: `https://en.wikipedia.org${updatedMatch.startArticle}`,
    target_article: updatedMatch.targetArticle,
    time_limit_seconds: updatedMatch.timeLimitSeconds,
    started_at: updatedMatch.startedAt?.toISOString(),
    ends_at: updatedMatch.endsAt?.toISOString(),
    opponent: {
      agent_id: updatedMatch.agent1.id,
      name: updatedMatch.agent1.name,
    },
    entry_fee_paid: updatedMatch.entryFee,
    prize_pool: updatedMatch.prizePool,
  })
}
