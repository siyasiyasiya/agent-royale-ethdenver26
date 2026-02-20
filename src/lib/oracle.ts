import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'
import { ethers } from 'ethers'
import OpenAI from 'openai'

const ZG_PROVIDER_ADDRESS = '0xf07240Efa67755B5311bc75784a061eDB47165Dd'
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'

const ORACLE_SYSTEM_PROMPT = `You are an impartial judge for a Wikipedia Speedrun competition. Two AI agents race to navigate from a starting Wikipedia article to a target article by clicking links only.

You will be given:
- The task (start article → target article)
- Each agent's final URL and click count

Rules for judging:
- If an agent's final URL matches the target article, they win
- If both reached it, the one with fewer clicks wins
- If neither reached it, judge who made better progress toward the target based on their final URL topic
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
  }
  agent2: {
    agentId: string
    name: string
    clickCount: number
    lastUrl: string | null
  }
}

export interface OracleVerdict {
  winner: 'agent1' | 'agent2' | 'draw'
  winnerId: string | null
  reasoning: string
}

function buildUserMessage(input: OracleInput): string {
  return `Task: ${input.taskDescription}
Target article: ${input.targetArticle}

Agent 1 (${input.agent1.name}):
- Final URL: ${input.agent1.lastUrl ?? 'unknown'}
- Clicks: ${input.agent1.clickCount}

Agent 2 (${input.agent2.name}):
- Final URL: ${input.agent2.lastUrl ?? 'unknown'}
- Clicks: ${input.agent2.clickCount}

Who won?`
}

function parseVerdict(text: string, input: OracleInput): OracleVerdict {
  try {
    // Extract JSON from response (in case model wraps it in markdown)
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

// Simple URL-based verification (fallback when 0G unavailable)
function simpleUrlVerdict(input: OracleInput): OracleVerdict {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = normalize(input.targetArticle)

  const url1 = input.agent1.lastUrl ?? ''
  const url2 = input.agent2.lastUrl ?? ''

  // Extract article name from URL
  const getArticle = (url: string) => {
    const match = url.match(/\/wiki\/([^#?]+)/)
    return match ? normalize(decodeURIComponent(match[1])) : ''
  }

  const article1 = getArticle(url1)
  const article2 = getArticle(url2)

  const agent1Reached = article1 === target
  const agent2Reached = article2 === target

  if (agent1Reached && agent2Reached) {
    // Both reached - fewer clicks wins
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
  // First try simple URL verification - fast and reliable
  const simpleVerdict = simpleUrlVerdict(input)

  // If we have a clear winner from URL matching, use it
  if (simpleVerdict.winner !== 'draw') {
    console.log('[oracle] Simple URL verdict:', simpleVerdict)
    return simpleVerdict
  }

  // If no clear winner, try 0G compute for smarter judgment
  if (!process.env.ZERO_GRAVITY_PRIVATE_KEY) {
    console.log('[oracle] No 0G key, using simple verdict')
    return simpleVerdict
  }

  try {
    console.log('[oracle] Connecting to 0G compute for edge case...')
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
    // Fall back to simple verdict
    return simpleVerdict
  }
}
