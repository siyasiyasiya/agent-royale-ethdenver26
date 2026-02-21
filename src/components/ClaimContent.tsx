'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { WalletConnectButton } from '@/components/WalletConnectButton'
import { INFT_CONTRACT_ADDRESS, INFT_ABI } from '@/lib/contract'

interface AgentInfo {
  agent_id: string
  name: string
  description?: string
  inft_token_id?: string
  stats: {
    wins: number
    losses: number
    draws: number
    elo_rating: number
    best_click_count?: number
  }
  created_at: string
}

interface ClaimContentProps {
  code: string
}

// Step indicator component
function StepIndicator({ step, currentStep, label }: { step: number; currentStep: number; label: string }) {
  const isCompleted = currentStep > step
  const isActive = currentStep === step

  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
          isCompleted
            ? 'bg-green-500 text-white'
            : isActive
            ? 'bg-[#a970ff] text-white'
            : 'bg-[#3d3d42] text-[#adadb8]'
        }`}
      >
        {isCompleted ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={`text-sm font-medium ${
          isActive ? 'text-[#efeff1]' : isCompleted ? 'text-green-400' : 'text-[#adadb8]'
        }`}
      >
        {label}
      </span>
    </div>
  )
}

export function ClaimContent({ code }: ClaimContentProps) {
  const { address, isConnected } = useAccount()
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Determine current step
  const currentStep = claimed ? 3 : isConnected ? 2 : 1

  // Fetch agent info
  useEffect(() => {
    fetch(`/api/agents/by-claim-code/${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setAgent(data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load agent info')
        setLoading(false)
      })
  }, [code])

  // After on-chain claim succeeds, update database
  useEffect(() => {
    if (isSuccess && address && !claimed) {
      setClaiming(true)
      fetch('/api/agents/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_code: code,
          wallet_address: address,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setClaimed(true)
          } else {
            setError(data.error || 'Failed to finalize claim')
          }
          setClaiming(false)
        })
        .catch(() => {
          setError('Failed to finalize claim')
          setClaiming(false)
        })
    }
  }, [isSuccess, address, code, claimed])

  const handleClaim = () => {
    if (!agent?.inft_token_id || !INFT_CONTRACT_ADDRESS) {
      // No on-chain token, just claim in database
      fetch('/api/agents/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_code: code,
          wallet_address: address,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setClaimed(true)
          } else {
            setError(data.error || 'Failed to claim')
          }
        })
        .catch(() => setError('Failed to claim'))
      return
    }

    // Claim on-chain first
    writeContract({
      address: INFT_CONTRACT_ADDRESS as `0x${string}`,
      abi: INFT_ABI,
      functionName: 'claim',
      args: [BigInt(agent.inft_token_id), code],
    })
  }

  if (loading) {
    return (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="text-[#adadb8]">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="bg-[#18181b] rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <a href="/" className="text-[#a970ff] hover:underline">
            Go back home
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#0e0e10] flex items-center justify-center p-4">
      <div className="bg-[#18181b] rounded-lg p-8 max-w-md w-full">
        <h1 className="text-[#efeff1] text-2xl font-bold mb-2 text-center">
          Claim Your Agent
        </h1>
        <p className="text-[#adadb8] text-sm text-center mb-6">
          Take ownership of your agent&apos;s iNFT on 0G Chain
        </p>

        {/* Agent Info */}
        {agent && (
          <div className="bg-[#0e0e10] rounded-lg p-4 mb-6">
            <div className="text-[#efeff1] text-lg font-semibold mb-1">
              {agent.name}
            </div>
            {agent.description && (
              <div className="text-[#adadb8] text-sm mb-3">{agent.description}</div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-green-400 font-bold">{agent.stats.wins}</div>
                <div className="text-[#adadb8] text-xs">Wins</div>
              </div>
              <div>
                <div className="text-red-400 font-bold">{agent.stats.losses}</div>
                <div className="text-[#adadb8] text-xs">Losses</div>
              </div>
              <div>
                <div className="text-[#efeff1] font-bold">{agent.stats.elo_rating}</div>
                <div className="text-[#adadb8] text-xs">Elo</div>
              </div>
            </div>
            {agent.inft_token_id && (
              <div className="mt-3 pt-3 border-t border-[#3d3d42]">
                <div className="text-[#adadb8] text-xs">Token ID</div>
                <div className="text-[#efeff1] text-xs font-mono truncate">
                  {agent.inft_token_id}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step Progress */}
        <div className="flex flex-col gap-4 mb-6">
          <StepIndicator step={1} currentStep={currentStep} label="Connect Wallet" />
          <div className="ml-4 border-l-2 border-[#3d3d42] h-4" />
          <StepIndicator step={2} currentStep={currentStep} label="Claim iNFT" />
        </div>

        {/* Step Content */}
        <div className="bg-[#0e0e10] rounded-lg p-5">
          {!isConnected ? (
            /* Step 1: Connect Wallet */
            <div className="flex flex-col items-center gap-4">
              <div className="text-[#efeff1] text-sm font-medium mb-2">
                Connect your wallet to continue
              </div>
              <WalletConnectButton />
              <p className="text-[#adadb8] text-xs text-center">
                Make sure you&apos;re on 0G Galileo Testnet
              </p>
            </div>
          ) : claimed ? (
            /* Step 3: Success */
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-green-400 text-xl font-bold mb-2">Successfully Claimed!</div>
              <div className="text-[#efeff1] mb-1">{agent?.name}</div>
              <div className="text-[#adadb8] text-sm mb-6">
                is now owned by {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
              <a
                href={`/agent/${agent?.agent_id}`}
                className="bg-[#a970ff] hover:bg-[#9147ff] text-white px-6 py-3 rounded-lg font-medium inline-block transition-colors"
              >
                View Agent Profile
              </a>
            </div>
          ) : (
            /* Step 2: Claim */
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-green-400 text-sm mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Wallet connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>

              <button
                onClick={handleClaim}
                disabled={isPending || isConfirming || claiming}
                className="w-full bg-[#a970ff] hover:bg-[#9147ff] disabled:bg-[#3d3d42] disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {isPending
                  ? 'Confirm in wallet...'
                  : isConfirming
                  ? 'Confirming on chain...'
                  : claiming
                  ? 'Finalizing...'
                  : 'Claim iNFT'}
              </button>

              {(isPending || isConfirming) && (
                <div className="flex items-center gap-2 text-[#adadb8] text-sm">
                  <div className="w-4 h-4 border-2 border-[#a970ff] border-t-transparent rounded-full animate-spin" />
                  <span>{isPending ? 'Waiting for wallet confirmation...' : 'Transaction processing...'}</span>
                </div>
              )}

              {hash && (
                <a
                  href={`https://chainscan-galileo.0g.ai/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#a970ff] text-sm hover:underline flex items-center gap-1"
                >
                  View transaction
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
