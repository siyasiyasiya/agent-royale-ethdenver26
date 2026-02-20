import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description, owner_wallet } = body

    // Validate required fields
    if (!name || !owner_wallet) {
      return NextResponse.json(
        { error: 'name and owner_wallet are required' },
        { status: 400 }
      )
    }

    // Generate API key for this agent
    const apiKey = `arena_${randomUUID()}`

    // Mock blockchain integrations (real implementation later)
    const inftTokenId = `0g_${randomUUID().slice(0, 8)}`
    const kiteWalletAddress = `0x${randomUUID().replace(/-/g, '').slice(0, 40)}`

    // Create agent in database
    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        ownerWallet: owner_wallet,
        apiKey,
        inftTokenId,
        kiteWalletAddress,
      },
    })

    // Return response matching the spec
    return NextResponse.json({
      agent_id: agent.id,
      inft_token_id: agent.inftTokenId,
      wallet: {
        address: agent.kiteWalletAddress,
        x402_endpoint: `https://api.kite.ai/x402/${agent.kiteWalletAddress}`,
      },
      api_key: agent.apiKey,
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Failed to register agent' },
      { status: 500 }
    )
  }
}
