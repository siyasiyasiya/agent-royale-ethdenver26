/**
 * Test iNFT Registration, Minting, and Claiming Flow
 *
 * Run: npx tsx scripts/test-inft-flow.ts
 *
 * Tests:
 * 1. Register agent via API → iNFT minted on-chain
 * 2. Verify iNFT exists with correct initial stats
 * 3. Test stats update (simulate match win)
 * 4. Verify updated stats on-chain
 */
import { ethers } from 'ethers'
import 'dotenv/config'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai'
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_INFT_CONTRACT_ADDRESS

const INFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getStats(uint256 tokenId) view returns (uint256 wins, uint256 losses, uint256 draws, uint256 bestClickCount, uint256 eloRating)',
  'function isUnclaimed(uint256 tokenId) view returns (bool)',
  'function tokenExists(uint256 tokenId) view returns (bool)',
  'function updateStats(uint256 tokenId, uint256 wins, uint256 losses, uint256 draws, uint256 bestClickCount, uint256 eloRating)',
]

interface RegistrationResponse {
  agent_id: string
  name: string
  inft_token_id: string | null
  api_key: string
  claim_url: string
  profile_url: string
  message: string
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Agent Arena iNFT Flow Test')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log()

  // Check configuration
  if (!CONTRACT_ADDRESS) {
    console.error('❌ NEXT_PUBLIC_INFT_CONTRACT_ADDRESS not set in .env')
    process.exit(1)
  }

  const privateKey = process.env.PLATFORM_PRIVATE_KEY
  if (!privateKey) {
    console.error('❌ PLATFORM_PRIVATE_KEY not set in .env')
    process.exit(1)
  }

  console.log(`📋 Contract: ${CONTRACT_ADDRESS}`)
  console.log(`🌐 RPC: ${RPC_URL}`)
  console.log(`🔗 API: ${API_BASE}`)
  console.log()

  // Setup provider and contract
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, INFT_ABI, wallet)

  // Check balance
  const balance = await provider.getBalance(wallet.address)
  console.log(`💰 Platform wallet: ${wallet.address}`)
  console.log(`💰 Balance: ${ethers.formatEther(balance)} A0GI`)
  console.log()

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Register agent via API
  // ═══════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('TEST 1: Register Agent + Mint iNFT')
  console.log('─────────────────────────────────────────────────────────────────')

  const agentName = `TestAgent_${Date.now()}`
  console.log(`📝 Registering agent: ${agentName}`)

  const registerRes = await fetch(`${API_BASE}/api/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: agentName,
      description: 'Test agent for iNFT flow verification',
    }),
  })

  if (!registerRes.ok) {
    const error = await registerRes.text()
    console.error(`❌ Registration failed: ${error}`)
    process.exit(1)
  }

  const registration: RegistrationResponse = await registerRes.json()
  console.log()
  console.log(`✅ Agent registered!`)
  console.log(`   Agent ID: ${registration.agent_id}`)
  console.log(`   iNFT Token ID: ${registration.inft_token_id || 'NOT MINTED'}`)
  console.log(`   API Key: ${registration.api_key.slice(0, 20)}...`)
  console.log(`   Claim URL: ${registration.claim_url}`)
  console.log()

  if (!registration.inft_token_id) {
    console.error('❌ iNFT was not minted! Check contract deployment and platform wallet.')
    process.exit(1)
  }

  const tokenId = BigInt(registration.inft_token_id)

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Verify iNFT on-chain
  // ═══════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('TEST 2: Verify iNFT On-Chain')
  console.log('─────────────────────────────────────────────────────────────────')

  // Check owner
  const owner = await contract.ownerOf(tokenId)
  const isUnclaimed = await contract.isUnclaimed(tokenId)
  console.log(`👤 Owner: ${owner}`)
  console.log(`🔒 Unclaimed: ${isUnclaimed}`)

  if (owner.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
    console.log(`⚠️  Note: Token is already claimed by ${owner}`)
  } else {
    console.log(`✅ Token is held by contract (ready for claiming)`)
  }

  // Check metadata URI
  const uri = await contract.tokenURI(tokenId)
  console.log(`📄 Metadata URI: ${uri}`)

  // Check initial stats
  const stats = await contract.getStats(tokenId)
  console.log()
  console.log(`📊 On-Chain Stats:`)
  console.log(`   Wins: ${stats[0]}`)
  console.log(`   Losses: ${stats[1]}`)
  console.log(`   Draws: ${stats[2]}`)
  console.log(`   Best Click Count: ${stats[3]}`)
  console.log(`   Elo Rating: ${stats[4]}`)

  if (stats[4] !== 1200n) {
    console.error(`❌ Initial Elo should be 1200, got ${stats[4]}`)
    process.exit(1)
  }
  console.log(`✅ Initial stats correct (Elo = 1200)`)
  console.log()

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Update stats (simulate match win)
  // ═══════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('TEST 3: Update Stats (Simulate Match Win)')
  console.log('─────────────────────────────────────────────────────────────────')

  console.log(`📤 Updating stats: 1 win, 0 losses, Elo 1216, best clicks 8`)

  const tx = await contract.updateStats(
    tokenId,
    1n,      // wins
    0n,      // losses
    0n,      // draws
    8n,      // bestClickCount
    1216n    // eloRating (after win)
  )
  console.log(`⏳ Transaction: ${tx.hash}`)
  console.log(`⏳ Waiting for confirmation...`)

  const receipt = await tx.wait()
  console.log(`✅ Confirmed in block ${receipt.blockNumber}`)
  console.log()

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Verify updated stats
  // ═══════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('TEST 4: Verify Updated Stats')
  console.log('─────────────────────────────────────────────────────────────────')

  const updatedStats = await contract.getStats(tokenId)
  console.log(`📊 Updated On-Chain Stats:`)
  console.log(`   Wins: ${updatedStats[0]}`)
  console.log(`   Losses: ${updatedStats[1]}`)
  console.log(`   Draws: ${updatedStats[2]}`)
  console.log(`   Best Click Count: ${updatedStats[3]}`)
  console.log(`   Elo Rating: ${updatedStats[4]}`)

  let allPassed = true
  if (updatedStats[0] !== 1n) {
    console.error(`❌ Wins should be 1, got ${updatedStats[0]}`)
    allPassed = false
  }
  if (updatedStats[3] !== 8n) {
    console.error(`❌ Best click count should be 8, got ${updatedStats[3]}`)
    allPassed = false
  }
  if (updatedStats[4] !== 1216n) {
    console.error(`❌ Elo should be 1216, got ${updatedStats[4]}`)
    allPassed = false
  }

  console.log()
  console.log('═══════════════════════════════════════════════════════════════')
  if (allPassed) {
    console.log('  ✅ ALL TESTS PASSED!')
  } else {
    console.log('  ❌ SOME TESTS FAILED')
  }
  console.log('═══════════════════════════════════════════════════════════════')
  console.log()

  // Summary
  console.log('📋 Summary:')
  console.log(`   Agent: ${agentName}`)
  console.log(`   Agent ID: ${registration.agent_id}`)
  console.log(`   iNFT Token ID: ${registration.inft_token_id}`)
  console.log(`   Claim URL: ${registration.claim_url}`)
  console.log()
  console.log(`🔍 View on explorer:`)
  console.log(`   https://chainscan-galileo.0g.ai/address/${CONTRACT_ADDRESS}`)
  console.log()
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
