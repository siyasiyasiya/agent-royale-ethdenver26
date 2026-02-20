import Anthropic from '@anthropic-ai/sdk'

const ORACLE_SYSTEM_PROMPT = `You are an impartial judge for an AI agent competition. You will be shown the task description and evidence from both agents (screenshots and metadata). You must decide who completed the task better, or declare a draw.

Respond with ONLY valid JSON matching this schema:
{
  "winner": "agent1" | "agent2" | "draw",
  "reasoning": "<1-3 sentences explaining the decision>",
  "confidence": "high" | "medium"
}

Rules:
- Base your judgment primarily on the screenshot evidence.
- If one agent's screenshot clearly shows better task completion, pick that agent.
- If screenshots are inconclusive or unavailable, use click count and URL as secondary signals (fewer clicks for the same result is better).
- Declare a draw only if both agents achieved equivalent outcomes.
- Never pick a winner based solely on who claimed victory first.`

export interface OracleInput {
  taskDescription: string
  agent1: {
    agentId: string
    name: string
    clickCount: number
    lastUrl: string | null
    frameBase64: string | null
  }
  agent2: {
    agentId: string
    name: string
    clickCount: number
    lastUrl: string | null
    frameBase64: string | null
  }
}

export interface OracleVerdict {
  winner: 'agent1' | 'agent2' | 'draw'
  winnerId: string | null
  reasoning: string
  confidence: 'high' | 'medium'
}

function buildUserContent(input: OracleInput): Anthropic.Messages.ContentBlockParam[] {
  const blocks: Anthropic.Messages.ContentBlockParam[] = []

  blocks.push({
    type: 'text',
    text: `Task: ${input.taskDescription}\n\nAgent 1: ${input.agent1.name}\n- Clicks: ${input.agent1.clickCount}\n- Final URL: ${input.agent1.lastUrl ?? 'unknown'}\n- Final screenshot:`,
  })

  if (input.agent1.frameBase64) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: input.agent1.frameBase64 },
    })
  } else {
    blocks.push({ type: 'text', text: '(no screenshot available)' })
  }

  blocks.push({
    type: 'text',
    text: `\nAgent 2: ${input.agent2.name}\n- Clicks: ${input.agent2.clickCount}\n- Final URL: ${input.agent2.lastUrl ?? 'unknown'}\n- Final screenshot:`,
  })

  if (input.agent2.frameBase64) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: input.agent2.frameBase64 },
    })
  } else {
    blocks.push({ type: 'text', text: '(no screenshot available)' })
  }

  blocks.push({ type: 'text', text: '\nWho completed the task better?' })

  return blocks
}

export async function runOracle(input: OracleInput): Promise<OracleVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[oracle] ANTHROPIC_API_KEY not set — defaulting to draw')
    return {
      winner: 'draw',
      winnerId: null,
      reasoning: 'Oracle unavailable (no API key). Match declared a draw.',
      confidence: 'medium',
    }
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 512,
      system: ORACLE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserContent(input) }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text)

    const winner: 'agent1' | 'agent2' | 'draw' =
      parsed.winner === 'agent1' ? 'agent1'
      : parsed.winner === 'agent2' ? 'agent2'
      : 'draw'

    return {
      winner,
      winnerId:
        winner === 'agent1' ? input.agent1.agentId
        : winner === 'agent2' ? input.agent2.agentId
        : null,
      reasoning: String(parsed.reasoning ?? 'No reasoning provided.'),
      confidence: parsed.confidence === 'high' ? 'high' : 'medium',
    }
  } catch (err) {
    console.error('[oracle] Failed:', err)
    return {
      winner: 'draw',
      winnerId: null,
      reasoning: 'Oracle failed to produce a verdict. Match declared a draw.',
      confidence: 'medium',
    }
  }
}
