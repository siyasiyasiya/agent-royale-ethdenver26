'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { io, Socket } from 'socket.io-client'

interface AgentFrame {
  agentId: string
  frame: string
  currentUrl: string
  clickCount: number
  timestamp: number
  thought?: string
}

interface MatchData {
  match_id: string
  name: string
  status: string
  arena: { id: string; name: string; metric_name: string }
  start_article: string
  target_article: string
  time_limit_seconds: number
  time_remaining_seconds: number | null
  prize_pool: number
  agent1: {
    agent_id: string
    name: string
    click_count: number
    path: string[]
    current_url: string | null
    ready?: boolean
  } | null
  agent2: {
    agent_id: string
    name: string
    click_count: number
    path: string[]
    current_url: string | null
    ready?: boolean
  } | null
  winner: { agent_id: string; name: string } | null
  started_at: string | null
  ends_at: string | null
}

interface ChatMessage {
  id: string
  user: string
  message: string
  timestamp: number
}

interface MatchCompleteEvent {
  matchId: string
  winner: {
    agent_id: string
    name: string
    click_count: number
    path: string[]
  }
  time_elapsed_seconds: number
  prize_pool: number
}

function Timer({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!endsAt) return

    const updateTimer = () => {
      const end = new Date(endsAt).getTime()
      const now = Date.now()
      const diff = Math.max(0, Math.floor((end - now) / 1000))
      setRemaining(diff)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [endsAt])

  if (remaining === null) return <span className="text-[#848494]">--:--</span>

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  const color = remaining < 30 ? '#eb0400' : remaining < 60 ? '#ff9500' : '#efeff1'

  return (
    <span style={{ color }} className="font-mono">
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  )
}

function truncatePath(path: string[], maxItems = 3): string {
  if (path.length === 0) return '...'
  if (path.length <= maxItems) return path.join(' → ')
  return '... → ' + path.slice(-maxItems).join(' → ')
}

function StreamPanel({
  agent,
  frame,
  isWinner,
  thoughtHistory,
}: {
  agent: MatchData['agent1']
  frame: AgentFrame | null
  isWinner: boolean
  thoughtHistory: string[]
}) {
  const thoughtsRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest thought
  useEffect(() => {
    if (thoughtsRef.current) {
      thoughtsRef.current.scrollTop = thoughtsRef.current.scrollHeight
    }
  }, [thoughtHistory])

  if (!agent) {
    return (
      <div className="flex-1 bg-[#0e0e10] flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[#848494] text-[11px]">Waiting for agent...</span>
        </div>
        <div className="h-[200px] bg-[#18181b] border-t border-[#2d2d32]" />
      </div>
    )
  }

  const currentArticle = frame?.currentUrl
    ? decodeURIComponent(frame.currentUrl.split('/wiki/')[1] || '').replace(/_/g, ' ')
    : agent.path[agent.path.length - 1] || '...'

  return (
    <div className={`flex-1 bg-[#0e0e10] flex flex-col ${isWinner ? 'ring-2 ring-[#9147ff]' : ''}`}>
      {/* Stream */}
      <div className="flex-1 relative min-h-0">
        <div className="w-full h-full flex items-center justify-center">
          {frame?.frame ? (
            <img
              src={`data:image/jpeg;base64,${frame.frame}`}
              alt={`${agent.name}'s screen`}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-[#848494] text-[11px]">Waiting for stream...</span>
          )}
        </div>

        {/* Overlay bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-1.5 flex items-center justify-between">
          <span className="text-[11px] text-[#efeff1] font-medium">
            {agent.name}
            {isWinner && <span className="ml-2 text-[#9147ff]">WINNER</span>}
          </span>
          <span className="text-[11px] text-[#adadb8] truncate mx-4 flex-1 text-center">
            {currentArticle}
          </span>
          <span className="text-[11px] text-[#efeff1]">
            {frame?.clickCount ?? agent.click_count} clicks
          </span>
        </div>
      </div>

      {/* AI Thought Panel */}
      <div className="h-[200px] bg-[#18181b] border-t border-[#2d2d32] px-3 py-2 flex flex-col">
        <div className="text-[10px] text-[#9147ff] font-medium mb-1 shrink-0">AI REASONING</div>
        <div ref={thoughtsRef} className="text-[12px] text-[#adadb8] overflow-y-auto flex-1 leading-relaxed space-y-2">
          {thoughtHistory.length > 0 ? (
            thoughtHistory.map((thought, idx) => (
              <div key={idx} className="border-l-2 border-[#9147ff]/30 pl-2">
                <span className="text-[10px] text-[#848494]">#{idx + 1}</span>
                <p className="whitespace-pre-wrap">{thought}</p>
              </div>
            ))
          ) : (
            <span className="text-[#848494]">Thinking...</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MatchPage() {
  const params = useParams()
  const matchId = params.id as string

  const [match, setMatch] = useState<MatchData | null>(null)
  const [frames, setFrames] = useState<Record<string, AgentFrame>>({})
  const [thoughts, setThoughts] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [winner, setWinner] = useState<MatchCompleteEvent['winner'] | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  // Simulated viewer count
  const viewerCount = match?.status === 'active' ? Math.floor(Math.random() * 50) + 10 : 0

  // Fetch initial match data
  useEffect(() => {
    async function fetchMatch() {
      try {
        const res = await fetch(`/api/matches/${matchId}`)
        if (!res.ok) throw new Error('Match not found')
        const data = await res.json()
        setMatch(data)
        if (data.winner) {
          setWinner({
            agent_id: data.winner.agent_id,
            name: data.winner.name,
            click_count: 0,
            path: [],
          })
        }
      } catch (err) {
        setError((err as Error).message)
      }
    }
    fetchMatch()
  }, [matchId])

  // Socket.io connection
  useEffect(() => {
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join_match', matchId)
    })

    socket.on('frame', (data: AgentFrame & { matchId: string }) => {
      if (data.matchId === matchId) {
        setFrames(prev => ({
          ...prev,
          [data.agentId]: data,
        }))

        // Debug: log when we receive a thought
        if (data.thought) {
          console.log(`[Frame] Agent ${data.agentId} thought:`, data.thought.substring(0, 50))
        }

        // Accumulate thoughts (only add if it's new and not empty)
        if (data.thought && data.thought.trim() && data.thought !== 'Thinking...') {
          setThoughts(prev => {
            const agentThoughts = prev[data.agentId] || []
            const lastThought = agentThoughts[agentThoughts.length - 1]
            // Only add if different from last thought
            if (lastThought !== data.thought) {
              console.log(`[Thoughts] Adding new thought for ${data.agentId}:`, data.thought.substring(0, 50))
              return {
                ...prev,
                [data.agentId]: [...agentThoughts, data.thought],
              }
            }
            return prev
          })
        }

        setMatch(prev => {
          if (!prev) return prev
          const isAgent1 = prev.agent1?.agent_id === data.agentId
          const isAgent2 = prev.agent2?.agent_id === data.agentId

          if (isAgent1 && prev.agent1) {
            const article = data.currentUrl?.split('/wiki/')[1]?.replace(/_/g, ' ')
            const newPath = article && !prev.agent1.path.includes(article)
              ? [...prev.agent1.path, decodeURIComponent(article)]
              : prev.agent1.path
            return {
              ...prev,
              agent1: { ...prev.agent1, click_count: data.clickCount, path: newPath },
            }
          }
          if (isAgent2 && prev.agent2) {
            const article = data.currentUrl?.split('/wiki/')[1]?.replace(/_/g, ' ')
            const newPath = article && !prev.agent2.path.includes(article)
              ? [...prev.agent2.path, decodeURIComponent(article)]
              : prev.agent2.path
            return {
              ...prev,
              agent2: { ...prev.agent2, click_count: data.clickCount, path: newPath },
            }
          }
          return prev
        })
      }
    })

    socket.on('match_complete', (data: MatchCompleteEvent) => {
      if (data.matchId === matchId) {
        setWinner(data.winner)
        setMatch(prev => prev ? { ...prev, status: 'complete' } : prev)
      }
    })

    // Handle match paired event (both agents joined, waiting for ready)
    socket.on('match_paired', (data: { matchId: string; agent1: { agent_id: string; name: string }; agent2: { agent_id: string; name: string } }) => {
      if (data.matchId === matchId) {
        setMatch(prev => prev ? {
          ...prev,
          status: 'ready_check',
          agent2: prev.agent2 || {
            agent_id: data.agent2.agent_id,
            name: data.agent2.name,
            click_count: 0,
            path: [],
            current_url: null,
            ready: false,
          },
        } : prev)
      }
    })

    // Handle agent ready event
    socket.on('agent_ready', (data: { matchId: string; agent_id: string }) => {
      if (data.matchId === matchId) {
        setMatch(prev => {
          if (!prev) return prev
          if (prev.agent1?.agent_id === data.agent_id) {
            return { ...prev, agent1: { ...prev.agent1, ready: true } }
          }
          if (prev.agent2?.agent_id === data.agent_id) {
            return { ...prev, agent2: { ...prev.agent2, ready: true } }
          }
          return prev
        })
      }
    })

    // Handle match start event (both agents ready, race begins)
    socket.on('match_start', (data: { matchId: string; started_at: string; ends_at: string }) => {
      if (data.matchId === matchId) {
        setMatch(prev => prev ? {
          ...prev,
          status: 'active',
          started_at: data.started_at,
          ends_at: data.ends_at,
        } : prev)
      }
    })

    // Handle match timeout event
    socket.on('match_timeout', (data: { matchId: string }) => {
      if (data.matchId === matchId) {
        setMatch(prev => prev ? { ...prev, status: 'complete' } : prev)
      }
    })

    return () => {
      socket.emit('leave_match', matchId)
      socket.disconnect()
    }
  }, [matchId])

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      user: 'You',
      message: chatInput.trim(),
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, newMessage])
    setChatInput('')
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#eb0400] text-[12px] mb-2">{error}</div>
          <a href="/" className="text-[#9147ff] text-[11px] hover:underline">Back to browse</a>
        </div>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-[#848494] text-[12px]">Loading...</span>
      </div>
    )
  }

  const agent1Path = match.agent1?.path || []
  const agent2Path = match.agent2?.path || []

  return (
    <div className="h-full flex">
      {/* LEFT: Streams side by side */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Streams row */}
        <div className="flex-1 flex min-h-0">
          {/* Agent 1 stream */}
          <StreamPanel
            agent={match.agent1}
            frame={match.agent1 ? frames[match.agent1.agent_id] : null}
            isWinner={winner?.agent_id === match.agent1?.agent_id}
            thoughtHistory={match.agent1 ? thoughts[match.agent1.agent_id] || [] : []}
          />

          {/* Divider */}
          <div className="w-[2px] bg-[#2d2d32]" />

          {/* Agent 2 stream */}
          <StreamPanel
            agent={match.agent2}
            frame={match.agent2 ? frames[match.agent2.agent_id] : null}
            isWinner={winner?.agent_id === match.agent2?.agent_id}
            thoughtHistory={match.agent2 ? thoughts[match.agent2.agent_id] || [] : []}
          />
        </div>

        {/* Path bar at bottom */}
        <div className="bg-[#18181b] border-t border-[#2d2d32] px-3 py-1.5 text-[11px] flex items-center gap-4">
          <div className="flex-1 truncate">
            <span className="text-[#adadb8]">{match.agent1?.name || 'Agent 1'}:</span>{' '}
            <span className="text-[#848494]">{truncatePath(agent1Path)}</span>
          </div>
          <div className="text-[#2d2d32]">|</div>
          <div className="flex-1 truncate text-right">
            <span className="text-[#adadb8]">{match.agent2?.name || 'Agent 2'}:</span>{' '}
            <span className="text-[#848494]">{truncatePath(agent2Path)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT: Chat panel */}
      <div className="w-[340px] bg-[#18181b] border-l border-[#2d2d32] flex flex-col">
        {/* Match info header */}
        <div className="p-3 border-b border-[#2d2d32]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-[#efeff1] font-medium">Wikipedia Speedrun</span>
            {match.status === 'active' && <span className="live-badge">LIVE</span>}
            {match.status === 'ready_check' && <span className="text-[10px] bg-[#ff9500] text-black px-1.5 py-0.5 font-semibold">READY CHECK</span>}
            {match.status === 'waiting_for_opponent' && <span className="text-[10px] bg-[#848494] text-black px-1.5 py-0.5 font-semibold">WAITING</span>}
            {match.status === 'complete' && <span className="text-[10px] bg-[#2d2d32] text-[#adadb8] px-1.5 py-0.5 font-semibold">COMPLETE</span>}
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[#848494]">Time</span>
              <Timer endsAt={match.ends_at} />
            </div>
            <div className="flex justify-between">
              <span className="text-[#848494]">Target</span>
              <span className="text-[#efeff1]">{match.target_article}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#848494]">Viewers</span>
              <span className="text-[#efeff1]">{viewerCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#848494]">Prize</span>
              <span className="text-[#efeff1]">${match.prize_pool.toFixed(2)}</span>
            </div>
          </div>

          {/* Ready check banner */}
          {match.status === 'ready_check' && (
            <div className="mt-3 bg-[#ff9500]/10 border border-[#ff9500]/30 p-2">
              <div className="text-[#ff9500] text-[12px] font-medium mb-1">Waiting for agents to ready up</div>
              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-[#adadb8]">{match.agent1?.name || 'Agent 1'}</span>
                  <span className={match.agent1?.ready ? 'text-[#00c853]' : 'text-[#848494]'}>
                    {match.agent1?.ready ? 'READY' : 'waiting...'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#adadb8]">{match.agent2?.name || 'Agent 2'}</span>
                  <span className={match.agent2?.ready ? 'text-[#00c853]' : 'text-[#848494]'}>
                    {match.agent2?.ready ? 'READY' : 'waiting...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Winner banner */}
          {winner && (
            <div className="mt-3 bg-[#9147ff]/10 border border-[#9147ff]/30 p-2 text-center">
              <div className="text-[#9147ff] text-[12px] font-medium">
                {winner.name} wins!
              </div>
              <div className="text-[#848494] text-[11px]">
                {winner.click_count} clicks
              </div>
            </div>
          )}

          {/* Timeout banner (complete without winner) */}
          {match.status === 'complete' && !winner && (
            <div className="mt-3 bg-[#848494]/10 border border-[#848494]/30 p-2 text-center">
              <div className="text-[#848494] text-[12px] font-medium">
                Match ended - Timeout
              </div>
            </div>
          )}
        </div>

        {/* Chat messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <div className="text-[#848494] text-[11px]">
              Welcome to the chat! Say something to get started.
            </div>
          ) : (
            <div className="space-y-0.5">
              {messages.map(msg => (
                <div key={msg.id} className="text-[12px]">
                  <span className="text-[#adadb8]">{msg.user}:</span>{' '}
                  <span className="text-[#efeff1]">{msg.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat input */}
        <div className="p-3 border-t border-[#2d2d32]">
          <form onSubmit={handleSendMessage}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Send a message"
              className="w-full bg-[#0e0e10] border border-[#2d2d32] px-3 py-2 text-[12px] text-[#efeff1] placeholder-[#848494] focus:outline-none focus:border-[#9147ff]"
            />
          </form>

          {/* Tip buttons */}
          <div className="flex gap-2 mt-2">
            <button className="btn-accent flex-1">
              Tip {match.agent1?.name?.split(' ')[0] || 'A'}
            </button>
            <button className="btn-accent flex-1">
              Tip {match.agent2?.name?.split(' ')[0] || 'B'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
