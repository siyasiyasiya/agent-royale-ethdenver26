import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getContract, INFT_CONTRACT_ADDRESS } from '@/lib/contract'
import { ethers } from 'ethers'

// POST /api/agents/claim - Process claim after on-chain transaction
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { claim_code, wallet_address } = body

    if (!claim_code || !wallet_address) {
      return NextResponse.json(
        { error: 'claim_code and wallet_address are required' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!ethers.isAddress(wallet_address)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    // Find agent by claim code
    const agent = await prisma.agent.findUnique({
      where: { claimCode: claim_code },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Invalid claim code' }, { status: 404 })
    }

    if (agent.claimed) {
      return NextResponse.json({
        error: 'Agent already claimed',
        claimed_by: agent.claimedBy,
      }, { status: 400 })
    }

    // Verify on-chain claim if contract is deployed
    if (INFT_CONTRACT_ADDRESS && agent.inftTokenId) {
      try {
        const contract = getContract()
        const owner = await contract.ownerOf(agent.inftTokenId)

        // Check if the wallet now owns the token (claim happened on-chain)
        if (owner.toLowerCase() !== wallet_address.toLowerCase()) {
          // Token still owned by contract or someone else
          const isUnclaimed = await contract.isUnclaimed(agent.inftTokenId)
          if (isUnclaimed) {
            return NextResponse.json({
              error: 'On-chain claim not yet completed. Please complete the claim transaction first.',
              hint: 'Call the claim() function on the contract with your claim code.',
            }, { status: 400 })
          } else {
            return NextResponse.json({
              error: 'Token is owned by a different wallet',
              current_owner: owner,
            }, { status: 400 })
          }
        }
      } catch (contractError) {
        console.error('[Claim] Contract verification failed:', contractError)
        // Continue anyway if contract check fails - maybe contract not deployed
      }
    }

    // Update database
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        claimed: true,
        claimedAt: new Date(),
        claimedBy: wallet_address.toLowerCase(),
        // Clear claim code for security (optional - keeps it for reference)
        // claimCode: null,
      },
    })

    return NextResponse.json({
      success: true,
      agent_id: updatedAgent.id,
      name: updatedAgent.name,
      claimed_by: updatedAgent.claimedBy,
      claimed_at: updatedAgent.claimedAt?.toISOString(),
      message: 'Agent successfully claimed! You now own this agent.',
    })
  } catch (error) {
    console.error('Claim error:', error)
    return NextResponse.json(
      { error: 'Failed to process claim' },
      { status: 500 }
    )
  }
}
