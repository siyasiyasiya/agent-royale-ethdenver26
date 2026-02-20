'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Match {
  match_id: string
  status: string
  arena: string
  entry_fee: number
  prize_pool: number
  start_article: string
  target_article: string
  time_limit_seconds: number
  agent1: { agent_id: string; name: string } | null
  agent2: { agent_id: string; name: string } | null
  started_at: string | null
  ends_at: string | null
}

function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === 'active'

  // Simulated viewer count (would come from socket.io in real app)
  const viewerCount = isLive ? Math.floor(Math.random() * 50) + 5 : 0

  return (
    <Link
      href={`/match/${match.match_id}`}
      className="block bg-[#18181b] border border-[#2d2d32] card-hover"
    >
      {/* Thumbnail area */}
      <div className="aspect-video bg-[#0e0e10] relative flex items-center justify-center">
        <div className="text-[#adadb8] text-[11px]">
          {match.agent1?.name || '???'} vs {match.agent2?.name || '???'}
        </div>

        {/* Live badge */}
        {isLive && (
          <div className="absolute top-2 left-2 live-badge">
            LIVE
          </div>
        )}

        {/* Viewer count */}
        {isLive && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[11px] text-[#efeff1]">
            <span className="w-2 h-2 rounded-full bg-[#eb0400]"></span>
            {viewerCount} viewers
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        {/* Agent names */}
        <div className="text-[14px] font-semibold text-[#efeff1] truncate mb-1">
          {match.agent1?.name || '???'} vs {match.agent2?.name || '???'}
        </div>

        {/* Category tag */}
        <div className="text-[11px] text-[#adadb8] mb-2">
          Wikipedia Speedrun
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#848494]">
            Target: {match.target_article}
          </span>
          <span className="text-[#efeff1]">
            ${match.prize_pool.toFixed(2)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMatches()
    const interval = setInterval(fetchMatches, 5000)
    return () => clearInterval(interval)
  }, [])

  async function fetchMatches() {
    try {
      const res = await fetch('/api/matches')
      const data = await res.json()
      setMatches(data.matches || [])
    } catch (err) {
      console.error('Failed to fetch matches:', err)
    } finally {
      setLoading(false)
    }
  }

  const liveMatches = matches.filter(m => m.status === 'active')
  const waitingMatches = matches.filter(m => m.status === 'waiting_for_opponent')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[18px] font-semibold text-[#efeff1]">Browse</h1>
      </div>

      {loading ? (
        <div className="text-[#848494] text-[12px]">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-[#848494] text-[12px] mb-2">No matches right now</div>
          <div className="text-[#848494] text-[11px]">
            Matches appear here when agents join the arena
          </div>
        </div>
      ) : (
        <>
          {/* Live */}
          {liveMatches.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[14px] font-semibold text-[#efeff1] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#eb0400]"></span>
                Live Now
              </h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {liveMatches.map(match => (
                  <MatchCard key={match.match_id} match={match} />
                ))}
              </div>
            </section>
          )}

          {/* Waiting */}
          {waitingMatches.length > 0 && (
            <section>
              <h2 className="text-[14px] font-semibold text-[#adadb8] mb-3">
                Waiting for Opponent
              </h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {waitingMatches.map(match => (
                  <MatchCard key={match.match_id} match={match} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
