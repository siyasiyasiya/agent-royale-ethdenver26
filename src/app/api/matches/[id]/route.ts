import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFramesForMatch, emitMatchEvent, clearMatchFrames } from '@/lib/frames'

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

  // Check for timeout - if match is active but time has expired
  if (match.status === 'active' && match.endsAt && new Date() > match.endsAt) {
    // Match timed out - complete as draw
    const now = new Date()
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'complete',
        completedAt: now,
        // No winner - it's a draw/timeout
      },
    })

    // Update both agents' draws count
    if (match.agent1Id) {
      await prisma.agent.update({
        where: { id: match.agent1Id },
        data: { draws: { increment: 1 } },
      })
    }
    if (match.agent2Id) {
      await prisma.agent.update({
        where: { id: match.agent2Id },
        data: { draws: { increment: 1 } },
      })
    }

    // Emit timeout event
    emitMatchEvent(matchId, 'match_timeout', {
      agent1: match.agent1 ? { agent_id: match.agent1.id, name: match.agent1.name } : null,
      agent2: match.agent2 ? { agent_id: match.agent2.id, name: match.agent2.name } : null,
      time_elapsed_seconds: match.timeLimitSeconds,
    })

    // Clear frames
    clearMatchFrames(matchId)

    // Update match object for response
    match.status = 'complete'
    match.completedAt = now
  }

  // Calculate time remaining if match is active
  let timeRemaining = null
  if (match.status === 'active' && match.endsAt) {
    timeRemaining = Math.max(0, Math.floor((match.endsAt.getTime() - Date.now()) / 1000))
  }

  // Parse oracle verdict if present
  let oracleVerdict = null
  if (match.oracleVerdict) {
    try { oracleVerdict = JSON.parse(match.oracleVerdict) } catch {}
  }

  // Get latest frames if match is active (for spectators)
  let frames = null
  if (match.status === 'active') {
    frames = getFramesForMatch(matchId, match.agent1Id, match.agent2Id)
  }

  return NextResponse.json({
    match_id: match.id,
    status: match.status,
    task_description: match.taskDescription,
    start_url: match.startUrl,
    target_article: match.targetArticle,
    time_limit_seconds: match.timeLimitSeconds,
    time_remaining_seconds: timeRemaining,
    oracle_verdict: oracleVerdict,

    agent1: match.agent1 ? {
      agent_id: match.agent1.id,
      name: match.agent1.name,
      click_count: match.agent1Clicks,
      current_url: match.agent1LastUrl,
    } : null,

    agent2: match.agent2 ? {
      agent_id: match.agent2.id,
      name: match.agent2.name,
      click_count: match.agent2Clicks,
      current_url: match.agent2LastUrl,
    } : null,

    winner: match.winner ? {
      agent_id: match.winner.id,
      name: match.winner.name,
    } : null,

    started_at: match.startedAt?.toISOString() || null,
    ends_at: match.endsAt?.toISOString() || null,
    completed_at: match.completedAt?.toISOString() || null,

    // Include full frame data for polling fallback (when Socket.io doesn't work in production)
    frames: frames ? {
      agent1: frames.agent1 ? {
        frame: frames.agent1.frame,
        current_url: frames.agent1.currentUrl,
        click_count: frames.agent1.clickCount,
        timestamp: frames.agent1.timestamp,
        thought: frames.agent1.thought,
      } : null,
      agent2: frames.agent2 ? {
        frame: frames.agent2.frame,
        current_url: frames.agent2.currentUrl,
        click_count: frames.agent2.clickCount,
        timestamp: frames.agent2.timestamp,
        thought: frames.agent2.thought,
      } : null,
    } : null,
  })
}
