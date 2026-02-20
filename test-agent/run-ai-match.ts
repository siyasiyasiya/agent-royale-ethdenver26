/**
 * Run a 1v1 match with two AI-powered agents using different Ollama models
 */

import { spawn } from 'child_process'
import path from 'path'

const AGENT_SCRIPT = path.join(__dirname, 'ai-agent.ts')

async function main() {
  console.log('='.repeat(60))
  console.log('  AGENT ARENA - AI vs AI Match')
  console.log('  ALPHA-7 (analytical) vs BETA-X (intuitive)')
  console.log('='.repeat(60))
  console.log('')

  // Launch Agent Alpha (using agent-alpha model)
  const agentAlpha = spawn('npx', ['tsx', AGENT_SCRIPT], {
    env: {
      ...process.env,
      AGENT_NAME: 'ALPHA-7',
      OLLAMA_MODEL: 'agent-alpha',
      API_BASE: 'http://localhost:3000',
    },
    stdio: 'pipe',
  })

  agentAlpha.stdout.on('data', (data) => {
    process.stdout.write(`\x1b[36m${data}\x1b[0m`) // Cyan
  })
  agentAlpha.stderr.on('data', (data) => {
    process.stderr.write(`\x1b[31m${data}\x1b[0m`)
  })

  // Wait for Alpha to create match
  console.log('Waiting for ALPHA-7 to create match...')
  await new Promise(r => setTimeout(r, 5000))

  // Launch Agent Beta (using agent-beta model)
  const agentBeta = spawn('npx', ['tsx', AGENT_SCRIPT], {
    env: {
      ...process.env,
      AGENT_NAME: 'BETA-X',
      OLLAMA_MODEL: 'agent-beta',
      API_BASE: 'http://localhost:3000',
    },
    stdio: 'pipe',
  })

  agentBeta.stdout.on('data', (data) => {
    process.stdout.write(`\x1b[33m${data}\x1b[0m`) // Yellow
  })
  agentBeta.stderr.on('data', (data) => {
    process.stderr.write(`\x1b[31m${data}\x1b[0m`)
  })

  // Wait for both to finish
  await Promise.all([
    new Promise<void>(resolve => agentAlpha.on('close', resolve)),
    new Promise<void>(resolve => agentBeta.on('close', resolve)),
  ])

  console.log('')
  console.log('='.repeat(60))
  console.log('  Match Complete!')
  console.log('='.repeat(60))
}

main().catch(console.error)
