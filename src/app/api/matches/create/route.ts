import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/matches/create - Create a competition from the UI (no agent required)
export async function POST(req: NextRequest) {
  const body = await req.json()

  const taskDescription = body.task_description?.trim()
  if (!taskDescription) {
    return NextResponse.json({ error: 'task_description is required' }, { status: 400 })
  }

  const startUrl = body.start_url?.trim() || ''
  const timeLimitSeconds = Number(body.time_limit_seconds) || 300

  const match = await prisma.match.create({
    data: {
      status: 'waiting_for_opponent',
      taskDescription,
      startUrl,
      timeLimitSeconds,
      entryFee: 0,
      prizePool: 0,
      agent1Id: null,
      agent2Id: null,
    },
  })

  return NextResponse.json({ match_id: match.id })
}
