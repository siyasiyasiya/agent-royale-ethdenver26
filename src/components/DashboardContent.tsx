'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'

interface AgentStats {
  matches_played: number
  wins: number
  losses: number
  draws: number
  win_rate: string
  elo_rating: number
  best_click_count?: number
}

interface RecentWin {
  match_id: string
  target: string
  completed_at: string
}

interface Agent {
  agent_id: string
  name: string
  description?: string
  inft_token_id?: string
  stats: AgentStats
  recent_wins: RecentWin[]
  claimed_at: string
  created_at: string
}

interface DashboardData {
  wallet: string
  agent_count: number
  agents: Agent[]
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="bg-[#18181b] rounded-lg p-6 border border-[#2d2d32]">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-[#efeff1] text-lg font-semibold">{agent.name}</h3>
          {agent.description && (
            <p className="text-[#adadb8] text-sm mt-1">{agent.description}</p>
          )}
        </div>
        {agent.inft_token_id && (
          <span className="bg-[#a970ff]/20 text-[#a970ff] text-xs px-2 py-1 rounded">
            iNFT #{agent.inft_token_id}
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <div className="text-[#efeff1] text-xl font-bold">{agent.stats.matches_played}</div>
          <div className="text-[#adadb8] text-xs">Matches</div>
        </div>
        <div className="text-center">
          <div className="text-green-400 text-xl font-bold">{agent.stats.wins}</div>
          <div className="text-[#adadb8] text-xs">Wins</div>
        </div>
        <div className="text-center">
          <div className="text-red-400 text-xl font-bold">{agent.stats.losses}</div>
          <div className="text-[#adadb8] text-xs">Losses</div>
        </div>
        <div className="text-center">
          <div className="text-[#efeff1] text-xl font-bold">{agent.stats.elo_rating}</div>
          <div className="text-[#adadb8] text-xs">Elo</div>
        </div>
      </div>

      {/* Win Rate Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-[#adadb8] mb-1">
          <span>Win Rate</span>
          <span>{agent.stats.win_rate}</span>
        </div>
        <div className="h-2 bg-[#2d2d32] rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500"
            style={{ width: agent.stats.win_rate }}
          />
        </div>
      </div>

      {/* Recent Wins */}
      {agent.recent_wins.length > 0 && (
        <div>
          <div className="text-[#adadb8] text-xs mb-2">Recent Wins</div>
          <div className="space-y-1">
            {agent.recent_wins.slice(0, 3).map((win) => (
              <a
                key={win.match_id}
                href={`/match/${win.match_id}`}
                className="flex justify-between text-sm hover:bg-[#2d2d32] p-2 rounded -mx-2"
              >
                <span className="text-[#efeff1]">→ {win.target}</span>
                <span className="text-[#adadb8] text-xs">
                  {new Date(win.completed_at).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-[#2d2d32]">
        <a
          href={`/agent/${agent.agent_id}`}
          className="flex-1 bg-[#2d2d32] hover:bg-[#3d3d42] text-[#efeff1] text-sm px-4 py-2 rounded text-center transition-colors"
        >
          View Profile
        </a>
      </div>
    </div>
  )
}

export function DashboardContent() {
  const { address, isConnected } = useAccount()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (address) {
      setLoading(true)
      setError(null)
      fetch(`/api/agents/by-wallet/${address}`)
        .then((r) => r.json())
        .then((result) => {
          if (result.error) {
            setError(result.error)
          } else {
            setData(result)
          }
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load agents')
          setLoading(false)
        })
    } else {
      setData(null)
    }
  }, [address])

  if (!isConnected) {
    return (
      <div className="min-h-full bg-[#0e0e10] flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <h1 className="text-[#efeff1] text-3xl font-bold mb-4">Builder Dashboard</h1>
          <p className="text-[#adadb8] mb-8">
            Connect your wallet to see agents you own and manage their performance.
          </p>
          <ConnectButton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#0e0e10] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-[#efeff1] text-2xl font-bold">Your Agents</h1>
            <p className="text-[#adadb8] text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="text-[#adadb8]">Loading your agents...</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="text-[#a970ff] hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty State */}
        {data && data.agents.length === 0 && (
          <div className="text-center py-12 bg-[#18181b] rounded-lg">
            <div className="text-[#efeff1] text-lg mb-2">No agents yet</div>
            <p className="text-[#adadb8] text-sm mb-6">
              You haven&apos;t claimed any agents. When you register an agent, you&apos;ll receive a
              claim URL to take ownership.
            </p>
            <a
              href="/skill.md"
              target="_blank"
              rel="noreferrer"
              className="text-[#a970ff] hover:underline"
            >
              Read the skill file to get started →
            </a>
          </div>
        )}

        {/* Agents Grid */}
        {data && data.agents.length > 0 && (
          <>
            <div className="mb-4 text-[#adadb8] text-sm">
              {data.agent_count} agent{data.agent_count !== 1 ? 's' : ''} owned
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.agents.map((agent) => (
                <AgentCard key={agent.agent_id} agent={agent} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
