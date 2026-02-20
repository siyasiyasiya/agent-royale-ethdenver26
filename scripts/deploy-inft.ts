/**
 * Deploy AgentArenaINFT contract to 0G Galileo Testnet (chain 16602)
 * Run: npx tsx scripts/deploy-inft.ts
 * Requires: ZERO_GRAVITY_PRIVATE_KEY in .env
 */
import { ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import * as solc from 'solc'
import 'dotenv/config'

const RPC_URL = 'https://evmrpc-testnet.0g.ai'
const CONTRACT_PATH = path.join(process.cwd(), 'contracts', 'AgentArenaINFT.sol')
const OZ_BASE = path.join(process.cwd(), 'node_modules', '@openzeppelin', 'contracts')

function compileContract() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8')

  const input = {
    language: 'Solidity',
    sources: {
      'AgentArenaINFT.sol': { content: source },
    },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode'] },
      },
      optimizer: { enabled: true, runs: 200 },
    },
  }

  // Resolve @openzeppelin imports from node_modules
  function findImports(importPath: string) {
    if (importPath.startsWith('@openzeppelin/')) {
      const resolved = path.join(process.cwd(), 'node_modules', importPath)
      if (fs.existsSync(resolved)) {
        return { contents: fs.readFileSync(resolved, 'utf8') }
      }
    }
    return { error: `File not found: ${importPath}` }
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }))

  if (output.errors) {
    const errors = output.errors.filter((e: { severity: string }) => e.severity === 'error')
    if (errors.length > 0) {
      console.error('Compilation errors:')
      errors.forEach((e: { formattedMessage: string }) => console.error(e.formattedMessage))
      process.exit(1)
    }
    // Print warnings
    output.errors
      .filter((e: { severity: string }) => e.severity === 'warning')
      .forEach((e: { formattedMessage: string }) => console.warn('Warning:', e.formattedMessage))
  }

  const contract = output.contracts['AgentArenaINFT.sol']['AgentArenaINFT']
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  }
}

async function main() {
  const privateKey = process.env.ZERO_GRAVITY_PRIVATE_KEY
  if (!privateKey) {
    console.error('ZERO_GRAVITY_PRIVATE_KEY not set in .env')
    process.exit(1)
  }

  console.log('Compiling AgentArenaINFT.sol...')
  const { abi, bytecode } = compileContract()
  console.log('Compilation successful')

  console.log(`Connecting to 0G testnet at ${RPC_URL}...`)
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(privateKey, provider)

  const balance = await provider.getBalance(wallet.address)
  console.log(`Deployer: ${wallet.address}`)
  console.log(`Balance: ${ethers.formatEther(balance)} A0GI`)

  if (balance === 0n) {
    console.error('No balance on 0G testnet. Get testnet tokens from the 0G faucet.')
    process.exit(1)
  }

  console.log('Deploying AgentArenaINFT...')
  const factory = new ethers.ContractFactory(abi, bytecode, wallet)
  const contract = await factory.deploy()
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log(`\n✅ AgentArenaINFT deployed to: ${address}`)
  console.log(`\nSet these environment variables on Railway:`)
  console.log(`  NEXT_PUBLIC_INFT_CONTRACT_ADDRESS=${address}`)
  console.log(`  PLATFORM_PRIVATE_KEY=${privateKey}`)
  console.log(`  ZG_RPC_URL=${RPC_URL}`)
  console.log(`\nExplorer: https://chainscan-galileo.0g.ai/address/${address}`)
}

main().catch(err => {
  console.error('Deploy failed:', err)
  process.exit(1)
})
