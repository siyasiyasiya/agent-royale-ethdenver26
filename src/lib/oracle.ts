import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'
import { ethers } from 'ethers'
import OpenAI from 'openai'
import type { FrameData } from './frames'

const ZG_PROVIDER_ADDRESS = '0xa48f01287233509FD694a22Bf840225062E67836' // Galileo: qwen/qwen-2.5-7b-instruct
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'

const ORACLE_SYSTEM_PROMPT = `You are an impartial judge for a Wikipedia Speedrun competition. Two AI agents race to navigate from a starting Wikipedia article to a target article by clicking links only.

You will be given:
- The task (start article → target article)
- Each agent's final Wikipedia page and click count

Rules for judging:
- If an agent's final page matches the target article, they reached it and win
- If both reached it, the one with fewer clicks wins
- If neither reached it, judge who made better progress toward the target based on their final page topic
- Only declare a draw if both agents have clearly equivalent outcomes

Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{
  "winner": "agent1" | "agent2" | "draw",
  "reasoning": "<1-3 sentences explaining the decision>"
}`

export interface OracleInput {
  taskDescription: string
  targetArticle: string
  agent1: {
    agentId: string
    name: string
    clickCount: number
    lastUrl: string | null
    frames?: FrameData[]
  }
  agent2: {
    agentId: string
    name: string
    clickCount: number
    lastUrl: string | null
    frames?: FrameData[]
  }
}

export interface OracleVerdict {
  winner: 'agent1' | 'agent2' | 'draw'
  winnerId: string | null
  reasoning: string
}

// Extract readable article title from Wikipedia URL
function extractArticle(url: string | null): string {
  if (!url) return 'unknown'
  const match = url.match(/\/wiki\/([^#?]+)/)
  return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : url
}

function buildUserMessage(input: OracleInput): string {
  const final1 = extractArticle(input.agent1.lastUrl)
  const final2 = extractArticle(input.agent2.lastUrl)

  return `Task: ${input.taskDescription}
Target article: ${input.targetArticle}

Agent 1 (${input.agent1.name}):
- Final page: ${final1}
- Total clicks: ${input.agent1.clickCount}

Agent 2 (${input.agent2.name}):
- Final page: ${final2}
- Total clicks: ${input.agent2.clickCount}

Who won?`
}

function parseVerdict(text: string, input: OracleInput): OracleVerdict {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)

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
    }
  } catch {
    console.error('[oracle] Failed to parse verdict:', text)
    return {
      winner: 'draw',
      winnerId: null,
      reasoning: 'Oracle returned an unparseable response. Match declared a draw.',
    }
  }
}

async function get0GClient() {
  const privateKey = process.env.ZERO_GRAVITY_PRIVATE_KEY
  if (!privateKey) throw new Error('ZERO_GRAVITY_PRIVATE_KEY not set')

  const provider = new ethers.JsonRpcProvider(ZG_RPC)
  const wallet = new ethers.Wallet(privateKey, provider)
  const broker = await createZGComputeNetworkBroker(wallet)

  const { endpoint, model } = await broker.inference.getServiceMetadata(ZG_PROVIDER_ADDRESS)
  const headers = await broker.inference.getRequestHeaders(ZG_PROVIDER_ADDRESS, model)

  const client = new OpenAI({
    baseURL: endpoint,
    apiKey: 'unused',
    defaultHeaders: headers as unknown as Record<string, string>,
  })

  return { client, model }
}

// URL-based fallback — only used if 0G compute errors
function urlFallbackVerdict(input: OracleInput): OracleVerdict {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = normalize(input.targetArticle)

  const getArticle = (url: string | null) => {
    if (!url) return ''
    const match = url.match(/\/wiki\/([^#?]+)/)
    return match ? normalize(decodeURIComponent(match[1])) : ''
  }

  const agent1Reached = getArticle(input.agent1.lastUrl) === target
  const agent2Reached = getArticle(input.agent2.lastUrl) === target

  if (agent1Reached && agent2Reached) {
    if (input.agent1.clickCount < input.agent2.clickCount) {
      return { winner: 'agent1', winnerId: input.agent1.agentId, reasoning: `Both reached ${input.targetArticle}. ${input.agent1.name} wins with fewer clicks.` }
    } else if (input.agent2.clickCount < input.agent1.clickCount) {
      return { winner: 'agent2', winnerId: input.agent2.agentId, reasoning: `Both reached ${input.targetArticle}. ${input.agent2.name} wins with fewer clicks.` }
    }
    return { winner: 'draw', winnerId: null, reasoning: `Both reached ${input.targetArticle} with equal clicks. Draw.` }
  } else if (agent1Reached) {
    return { winner: 'agent1', winnerId: input.agent1.agentId, reasoning: `${input.agent1.name} reached ${input.targetArticle}. ${input.agent2.name} did not.` }
  } else if (agent2Reached) {
    return { winner: 'agent2', winnerId: input.agent2.agentId, reasoning: `${input.agent2.name} reached ${input.targetArticle}. ${input.agent1.name} did not.` }
  }
  return { winner: 'draw', winnerId: null, reasoning: `Neither agent reached ${input.targetArticle}. Draw.` }
}

export async function runOracle(input: OracleInput): Promise<OracleVerdict> {
  console.log('[oracle] Calling 0G compute oracle...')

  try {
    const { client, model } = await get0GClient()

    const response = await client.chat.completions.create({
      model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: ORACLE_SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(input) },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    console.log('[oracle] 0G verdict raw:', text)
    const verdict = parseVerdict(text, input)
    console.log('[oracle] 0G verdict parsed:', verdict)
    return verdict
  } catch (err) {
    console.error('[oracle] 0G compute failed, falling back to URL check:', err)
    return urlFallbackVerdict(input)
  }
}
