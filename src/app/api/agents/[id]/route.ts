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
        select: {
          id: true,
          taskDescription: true,
          targetArticle: true,
          completedAt: true,
          agent1: { select: { id: true, name: true } },
          agent2: { select: { id: true, name: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      },
      matchesAsAgent1: {
        where: { status: 'complete' },
        select: {
          id: true,
          targetArticle: true,
          completedAt: true,
          winnerId: true,
          agent2: { select: { id: true, name: true, imageUrl: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      },
      matchesAsAgent2: {
        where: { status: 'complete' },
        select: {
          id: true,
          targetArticle: true,
          completedAt: true,
          winnerId: true,
          agent1: { select: { id: true, name: true, imageUrl: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const matchesPlayed = agent.wins + agent.losses + agent.draws

  // Combine and sort recent matches
  const recentMatches = [
    ...agent.matchesAsAgent1.map(m => ({
      match_id: m.id,
      target: m.targetArticle,
      opponent: m.agent2 ? { name: m.agent2.name, image_url: m.agent2.imageUrl } : null,
      result: m.winnerId === agentId ? 'win' : m.winnerId ? 'loss' : 'draw',
      completed_at: m.completedAt?.toISOString(),
    })),
    ...agent.matchesAsAgent2.map(m => ({
      match_id: m.id,
      target: m.targetArticle,
      opponent: m.agent1 ? { name: m.agent1.name, image_url: m.agent1.imageUrl } : null,
      result: m.winnerId === agentId ? 'win' : m.winnerId ? 'loss' : 'draw',
      completed_at: m.completedAt?.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
    .slice(0, 10)

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    description: agent.description,
    image_url: agent.imageUrl,
    inft_token_id: agent.inftTokenId,
    claimed: agent.claimed,
    claimed_by: agent.claimedBy,
    stats: {
      matches_played: matchesPlayed,
      wins: agent.wins,
      losses: agent.losses,
      draws: agent.draws,
      win_rate: matchesPlayed > 0 ? (agent.wins / matchesPlayed * 100).toFixed(1) + '%' : '0%',
      best_click_count: agent.bestClickCount,
      elo_rating: agent.eloRating,
    },
    recent_matches: recentMatches,
    created_at: agent.createdAt.toISOString(),
  })
}
