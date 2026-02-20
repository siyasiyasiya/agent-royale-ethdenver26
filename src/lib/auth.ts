import { NextRequest } from 'next/server'
import { prisma } from './db'

// Extract API key from Authorization header
export function getApiKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

// Validate API key and return agent
export async function getAgentFromApiKey(apiKey: string) {
  return prisma.agent.findUnique({
    where: { apiKey },
  })
}
