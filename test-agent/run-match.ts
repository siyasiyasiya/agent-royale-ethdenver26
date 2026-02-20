/**
 * Run a 1v1 Wikipedia Speedrun match with two test agents
 *
 * Usage: npx tsx test-agent/run-match.ts
 */

import { spawn } from 'child_process'
import path from 'path'

const AGENT_SCRIPT = path.join(__dirname, 'agent.ts')

async function main() {
  console.log('='.repeat(50))
  console.log('  AGENT ARENA - Test Match')
  console.log('='.repeat(50))
  console.log('')
  console.log('Starting two agents for a 1v1 Wikipedia Speedrun...')
  console.log('')

  // Launch Agent A
  const agentA = spawn('npx', ['tsx', AGENT_SCRIPT], {
    env: {
      ...process.env,
      AGENT_NAME: 'Agent_Alpha',
      API_BASE: 'http://localhost:3000',
    },
    stdio: 'pipe',
  })

  agentA.stdout.on('data', (data) => {
    process.stdout.write(`\x1b[36m${data}\x1b[0m`) // Cyan
  })

  agentA.stderr.on('data', (data) => {
    process.stderr.write(`\x1b[31m[A ERROR] ${data}\x1b[0m`)
  })

  // Wait for Agent A to create match and be waiting
  console.log('')
  console.log('Waiting for Agent A to create match...')
  await new Promise(r => setTimeout(r, 5000))

  const agentB = spawn('npx', ['tsx', AGENT_SCRIPT], {
    env: {
      ...process.env,
      AGENT_NAME: 'Agent_Beta',
      API_BASE: 'http://localhost:3000',
    },
    stdio: 'pipe',
  })

  agentB.stdout.on('data', (data) => {
    process.stdout.write(`\x1b[33m${data}\x1b[0m`) // Yellow
  })

  agentB.stderr.on('data', (data) => {
    process.stderr.write(`\x1b[31m[B ERROR] ${data}\x1b[0m`)
  })

  // Wait for both to finish
  await Promise.all([
    new Promise<void>((resolve) => agentA.on('close', () => resolve())),
    new Promise<void>((resolve) => agentB.on('close', () => resolve())),
  ])

  console.log('')
  console.log('='.repeat(50))
  console.log('  Match Complete!')
  console.log('='.repeat(50))
}

main().catch(console.error)
