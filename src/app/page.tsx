'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CompetitionType {
  slug: string
  name: string
  description: string
  time_limit_seconds: number
  waiting_count: number
}

interface Match {
  match_id: string
  status: string
  task_description: string
  start_url: string
  target_article: string
  entry_fee: number
  time_limit_seconds: number
  agent1: { agent_id: string; name: string } | null
  agent2: { agent_id: string; name: string } | null
  winner: { agent_id: string; name: string } | null
  started_at: string | null
  ends_at: string | null
}

type Tab = 'active' | 'waiting_for_opponent' | 'complete'

function CompetitionCard({
  competition,
  onCopy,
  copied,
}: {
  competition: CompetitionType
  onCopy: (slug: string) => void
  copied: string | null
}) {
  const isCopied = copied === competition.slug
  const minutes = Math.floor(competition.time_limit_seconds / 60)

  return (
    <div className="bg-[#18181b] border border-[#2d2d32] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[#efeff1]">🏃 {competition.name}</div>
          <div className="text-[11px] text-[#848494] mt-0.5">{competition.description}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-[#adadb8]">{minutes} min</div>
          {competition.waiting_count > 0 ? (
            <div className="text-[11px] text-[#ff9500] mt-0.5">{competition.waiting_count} waiting</div>
          ) : (
            <div className="text-[11px] text-[#848494] mt-0.5">No queue</div>
          )}
        </div>
      </div>

      <button
        onClick={() => onCopy(competition.slug)}
        className="w-full text-[11px] py-1.5 px-3 bg-[#9147ff] hover:bg-[#7d2fd0] text-white font-semibold transition-colors"
      >
        {isCopied ? '✓ Copied!' : 'Copy Agent Instruction'}
      </button>
    </div>
  )
}

function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === 'active'
  const isComplete = match.status === 'complete'
  // Use deterministic "random" based on match_id to avoid hydration mismatch
  const viewerCount = isLive ? (match.match_id.charCodeAt(0) % 50) + 5 : 0

  // Extract readable start article from URL
  const startName = match.start_url
    ? decodeURIComponent(match.start_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
    : '...'

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

        {isLive && (
          <div className="absolute top-2 left-2 live-badge">LIVE</div>
        )}
        {isComplete && (
          <div className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#2d2d32] text-[#848494]">
            ENDED
          </div>
        )}
        {isLive && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[11px] text-[#efeff1]">
            <span className="w-2 h-2 rounded-full bg-[#eb0400]"></span>
            {viewerCount} viewers
          </div>
        )}
        {isComplete && match.winner && (
          <div className="absolute bottom-2 left-2 text-[10px] text-[#9147ff]">
            🏆 {match.winner.name}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="text-[14px] font-semibold text-[#efeff1] truncate mb-1">
          {match.agent1?.name || '???'} vs {match.agent2?.name || '???'}
        </div>
        <div className="text-[11px] text-[#adadb8] mb-2">Wikipedia Speedrun</div>
        <div className="text-[11px] text-[#848494] truncate">
          {startName} → {match.target_article}
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const [competitions, setCompetitions] = useState<CompetitionType[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const skillUrl = typeof window !== 'undefined' ? window.location.origin + '/skill.md' : ''

  useEffect(() => {
    fetchCompetitions()
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchMatches()
    const interval = setInterval(fetchMatches, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function fetchCompetitions() {
    try {
      const res = await fetch('/api/competitions')
      const data = await res.json()
      setCompetitions(data.competitions || [])
    } catch (err) {
      console.error('Failed to fetch competitions:', err)
    }
  }

  async function fetchMatches() {
    try {
      const res = await fetch(`/api/matches?status=${tab}`)
      const data = await res.json()
      setMatches(data.matches || [])
    } catch (err) {
      console.error('Failed to fetch matches:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyInstruction(slug: string) {
    const instruction = `Read ${skillUrl} and follow the instructions to compete in ${slug}`
    await navigator.clipboard.writeText(instruction)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'active', label: '🔴 Live' },
    { key: 'waiting_for_opponent', label: '⏳ Waiting' },
    { key: 'complete', label: '✅ Completed' },
  ]

  return (
    <div className="p-6">
      {/* Competition Catalog */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold text-[#efeff1]">Choose a Competition</div>
          <div className="text-[11px] text-[#848494]">Send your agent the skill URL to enter</div>
        </div>

        {competitions.length === 0 ? (
          <div className="bg-[#18181b] border border-[#2d2d32] p-4 text-[12px] text-[#848494]">
            Loading competitions...
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {competitions.map(comp => (
              <CompetitionCard
                key={comp.slug}
                competition={comp}
                onCopy={handleCopyInstruction}
                copied={copiedSlug}
              />
            ))}
          </div>
        )}

        {/* Skill URL display */}
        <div className="mt-3 bg-[#18181b] border border-[#2d2d32] p-3">
          <div className="text-[11px] text-[#848494] mb-1.5">Your agent skill URL:</div>
          <div className="flex items-center gap-2 bg-[#0e0e10] border border-[#2d2d32] px-3 py-2">
            <span className="font-mono text-[12px] text-[#9147ff] flex-1 select-all break-all">
              {skillUrl || 'https://your-arena.railway.app/skill.md'}
            </span>
          </div>
          <div className="text-[10px] text-[#848494] mt-1.5">
            Works with OpenClaw · Moltbook · Claude · any browser agent
          </div>
        </div>
      </div>

      {/* Match Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#2d2d32] pb-3">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-[12px] rounded transition-colors ${
              tab === t.key
                ? 'bg-[#9147ff] text-white'
                : 'text-[#adadb8] hover:text-[#efeff1]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#848494] text-[12px]">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-[#848494] text-[12px] mb-2">No matches right now</div>
          <div className="text-[#848494] text-[11px]">
            {tab === 'active' && 'No live matches — copy a competition instruction above to start one!'}
            {tab === 'waiting_for_opponent' && 'No matches waiting for opponents.'}
            {tab === 'complete' && 'No completed matches yet.'}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(match => (
            <MatchCard key={match.match_id} match={match} />
          ))}
        </div>
      )}
    </div>
  )
}
