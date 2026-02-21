/**
 * fund-0g-oracle.ts
 * =================
 * SETUP SCRIPT: Deposits funds into the 0G Ledger and then transfers them into
 * the InferenceServing sub-account so the oracle in src/lib/oracle.ts can call
 * AI models via the 0G Compute Network.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * The 0G Compute Network uses a 3-layer payment system:
 *
 *   Wallet (holds raw 0G tokens on-chain)
 *     └── Ledger (top-level account in the LedgerManager contract)
 *           └── InferenceServing sub-account (per-provider balance for AI calls)
 *
 * oracle.ts calls broker.inference.getRequestHeaders() which internally verifies
 * that the InferenceServing sub-account for (our wallet → provider) has a positive
 * balance. If the sub-account is empty or missing, getRequestHeaders() throws and
 * oracle.ts falls back to URL-based verdict (no AI judging).
 *
 * WHAT THIS SCRIPT DOES (in order)
 * ---------------------------------
 * Step 1 — Check Ledger exists (it should, created previously)
 * Step 2 — If Ledger.availableBalance is 0, deposit 0.2 0G from wallet → Ledger
 * Step 3 — Check InferenceServing sub-account balance
 * Step 4 — If sub-account balance < 0.1 A0GI, transfer 0.1 A0GI Ledger → sub-account
 *
 * WHY ONLY 0.1 A0GI (not 10)?
 * ----------------------------
 * The Ledger is empty (0 balance), so we need to deposit from the wallet first.
 * The wallet has ~5 0G — we want to be VERY conservative to not waste testnet tokens.
 * - Deposit into Ledger: 0.2 0G (small, leaves ~4.8 0G in wallet)
 * - Transfer to sub-account: 0.1 A0GI (leaves 0.1 A0GI in Ledger as buffer)
 * - Each oracle call costs ~0.0001-0.001 A0GI → 0.1 A0GI = 100-1000 calls
 * - That's enough for the entire ETHDenver demo
 *
 * FIELD NAME CORRECTIONS (vs original script)
 * --------------------------------------------
 * LedgerStructOutput has NO `balance` field. Correct fields are:
 *   - availableBalance: bigint  (funds not locked in sub-accounts, in neuron)
 *   - totalBalance: bigint      (all funds including locked, in neuron)
 *
 * AccountStructOutput has NO `amount` field. Correct field is:
 *   - balance: bigint           (sub-account balance, in neuron)
 *
 * API UNITS
 * ---------
 * - depositFund(amount: number)  → amount is in 0G (whole tokens), NOT neuron
 * - addLedger(balance: number)   → balance is in 0G (whole tokens), NOT neuron
 * - transferFund(..., amount: bigint) → amount IS in neuron
 * - All struct balance fields are in neuron
 * - 1 A0GI = 1 0G = 10^18 neuron
 *
 * SAFETY
 * ------
 * - Reads state before every write — only spends if needed
 * - 5-second countdown before each on-chain transaction
 * - Ctrl+C at any countdown aborts cleanly
 * - Idempotent: safe to re-run, will skip steps that are already done
 *
 * USAGE
 * -----
 *   npx tsx scripts/fund-0g-oracle.ts
 *
 * Requires ZERO_GRAVITY_PRIVATE_KEY in .env
 */

import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker'
import { ethers } from 'ethers'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from project root (script lives in scripts/, .env is in project root)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// ─── Constants ────────────────────────────────────────────────────────────────

/** Same provider address used in src/lib/oracle.ts */
const ZG_PROVIDER_ADDRESS = '0xa48f01287233509FD694a22Bf840225062E67836'

/** 0G Galileo Testnet RPC — chain ID 16602 */
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'

/**
 * How much 0G to deposit from wallet → Ledger if the Ledger is empty.
 * depositFund() takes a `number` in WHOLE 0G TOKENS (not neuron).
 * 0.2 0G is small enough to not waste tokens, large enough for our needs.
 */
const DEPOSIT_AMOUNT_0G = 0.2

/**
 * How much A0GI to transfer Ledger → InferenceServing sub-account.
 * transferFund() takes a `bigint` in NEURON.
 * 0.1 A0GI ≈ 100-1000 oracle calls — enough for the demo.
 */
const TRANSFER_AMOUNT_A0GI = 0.1

/** Minimum sub-account balance (in neuron) before we consider it "funded enough" */
const MIN_SUB_BALANCE_NEURON = BigInt(Math.floor(0.05 * 1e18)) // 0.05 A0GI

/** 1 A0GI = 10^18 neuron (same ratio as 1 ETH = 10^18 wei) */
const NEURON_PER_A0GI = 10n ** 18n

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert neuron (bigint) to a human-readable A0GI string */
function toA0GI(neuron: bigint): string {
  return (Number(neuron) / Number(NEURON_PER_A0GI)).toFixed(6)
}

/** 5-second countdown with Ctrl+C support. Prints on a single line. */
async function countdown(label: string) {
  console.log(`\n   ⚠️  ${label}`)
  console.log('   Press Ctrl+C within 5 seconds to abort...')
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`   Proceeding in ${i}...  \r`)
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log('   Proceeding!                    ')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Load private key ──────────────────────────────────────────────────────
  const privateKey = process.env.ZERO_GRAVITY_PRIVATE_KEY
  if (!privateKey) {
    console.error('❌ ZERO_GRAVITY_PRIVATE_KEY is not set in .env')
    process.exit(1)
  }

  // ── Connect to 0G network ─────────────────────────────────────────────────
  console.log('🔗 Connecting to 0G Galileo Testnet...')
  const ethProvider = new ethers.JsonRpcProvider(ZG_RPC)
  const wallet = new ethers.Wallet(privateKey, ethProvider)
  console.log(`   Wallet: ${wallet.address}`)

  // Check raw wallet balance so we know what we're working with
  const walletBalance = await ethProvider.getBalance(wallet.address)
  console.log(`   Wallet balance: ${ethers.formatEther(walletBalance)} 0G`)

  const broker = await createZGComputeNetworkBroker(wallet)
  console.log('   Broker initialized ✓')

  // ── Step 1: Check Ledger ───────────────────────────────────────────────────
  // The Ledger is the top-level on-chain account in the LedgerManager contract.
  // LedgerStructOutput fields: { user, availableBalance, totalBalance, additionalInfo }
  // Note: NO `balance` field — it's `availableBalance` and `totalBalance`.
  console.log('\n[1/4] Checking Ledger...')

  let ledger
  try {
    ledger = await broker.ledger.getLedger()
    console.log(`   Ledger exists`)
    console.log(`   availableBalance: ${toA0GI(ledger.availableBalance)} A0GI`)
    console.log(`   totalBalance:     ${toA0GI(ledger.totalBalance)} A0GI`)
  } catch {
    console.error('   ❌ No Ledger found. The Ledger was expected to exist from a previous setup.')
    console.error('      If it was deleted, create a new one with:')
    console.error('      broker.ledger.addLedger(0.2)  // deposits 0.2 0G from wallet')
    process.exit(1)
  }

  // ── Step 2: Ensure Ledger has enough AVAILABLE balance ───────────────────
  // LedgerStructOutput has two balance fields:
  //   - totalBalance:     ALL funds in the ledger (including locked in sub-accounts)
  //   - availableBalance: Only funds NOT yet locked — this is what transferFund draws from
  //
  // Our ledger has 0.15 0G totalBalance but 0 availableBalance — meaning ALL 0.15 was
  // previously locked into a sub-account that may no longer exist or was drained.
  // We cannot transferFund without available balance, so we deposit fresh from the wallet.
  //
  // depositFund(amount: number) — amount is in 0G WHOLE TOKENS (not neuron)
  const MIN_AVAILABLE = BigInt(Math.floor(TRANSFER_AMOUNT_A0GI * 1e18))
  if (ledger.availableBalance < MIN_AVAILABLE) {
    console.log(`\n[2/4] Ledger availableBalance (${toA0GI(ledger.availableBalance)} A0GI) is below what we need.`)
    console.log(`   Depositing ${DEPOSIT_AMOUNT_0G} 0G from wallet → Ledger...`)
    console.log(`   Wallet balance: ${ethers.formatEther(walletBalance)} 0G`)
    console.log(`   Note: totalBalance is ${toA0GI(ledger.totalBalance)} A0GI (locked in old sub-account)`)

    await countdown(`Depositing ${DEPOSIT_AMOUNT_0G} 0G from wallet into Ledger`)

    try {
      // depositFund(amount: number) — amount is in 0G whole tokens, NOT neuron
      await broker.ledger.depositFund(DEPOSIT_AMOUNT_0G)
      console.log('   ✓ Deposit confirmed!')
    } catch (e) {
      console.error('   ❌ depositFund failed:', e)
      console.error('\n   Possible causes:')
      console.error('   - Wallet has insufficient balance')
      console.error('   - RPC rate limit hit (retry in a moment)')
      process.exit(1)
    }

    // Re-read ledger to confirm the deposit landed
    ledger = await broker.ledger.getLedger()
    console.log(`   Ledger availableBalance after deposit: ${toA0GI(ledger.availableBalance)} A0GI`)
    console.log(`   Ledger totalBalance after deposit:     ${toA0GI(ledger.totalBalance)} A0GI`)
  } else {
    console.log(`\n[2/4] Ledger has ${toA0GI(ledger.availableBalance)} A0GI available — no deposit needed ✓`)
  }

  // ── Step 3: Check InferenceServing sub-account ────────────────────────────
  // The sub-account is per-(wallet, provider). It holds pre-paid credits
  // that getRequestHeaders() checks before signing each inference request.
  // AccountStructOutput fields: { user, provider, nonce, balance, pendingRefund, ... }
  // Note: the field is `balance` (not `amount`).
  console.log('\n[3/4] Checking InferenceServing sub-account...')
  console.log(`   Provider: ${ZG_PROVIDER_ADDRESS}`)

  let subBalance = 0n
  try {
    const account = await broker.inference.getAccount(ZG_PROVIDER_ADDRESS)
    // AccountStructOutput: { user, provider, nonce, balance, pendingRefund, ... }
    subBalance = account.balance ?? 0n
    console.log(`   Sub-account exists. Balance: ${toA0GI(subBalance)} A0GI`)
  } catch {
    console.log('   Sub-account does not exist yet (will be created by transferFund)')
    subBalance = 0n
  }

  if (subBalance >= MIN_SUB_BALANCE_NEURON) {
    console.log(`\n✅ Sub-account already has ${toA0GI(subBalance)} A0GI — sufficient for oracle calls.`)
    console.log('   The oracle is ready. No further action needed.')
    console.log('\n   Confirm it works by watching for "[oracle] 0G verdict raw:" in server logs.')
    return
  }

  // ── Step 4: Transfer from Ledger → sub-account ────────────────────────────
  // transferFund() takes amount in NEURON (bigint), unlike depositFund which takes 0G.
  // This call will also CREATE the sub-account if it doesn't exist yet.
  const transferNeuron = BigInt(Math.floor(TRANSFER_AMOUNT_A0GI * 1e18))

  console.log(`\n[4/4] Transferring ${TRANSFER_AMOUNT_A0GI} A0GI (${transferNeuron} neuron) to sub-account...`)
  console.log(`   From: Ledger (availableBalance: ${toA0GI(ledger.availableBalance)} A0GI)`)
  console.log(`   To:   InferenceServing sub-account for provider ${ZG_PROVIDER_ADDRESS}`)

  await countdown(`Transferring ${TRANSFER_AMOUNT_A0GI} A0GI Ledger → InferenceServing sub-account`)

  try {
    // transferFund(provider, serviceType, amount: bigint in neuron)
    await broker.ledger.transferFund(
      ZG_PROVIDER_ADDRESS,
      'inference',  // 'inference' | 'fine-tuning'
      transferNeuron
    )
    console.log('   ✓ Transfer confirmed!')
  } catch (e) {
    console.error('   ❌ transferFund failed:', e)
    console.error('\n   Possible causes:')
    console.error('   - Ledger availableBalance too low')
    console.error('   - RPC rate limit (retry in a moment)')
    console.error('   - Network congestion on Galileo testnet')
    process.exit(1)
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log('\n🔍 Verifying sub-account balance after transfer...')
  try {
    const accountAfter = await broker.inference.getAccount(ZG_PROVIDER_ADDRESS)
    const newBalance = accountAfter.balance ?? 0n
    console.log(`   Sub-account balance: ${toA0GI(newBalance)} A0GI`)

    if (newBalance > 0n) {
      console.log('\n🎉 SUCCESS! The 0G oracle is now fully operational.')
      console.log('\n   Next steps:')
      console.log('   1. Make sure ZERO_GRAVITY_PRIVATE_KEY is set in Railway env vars')
      console.log('   2. Deploy/restart the Railway service to pick up the env var')
      console.log('   3. Watch for "[oracle] 0G verdict raw:" in Railway logs during a match')
      console.log('\n   Test locally:')
      console.log('   npm run dev   ← start local server')
      console.log('   npx tsx scripts/test-two-agents.ts   ← trigger a match with oracle judging')
    } else {
      console.warn('\n⚠️  Transfer succeeded but balance still shows 0.')
      console.warn('   May need 30s to settle. Re-run this script to check.')
    }
  } catch (e) {
    console.warn('\n⚠️  Transfer likely succeeded but could not verify:', e)
    console.warn('   Try running a match and watching server logs for oracle output.')
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('\n💥 Fatal error:', err)
  process.exit(1)
})
