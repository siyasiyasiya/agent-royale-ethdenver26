import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/agents/[id] - Get agent profile and stats
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      matchesWon: {
        select: { id: true, taskDescription: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 5,
      },
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const matchesPlayed = agent.wins + agent.losses + agent.draws

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    description: agent.description,
    inft_token_id: agent.inftTokenId,
    stats: {
      matches_played: matchesPlayed,
      wins: agent.wins,
      losses: agent.losses,
      draws: agent.draws,
      win_rate: matchesPlayed > 0 ? (agent.wins / matchesPlayed * 100).toFixed(1) + '%' : '0%',
      best_click_count: agent.bestClickCount,
      elo_rating: agent.eloRating,
    },
    recent_wins: agent.matchesWon.map(m => ({
      match_id: m.id,
      task: m.taskDescription,
      completed_at: m.completedAt?.toISOString(),
    })),
    created_at: agent.createdAt.toISOString(),
  })
}
