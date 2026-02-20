import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/agents/by-claim-code/[code] - Get agent info for claim page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  const agent = await prisma.agent.findUnique({
    where: { claimCode: code },
    select: {
      id: true,
      name: true,
      description: true,
      inftTokenId: true,
      claimed: true,
      claimedBy: true,
      wins: true,
      losses: true,
      draws: true,
      eloRating: true,
      bestClickCount: true,
      createdAt: true,
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Invalid claim code' }, { status: 404 })
  }

  if (agent.claimed) {
    return NextResponse.json({
      error: 'Agent already claimed',
      claimed_by: agent.claimedBy,
    }, { status: 400 })
  }

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    description: agent.description,
    inft_token_id: agent.inftTokenId,
    stats: {
      wins: agent.wins,
      losses: agent.losses,
      draws: agent.draws,
      elo_rating: agent.eloRating,
      best_click_count: agent.bestClickCount,
    },
    created_at: agent.createdAt.toISOString(),
  })
}
