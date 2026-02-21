import 'dotenv/config'
import { ethers } from 'ethers'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const INFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS || ''
const PLATFORM_PRIVATE_KEY = process.env.PLATFORM_PRIVATE_KEY || ''
const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

const INFT_ABI = [
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'uri', type: 'string' },
      { name: 'claimCodeHash', type: 'bytes32' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
]

function hashClaimCode(claimCode: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(claimCode))
}

async function main() {
  console.log('=== Fix Missing iNFT Tokens ===\n')

  // Check environment
  if (!INFT_CONTRACT_ADDRESS) {
    console.error('NEXT_PUBLIC_INFT_CONTRACT_ADDRESS not set')
    process.exit(1)
  }
  if (!PLATFORM_PRIVATE_KEY) {
    console.error('PLATFORM_PRIVATE_KEY not set')
    process.exit(1)
  }

  console.log(`Contract: ${INFT_CONTRACT_ADDRESS}`)
  console.log(`RPC: ${RPC_URL}`)

  // Set up provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PLATFORM_PRIVATE_KEY, provider)
  console.log(`Wallet: ${wallet.address}`)

  // Check wallet balance
  const balance = await provider.getBalance(wallet.address)
  console.log(`Balance: ${ethers.formatEther(balance)} 0G\n`)

  if (balance === BigInt(0)) {
    console.error('Wallet has no balance! Fund it with testnet tokens.')
    process.exit(1)
  }

  // Check if contract exists
  const code = await provider.getCode(INFT_CONTRACT_ADDRESS)
  if (code === '0x') {
    console.error('No contract at this address! Check if deployment succeeded.')
    process.exit(1)
  }
  console.log('Contract exists at address ✓\n')

  // Get contract instance
  const contract = new ethers.Contract(INFT_CONTRACT_ADDRESS, INFT_ABI, wallet)

  // Get all agents with token IDs
  const agents = await prisma.agent.findMany({
    where: {
      inftTokenId: { not: null }
    },
    select: {
      id: true,
      name: true,
      inftTokenId: true,
      claimCodeHash: true,
    }
  })

  console.log(`Found ${agents.length} agents with token IDs in database\n`)

  let mintedCount = 0
  let existingCount = 0
  let errorCount = 0

  for (const agent of agents) {
    const tokenId = agent.inftTokenId!
    console.log(`Checking agent "${agent.name}" (token #${tokenId.slice(0, 10)}...)`)

    try {
      // Check if token exists by calling ownerOf
      await contract.ownerOf(BigInt(tokenId))
      console.log(`  ✓ Token exists on-chain`)
      existingCount++
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // Detect "Token does not exist" - can be string message, ERC721 error, or custom error 0x7e273289
      const isTokenMissing = errorMessage.includes('Token does not exist') ||
                             errorMessage.includes('ERC721') ||
                             errorMessage.includes('CALL_EXCEPTION') ||
                             errorMessage.includes('0x7e273289')
      if (isTokenMissing) {
        console.log(`  ✗ Token does not exist on-chain, minting...`)

        try {
          // Mint the missing token
          const metadataUri = `${BASE_URL}/api/agents/metadata/${agent.id}`
          const claimCodeHash = agent.claimCodeHash || ethers.ZeroHash

          const tx = await contract.mint(BigInt(tokenId), metadataUri, claimCodeHash)
          console.log(`  → Mint tx: ${tx.hash}`)
          await tx.wait()
          console.log(`  ✓ Minted successfully!`)
          mintedCount++
        } catch (mintError: unknown) {
          const mintErrorMsg = mintError instanceof Error ? mintError.message : String(mintError)
          console.error(`  ✗ Mint failed: ${mintErrorMsg}`)
          errorCount++
        }
      } else {
        console.error(`  ✗ Error checking token: ${errorMessage}`)
        errorCount++
      }
    }

    console.log('')
  }

  console.log('=== Summary ===')
  console.log(`Existing: ${existingCount}`)
  console.log(`Minted: ${mintedCount}`)
  console.log(`Errors: ${errorCount}`)

  await prisma.$disconnect()
}

main().catch(console.error)
