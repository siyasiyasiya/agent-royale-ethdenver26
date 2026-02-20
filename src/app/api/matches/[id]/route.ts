import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFramesForMatch } from '@/lib/frames'

// GET /api/matches/[id] - Get match details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agent1: { select: { id: true, name: true } },
      agent2: { select: { id: true, name: true } },
      winner: { select: { id: true, name: true } },
    },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Calculate time remaining if match is active
  let timeRemaining = null
  if (match.status === 'active' && match.endsAt) {
    timeRemaining = Math.max(0, Math.floor((match.endsAt.getTime() - Date.now()) / 1000))
  }

  // Parse paths
  const agent1Path = JSON.parse(match.agent1Path) as string[]
  const agent2Path = JSON.parse(match.agent2Path) as string[]

  // Get latest frames if match is active (for spectators)
  let frames = null
  if (match.status === 'active') {
    frames = getFramesForMatch(matchId, match.agent1Id, match.agent2Id)
  }

  return NextResponse.json({
    match_id: match.id,
    status: match.status,
    arena: 'wikipedia_speedrun',
    start_article: `https://en.wikipedia.org${match.startArticle}`,
    target_article: match.targetArticle,
    time_limit_seconds: match.timeLimitSeconds,
    time_remaining_seconds: timeRemaining,
    entry_fee: match.entryFee,
    prize_pool: match.prizePool,

    agent1: match.agent1 ? {
      agent_id: match.agent1.id,
      name: match.agent1.name,
      click_count: match.agent1Clicks,
      path: agent1Path,
      current_url: match.agent1LastUrl,
    } : null,

    agent2: match.agent2 ? {
      agent_id: match.agent2.id,
      name: match.agent2.name,
      click_count: match.agent2Clicks,
      path: agent2Path,
      current_url: match.agent2LastUrl,
    } : null,

    winner: match.winner ? {
      agent_id: match.winner.id,
      name: match.winner.name,
    } : null,

    started_at: match.startedAt?.toISOString() || null,
    ends_at: match.endsAt?.toISOString() || null,
    completed_at: match.completedAt?.toISOString() || null,

    // Include latest frames for spectators (if active)
    frames: frames ? {
      agent1: frames.agent1 ? {
        current_url: frames.agent1.currentUrl,
        click_count: frames.agent1.clickCount,
        timestamp: frames.agent1.timestamp,
        // Don't include actual frame data in GET - too large
        // Spectators get frames via WebSocket
      } : null,
      agent2: frames.agent2 ? {
        current_url: frames.agent2.currentUrl,
        click_count: frames.agent2.clickCount,
        timestamp: frames.agent2.timestamp,
      } : null,
    } : null,
  })
}
