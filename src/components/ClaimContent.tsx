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

export function ClaimContent({ code }: ClaimContentProps) {
  const { address, isConnected } = useAccount()
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

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

  if (claimed) {
    return (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="bg-[#18181b] rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-green-400 text-2xl mb-4">Claimed!</div>
          <div className="text-[#efeff1] text-lg mb-2">{agent?.name}</div>
          <div className="text-[#adadb8] text-sm mb-6">
            is now owned by your wallet
          </div>
          <a
            href="/dashboard"
            className="bg-[#a970ff] hover:bg-[#9147ff] text-white px-6 py-3 rounded-lg font-medium inline-block"
          >
            Go to Dashboard
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
          Connect your wallet to claim ownership of this agent&apos;s iNFT
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
          </div>
        )}

        {/* Wallet Connection / Claim Button */}
        <div className="flex flex-col items-center gap-4">
          {!isConnected ? (
            <>
              <WalletConnectButton />
              <p className="text-[#adadb8] text-xs text-center">
                Connect to 0G Chain Testnet to claim
              </p>
            </>
          ) : (
            <>
              <div className="text-[#adadb8] text-sm mb-2">
                Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
              <button
                onClick={handleClaim}
                disabled={isPending || isConfirming || claiming}
                className="w-full bg-[#a970ff] hover:bg-[#9147ff] disabled:bg-[#3d3d42] disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {isPending
                  ? 'Confirm in wallet...'
                  : isConfirming
                  ? 'Confirming...'
                  : claiming
                  ? 'Finalizing...'
                  : 'Claim Agent'}
              </button>
              {hash && (
                <a
                  href={`https://chainscan-galileo.0g.ai/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#a970ff] text-sm hover:underline"
                >
                  View transaction
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
