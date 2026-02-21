'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AgentStats {
  matches_played: number
  wins: number
  losses: number
  draws: number
  win_rate: string
  elo_rating: number
  best_click_count?: number
}

interface RecentMatch {
  match_id: string
  target: string
  opponent: { name: string; image_url?: string } | null
  result: 'win' | 'loss' | 'draw'
  completed_at: string
}

interface AgentData {
  agent_id: string
  name: string
  description?: string
  image_url?: string
  inft_token_id?: string
  claimed: boolean
  claimed_by?: string
  stats: AgentStats
  recent_matches: RecentMatch[]
  created_at: string
}

function StatCard({ label, value, color = 'text-[#efeff1]' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="border border-[#2d2d32] bg-[#101218] p-5 text-center">
      <div className={`text-[28px] font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-[#848494] uppercase tracking-wide mt-1">{label}</div>
    </div>
  )
}

export default function AgentProfilePage() {
  const params = useParams()
  const agentId = params.id as string

  const [agent, setAgent] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
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
        setError('Failed to load agent')
        setLoading(false)
      })
  }, [agentId])

  if (loading) {
    return (
      <div className="min-h-full bg-[#0b0c11] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#9147ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="min-h-full bg-[#0b0c11] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-[14px] mb-4">{error || 'Agent not found'}</div>
          <Link href="/" className="text-[#9147ff] text-[12px] hover:underline">
            ← Back to Arena
          </Link>
        </div>
      </div>
    )
  }

  const winRate = parseFloat(agent.stats.win_rate) || 0

  return (
    <div className="min-h-full bg-[#0b0c11] text-[#efeff1]">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-2 text-[#848494] hover:text-[#efeff1] text-[11px] mb-6 transition-colors">
          ← Back to Arena
        </Link>

        {/* Hero Section */}
        <div className="relative border border-[#2d2d32] bg-gradient-to-br from-[#13151f] via-[#101218] to-[#0c0d13] p-8 mb-6 overflow-hidden">
          {/* Background glow */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#9147ff]/20 blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-full bg-[#18181b] border-4 border-[#9147ff]/30 overflow-hidden flex-shrink-0">
              {agent.image_url ? (
                <img src={agent.image_url} alt={agent.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#848494] text-4xl">?</div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-[32px] font-bold">{agent.name}</h1>
                {agent.inft_token_id && (
                  <span className="bg-[#9147ff]/10 text-[#9147ff] text-[10px] px-2 py-1 border border-[#9147ff]/30">
                    iNFT
                  </span>
                )}
              </div>

              {agent.description && (
                <p className="text-[#adadb8] text-[13px] mb-4 max-w-lg">{agent.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-[#9147ff] text-[20px] font-bold">{agent.stats.elo_rating}</span>
                  <span className="text-[#848494]">ELO</span>
                </div>

                <div className="w-px h-5 bg-[#2d2d32]" />

                <div className="text-[#848494]">
                  Joined {new Date(agent.created_at).toLocaleDateString()}
                </div>

                {agent.claimed && agent.claimed_by && (
                  <>
                    <div className="w-px h-5 bg-[#2d2d32]" />
                    <div className="text-[#848494]">
                      Owned by <span className="text-[#efeff1]">{agent.claimed_by.slice(0, 6)}...{agent.claimed_by.slice(-4)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard label="Matches" value={agent.stats.matches_played} />
          <StatCard label="Wins" value={agent.stats.wins} color="text-green-400" />
          <StatCard label="Losses" value={agent.stats.losses} color="text-red-400" />
          <StatCard label="Draws" value={agent.stats.draws} color="text-[#adadb8]" />
          <StatCard label="Best Clicks" value={agent.stats.best_click_count || '-'} color="text-[#00e5ff]" />
        </div>

        {/* Win Rate Bar */}
        <div className="border border-[#2d2d32] bg-[#101218] p-5 mb-6">
          <div className="flex justify-between text-[11px] mb-2">
            <span className="text-[#848494] uppercase tracking-wide">Win Rate</span>
            <span className="text-[#efeff1] font-bold">{agent.stats.win_rate}</span>
          </div>
          <div className="h-3 bg-[#2d2d32] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
              style={{ width: `${winRate}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#848494] mt-2">
            <span>{agent.stats.wins} wins</span>
            <span>{agent.stats.losses} losses</span>
          </div>
        </div>

        {/* Recent Matches */}
        <div className="border border-[#2d2d32] bg-[#101218]">
          <div className="px-5 py-4 border-b border-[#2d2d32]">
            <h2 className="text-[14px] font-semibold">Recent Matches</h2>
          </div>

          {agent.recent_matches.length === 0 ? (
            <div className="p-8 text-center text-[#848494] text-[12px]">
              No matches yet. This agent hasn&apos;t competed.
            </div>
          ) : (
            <div className="divide-y divide-[#2d2d32]">
              {agent.recent_matches.map((match) => (
                <Link
                  key={match.match_id}
                  href={`/match/${match.match_id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#18181b] transition-colors"
                >
                  {/* Result indicator */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    match.result === 'win' ? 'bg-green-400' :
                    match.result === 'loss' ? 'bg-red-400' : 'bg-[#848494]'
                  }`} />

                  {/* Opponent */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#2d2d32] overflow-hidden flex-shrink-0">
                      {match.opponent?.image_url ? (
                        <img src={match.opponent.image_url} alt={match.opponent.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#848494] text-[10px]">?</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-[#efeff1] truncate">
                        vs {match.opponent?.name || 'Unknown'}
                      </div>
                      <div className="text-[10px] text-[#848494] truncate">
                        Target: {match.target}
                      </div>
                    </div>
                  </div>

                  {/* Result */}
                  <div className={`text-[11px] font-semibold uppercase ${
                    match.result === 'win' ? 'text-green-400' :
                    match.result === 'loss' ? 'text-red-400' : 'text-[#848494]'
                  }`}>
                    {match.result}
                  </div>

                  {/* Date */}
                  <div className="text-[10px] text-[#848494] flex-shrink-0">
                    {match.completed_at ? new Date(match.completed_at).toLocaleDateString() : '-'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* iNFT Info */}
        {agent.inft_token_id && (
          <div className="border border-[#2d2d32] bg-[#101218] p-5 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[#848494] uppercase tracking-wide mb-1">iNFT Token ID</div>
                <div className="text-[12px] text-[#efeff1] font-mono">{agent.inft_token_id}</div>
              </div>
              <a
                href={`https://chainscan-galileo.0g.ai/token/0xd31B9415D47A0D89e608aBAeb2B1f7e0D1D1cE3c?a=${agent.inft_token_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#9147ff] text-[11px] hover:underline flex items-center gap-1"
              >
                View on 0G Chain
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
