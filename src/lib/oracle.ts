import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'
import { ethers } from 'ethers'
import OpenAI from 'openai'
import type { FrameData } from './frames'

const ZG_PROVIDER_ADDRESS = '0xa48f01287233509FD694a22Bf840225062E67836' // Galileo: qwen/qwen-2.5-7b-instruct
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'

const ORACLE_SYSTEM_PROMPT = `You are an impartial judge for a Wikipedia Speedrun competition. Two AI agents race to navigate from a starting Wikipedia article to a target article by clicking links only.

You will be given:
- The task (start article → target article)
- Each agent's full navigation path (every page they visited, in order)
- Each agent's final page and click count

Rules for judging:
- If an agent's path ends at the target article, they reached it
- If both reached it, the one with fewer clicks wins
- If neither reached it, judge who made better progress toward the target based on their path and final page
- Only declare a draw if both agents have clearly equivalent outcomes

Respond with ONLY valid JSON:
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

// Extract article title from Wikipedia URL
function extractArticle(url: string): string {
  const match = url.match(/\/wiki\/([^#?]+)/)
  return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : url
}

// Build path summary from frame history
function buildPath(frames: FrameData[]): string {
  if (!frames.length) return 'No navigation recorded'
  // Deduplicate consecutive same URLs
  const deduped: string[] = []
  for (const f of frames) {
    const article = extractArticle(f.currentUrl)
    if (deduped[deduped.length - 1] !== article) {
      deduped.push(article)
    }
  }
  return deduped.join(' → ')
}

function buildUserMessage(input: OracleInput): string {
  const path1 = input.agent1.frames?.length
    ? buildPath(input.agent1.frames)
    : (input.agent1.lastUrl ? extractArticle(input.agent1.lastUrl) : 'unknown')

  const path2 = input.agent2.frames?.length
    ? buildPath(input.agent2.frames)
    : (input.agent2.lastUrl ? extractArticle(input.agent2.lastUrl) : 'unknown')

  return `Task: ${input.taskDescription}
Target article: ${input.targetArticle}

Agent 1 (${input.agent1.name}):
- Navigation path: ${path1}
- Total clicks: ${input.agent1.clickCount}
- Final page: ${input.agent1.lastUrl ? extractArticle(input.agent1.lastUrl) : 'unknown'}

Agent 2 (${input.agent2.name}):
- Navigation path: ${path2}
- Total clicks: ${input.agent2.clickCount}
- Final page: ${input.agent2.lastUrl ? extractArticle(input.agent2.lastUrl) : 'unknown'}

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

// Simple URL-based verification using final URL
function simpleUrlVerdict(input: OracleInput): OracleVerdict {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = normalize(input.targetArticle)

  const getArticle = (url: string) => {
    const match = url.match(/\/wiki\/([^#?]+)/)
    return match ? normalize(decodeURIComponent(match[1])) : ''
  }

  // Check frame history for target — agent must have actually visited target page
  const agent1Reached = input.agent1.frames?.length
    ? input.agent1.frames.some(f => getArticle(f.currentUrl) === target)
    : getArticle(input.agent1.lastUrl ?? '') === target

  const agent2Reached = input.agent2.frames?.length
    ? input.agent2.frames.some(f => getArticle(f.currentUrl) === target)
    : getArticle(input.agent2.lastUrl ?? '') === target

  if (agent1Reached && agent2Reached) {
    if (input.agent1.clickCount < input.agent2.clickCount) {
      return { winner: 'agent1', winnerId: input.agent1.agentId, reasoning: `Both reached ${input.targetArticle}. ${input.agent1.name} wins with fewer clicks (${input.agent1.clickCount} vs ${input.agent2.clickCount}).` }
    } else if (input.agent2.clickCount < input.agent1.clickCount) {
      return { winner: 'agent2', winnerId: input.agent2.agentId, reasoning: `Both reached ${input.targetArticle}. ${input.agent2.name} wins with fewer clicks (${input.agent2.clickCount} vs ${input.agent1.clickCount}).` }
    } else {
      return { winner: 'draw', winnerId: null, reasoning: `Both reached ${input.targetArticle} with the same number of clicks. Draw.` }
    }
  } else if (agent1Reached) {
    return { winner: 'agent1', winnerId: input.agent1.agentId, reasoning: `${input.agent1.name} reached ${input.targetArticle} in ${input.agent1.clickCount} clicks. ${input.agent2.name} did not reach the target.` }
  } else if (agent2Reached) {
    return { winner: 'agent2', winnerId: input.agent2.agentId, reasoning: `${input.agent2.name} reached ${input.targetArticle} in ${input.agent2.clickCount} clicks. ${input.agent1.name} did not reach the target.` }
  } else {
    return { winner: 'draw', winnerId: null, reasoning: `Neither agent reached ${input.targetArticle}. Draw.` }
  }
}

export async function runOracle(input: OracleInput): Promise<OracleVerdict> {
  // First try URL/path verification — fast and reliable
  const simpleVerdict = simpleUrlVerdict(input)

  // If we have a clear winner from path matching, use it
  if (simpleVerdict.winner !== 'draw') {
    console.log('[oracle] Path verdict:', simpleVerdict)
    return simpleVerdict
  }

  // Neither reached target — use 0G compute to judge who made better progress
  // Pass the full navigation path from frame history
  if (!process.env.ZERO_GRAVITY_PRIVATE_KEY) {
    console.log('[oracle] No 0G key, using path verdict (draw)')
    return simpleVerdict
  }

  try {
    console.log('[oracle] Connecting to 0G compute to judge navigation paths...')
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
    return parseVerdict(text, input)
  } catch (err) {
    console.error('[oracle] 0G compute failed:', err)
    return simpleVerdict
  }
}
