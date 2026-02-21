// IMPORTANT: Must be 'nodejs' runtime, NOT the default Edge runtime.
// This route calls emitMatchEvent() which uses global.io (the Socket.io server
// instance attached to the custom Node.js HTTP server in server.js).
// Next.js Edge runtime runs in a separate V8 isolate that does NOT share global
// memory with server.js — so global.io would be undefined and all Socket.io
// broadcasts (match_paired, match_start events) would silently fail.
// Without this, the match page never receives real-time events and spectators
// see a frozen screen until they manually refresh.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getApiKey, getAgentFromApiKey } from '@/lib/auth'
import { emitMatchEvent } from '@/lib/frames'

interface Prompt {
  startArticle: string
  targetArticle: string
}

function pickRandomPrompt(prompts: Prompt[]): Prompt {
  return prompts[Math.floor(Math.random() * prompts.length)]
}

function buildTaskDescription(prompt: Prompt): string {
  const startName = decodeURIComponent(prompt.startArticle.split('/wiki/')[1] ?? prompt.startArticle)
    .replace(/_/g, ' ')
  return `Wikipedia Speedrun: Navigate from "${startName}" to "${prompt.targetArticle}" by clicking article links only. No search, no back button.`
}

// POST /api/matches/queue - Join matchmaking queue for a specific competition type
export async function POST(req: NextRequest) {
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
  const competitionTypeSlug: string | undefined = body.competition_type_slug

  if (!competitionTypeSlug) {
    return NextResponse.json({ error: 'competition_type_slug is required' }, { status: 400 })
  }

  if (agentId !== agent.id) {
    return NextResponse.json({ error: 'agent_id does not match API key' }, { status: 403 })
  }

  // Validate competition type
  const competitionType = await prisma.competitionType.findFirst({
    where: { slug: competitionTypeSlug, active: true },
  })
  if (!competitionType) {
    return NextResponse.json({ error: `Competition type "${competitionTypeSlug}" not found` }, { status: 400 })
  }

  let prompts: Prompt[] = []
  try {
    prompts = JSON.parse(competitionType.prompts) as Prompt[]
  } catch {
    return NextResponse.json({ error: 'Competition type prompts are invalid' }, { status: 500 })
  }

  if (prompts.length === 0) {
    return NextResponse.json({ error: 'Competition type has no prompts configured' }, { status: 500 })
  }

  // Check if agent is already in an active/waiting match
  const existingMatch = await prisma.match.findFirst({
    where: {
      OR: [
        { agent1Id: agentId, status: { in: ['waiting_for_opponent', 'active', 'judging'] } },
        { agent2Id: agentId, status: { in: ['waiting_for_opponent', 'active', 'judging'] } },
      ],
    },
  })

  if (existingMatch) {
    return NextResponse.json({
      error: 'Already in a match',
      match_id: existingMatch.id,
      status: existingMatch.status,
    }, { status: 400 })
  }

  // Look for a waiting match for this competition type with an open slot
  const waitingMatch = await prisma.match.findFirst({
    where: {
      status: 'waiting_for_opponent',
      competitionTypeId: competitionType.id,
      agent2Id: null,
      OR: [
        { agent1Id: null },
        { agent1Id: { not: agentId } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  if (waitingMatch) {
    // Slot 1 empty — fill it and keep waiting
    if (!waitingMatch.agent1Id) {
      await prisma.match.update({
        where: { id: waitingMatch.id },
        data: { agent1Id: agentId },
      })

      return NextResponse.json({
        match_id: waitingMatch.id,
        status: 'waiting_for_opponent',
        task_description: waitingMatch.taskDescription,
        start_url: waitingMatch.startUrl,
        target_article: waitingMatch.targetArticle,
        time_limit_seconds: waitingMatch.timeLimitSeconds,
        message: 'Joined as agent 1. Waiting for opponent.',
      })
    }

    // Slot 1 taken — fill slot 2 and move to ready_check (fair start)
    const match = await prisma.match.update({
      where: { id: waitingMatch.id },
      data: {
        agent2Id: agentId,
        status: 'ready_check',
        // Clear any stale ready flags
        agent1Ready: false,
        agent2Ready: false,
      },
      include: {
        agent1: { select: { id: true, name: true } },
        agent2: { select: { id: true, name: true } },
      },
    })

    emitMatchEvent(match.id, 'match_paired', {
      agent1: { agent_id: match.agent1!.id, name: match.agent1!.name },
      agent2: { agent_id: match.agent2!.id, name: match.agent2!.name },
      task_description: match.taskDescription,
      start_url: match.startUrl,
      target_article: match.targetArticle,
      time_limit_seconds: match.timeLimitSeconds,
      message: 'Both agents paired. Signal ready to start the match.',
    })

    return NextResponse.json({
      match_id: match.id,
      status: match.status,
      task_description: match.taskDescription,
      start_url: match.startUrl,
      target_article: match.targetArticle,
      time_limit_seconds: match.timeLimitSeconds,
      opponent: { agent_id: match.agent1!.id, name: match.agent1!.name },
      message: 'Paired with opponent. Signal ready to start the match.',
    })
  }

  // No waiting match — create one with this agent as agent1, pick random prompt
  const prompt = pickRandomPrompt(prompts)
  const taskDescription = buildTaskDescription(prompt)
  const startUrl = `https://en.wikipedia.org${prompt.startArticle}`

  const match = await prisma.match.create({
    data: {
      competitionTypeId: competitionType.id,
      agent1Id: agentId,
      status: 'waiting_for_opponent',
      taskDescription,
      startUrl,
      targetArticle: prompt.targetArticle,
      timeLimitSeconds: competitionType.timeLimitSeconds,
    },
  })

  return NextResponse.json({
    match_id: match.id,
    status: match.status,
    task_description: match.taskDescription,
    start_url: match.startUrl,
    target_article: match.targetArticle,
    time_limit_seconds: match.timeLimitSeconds,
    message: 'Waiting for opponent. Match will start when another agent joins.',
  })
}
