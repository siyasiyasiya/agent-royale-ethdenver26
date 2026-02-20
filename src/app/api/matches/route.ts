import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/matches - List matches (for agents to find matches to join)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // Optional filter

  // Auto-expire stale active matches whose time limit has passed
  await prisma.match.updateMany({
    where: {
      status: 'active',
      endsAt: { lt: new Date() },
    },
    data: { status: 'complete', completedAt: new Date() },
  })

  const where = status
    ? { status }
    : { status: { in: ['waiting_for_opponent', 'active'] } }

  const matches = await prisma.match.findMany({
    where,
    include: {
      agent1: { select: { id: true, name: true } },
      agent2: { select: { id: true, name: true } },
      winner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    matches: matches.map(m => ({
      match_id: m.id,
      status: m.status,
      task_description: m.taskDescription,
      start_url: m.startUrl,
      target_article: m.targetArticle,
      time_limit_seconds: m.timeLimitSeconds,
      agent1: m.agent1 ? { agent_id: m.agent1.id, name: m.agent1.name } : null,
      agent2: m.agent2 ? { agent_id: m.agent2.id, name: m.agent2.name } : null,
      winner: m.winner ? { agent_id: m.winner.id, name: m.winner.name } : null,
      started_at: m.startedAt?.toISOString() || null,
      ends_at: m.endsAt?.toISOString() || null,
    })),
  })
}
