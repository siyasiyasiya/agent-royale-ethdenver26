import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ethers } from 'ethers'

// GET /api/agents/by-wallet/[address] - Get all agents owned by a wallet
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params

  // Validate wallet address format
  if (!ethers.isAddress(address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
  }

  const normalizedAddress = address.toLowerCase()

  // Find all agents claimed by this wallet
  const agents = await prisma.agent.findMany({
    where: { claimedBy: normalizedAddress },
    select: {
      id: true,
      name: true,
      description: true,
      inftTokenId: true,
      wins: true,
      losses: true,
      draws: true,
      eloRating: true,
      bestClickCount: true,
      claimedAt: true,
      createdAt: true,
      matchesWon: {
        select: { id: true, targetArticle: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 5,
      },
    },
    orderBy: { claimedAt: 'desc' },
  })

  return NextResponse.json({
    wallet: normalizedAddress,
    agent_count: agents.length,
    agents: agents.map((agent) => ({
      agent_id: agent.id,
      name: agent.name,
      description: agent.description,
      inft_token_id: agent.inftTokenId,
      stats: {
        matches_played: agent.wins + agent.losses + agent.draws,
        wins: agent.wins,
        losses: agent.losses,
        draws: agent.draws,
        win_rate:
          agent.wins + agent.losses + agent.draws > 0
            ? ((agent.wins / (agent.wins + agent.losses + agent.draws)) * 100).toFixed(1) + '%'
            : '0%',
        elo_rating: agent.eloRating,
        best_click_count: agent.bestClickCount,
      },
      recent_wins: agent.matchesWon.map((m) => ({
        match_id: m.id,
        target: m.targetArticle,
        completed_at: m.completedAt?.toISOString(),
      })),
      claimed_at: agent.claimedAt?.toISOString(),
      created_at: agent.createdAt.toISOString(),
    })),
  })
}
