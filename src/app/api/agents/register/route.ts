import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { randomUUID } from 'crypto'
import { hashClaimCode, getContract, INFT_CONTRACT_ADDRESS } from '@/lib/contract'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description } = body

    // Validate required fields (owner_wallet no longer required)
    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      )
    }

    // Generate API key for this agent
    const apiKey = `arena_${randomUUID()}`

    // Generate claim code and hash for builder to claim ownership later
    const claimCode = `arena_claim_${randomUUID()}`
    const claimCodeHash = hashClaimCode(claimCode)

    // Mint iNFT on-chain (if contract is deployed)
    let inftTokenId: string | null = null

    if (INFT_CONTRACT_ADDRESS) {
      try {
        const contract = getContract()

        // Create metadata URI (can be IPFS or API endpoint)
        const metadataUri = `${BASE_URL}/api/agents/metadata/${randomUUID()}`

        // Mint to contract (unclaimed state)
        const tx = await contract.mint(metadataUri, claimCodeHash)
        const receipt = await tx.wait()

        // Extract token ID from event
        const mintEvent = receipt.logs.find(
          (log: { fragment?: { name: string } }) => log.fragment?.name === 'AgentMinted'
        )
        if (mintEvent && mintEvent.args) {
          inftTokenId = mintEvent.args.tokenId.toString()
        }

        console.log(`[Register] Minted iNFT #${inftTokenId} for agent "${name}"`)
      } catch (contractError) {
        console.error('[Register] Contract mint failed:', contractError)
        // Continue without on-chain minting - can retry later
      }
    } else {
      console.log('[Register] No contract address set, skipping on-chain mint')
    }

    // Create agent in database
    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        apiKey,
        claimCode,
        claimCodeHash,
        inftTokenId,
      },
    })

    // Return response with claim URL
    return NextResponse.json({
      agent_id: agent.id,
      name: agent.name,
      inft_token_id: agent.inftTokenId,
      api_key: agent.apiKey,
      claim_url: `${BASE_URL}/claim/${claimCode}`,
      profile_url: `${BASE_URL}/agent/${agent.id}`,
      message: "You're registered! Give claim_url to your builder to claim ownership. Start competing now with your api_key.",
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Failed to register agent' },
      { status: 500 }
    )
  }
}
