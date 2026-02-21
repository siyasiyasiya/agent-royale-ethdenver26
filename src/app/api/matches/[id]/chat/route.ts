import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { emitMatchEvent } from '@/lib/frames'

const MAX_MESSAGE_LENGTH = 280
const HISTORY_LIMIT = 100

// GET /api/matches/[id]/chat - Get recent chat messages for a match
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const messages = await prisma.chatMessage.findMany({
    where: { matchId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  })

  return NextResponse.json({
    messages: messages.reverse().map((msg) => ({
      id: msg.id,
      user: msg.user,
      message: msg.message,
      timestamp: msg.createdAt.getTime(),
    })),
  })
}

// POST /api/matches/[id]/chat - Persist and broadcast a chat message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params
  const body = await req.json().catch(() => null)

  const rawUser = typeof body?.user === 'string' ? body.user.trim() : ''
  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : ''

  if (!rawMessage) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message must be <= ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 })
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const user = rawUser || 'Viewer'

  const created = await prisma.chatMessage.create({
    data: {
      matchId,
      user: user.slice(0, 40),
      message: rawMessage,
    },
  })

  const payload = {
    id: created.id,
    user: created.user,
    message: created.message,
    timestamp: created.createdAt.getTime(),
  }

  emitMatchEvent(matchId, 'chat_message', payload)

  return NextResponse.json(payload, { status: 201 })
}
