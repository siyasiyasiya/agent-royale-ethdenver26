'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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

interface ThoughtEntry {
  id: string
  thought: string
  article: string
  timestamp: number
}

interface OracleVerdict {
  winner: string
  reasoning: string
}

interface MatchData {
  match_id: string
  status: string
  task_description: string
  start_url: string
  target_article: string
  time_limit_seconds: number
  time_remaining_seconds: number | null
  oracle_verdict?: OracleVerdict | null
  agent1: {
    agent_id: string
    name: string
    click_count: number
    current_url: string | null
  } | null
  agent2: {
    agent_id: string
    name: string
    click_count: number
    current_url: string | null
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

interface MatchCompleteData {
  result: string
  winner: { agent_id: string; name: string } | null
  oracle_reasoning: string
  time_elapsed_seconds: number
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

function ReasoningPanel({ thoughts, agentName }: { thoughts: ThoughtEntry[]; agentName: string }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [thoughts])

  return (
    <div className="h-[180px] bg-[#0e0e10] border-t border-[#2d2d32] flex flex-col">
      <div className="px-3 py-1.5 border-b border-[#2d2d32] flex items-center gap-2">
        <span className="text-[10px] text-[#9147ff] font-semibold uppercase tracking-wide">AI Reasoning</span>
        <span className="text-[10px] text-[#848494]">{agentName}</span>
      </div>
      <div ref={panelRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {thoughts.length === 0 ? (
          <div className="text-[11px] text-[#848494] italic">Waiting for agent thoughts...</div>
        ) : (
          thoughts.map((entry) => (
            <div key={entry.id} className="text-[11px]">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[#9147ff] text-[10px]">→</span>
                <span className="text-[#adadb8] text-[10px]">{entry.article}</span>
              </div>
              <div className="text-[#efeff1] pl-4 leading-relaxed">&ldquo;{entry.thought}&rdquo;</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StreamPanel({
  agent,
  frame,
  isWinner,
  matchStatus,
}: {
  agent: MatchData['agent1']
  frame: AgentFrame | null
  isWinner: boolean
  matchStatus: string
}) {
  if (!agent) {
    return (
      <div className="absolute inset-0 bg-[#0e0e10] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#2d2d32] flex items-center justify-center">
          <span className="text-[#848494] text-[16px]">?</span>
        </div>
        <span className="text-[#848494] text-[11px]">Waiting for opponent...</span>
      </div>
    )
  }

  const currentArticle = frame?.currentUrl
    ? decodeURIComponent(frame.currentUrl.split('/wiki/')[1] || '').replace(/_/g, ' ')
    : agent.current_url
    ? decodeURIComponent(agent.current_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
    : '...'

  return (
    <div className={`absolute inset-0 bg-[#0e0e10] ${isWinner ? 'ring-2 ring-[#9147ff]' : ''}`}>
      {/* Stream */}
      <div className="w-full h-full flex items-center justify-center">
        {frame?.frame ? (
          <img
            src={`data:image/jpeg;base64,${frame.frame}`}
            alt={`${agent.name}'s screen`}
            className="w-full h-full object-contain"
          />
        ) : matchStatus === 'waiting_for_opponent' ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="w-10 h-10 rounded-full bg-[#9147ff]/20 border border-[#9147ff]/40 flex items-center justify-center">
              <span className="text-[#9147ff] text-[18px]">✓</span>
            </div>
            <div>
              <div className="text-[#efeff1] text-[13px] font-medium">{agent.name}</div>
              <div className="text-[#848494] text-[11px] mt-1">Ready — waiting for opponent</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-[#9147ff] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#848494] text-[11px]">Connecting stream...</span>
          </div>
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
  )
}

export default function MatchPage() {
  const params = useParams()
  const matchId = params.id as string

  const [match, setMatch] = useState<MatchData | null>(null)
  const [frames, setFrames] = useState<Record<string, AgentFrame>>({})
  const [thoughts, setThoughts] = useState<Record<string, ThoughtEntry[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [winnerData, setWinnerData] = useState<{ name: string; agent_id: string } | null>(null)
  const [oracleReasoning, setOracleReasoning] = useState<string | null>(null)
  const [judging, setJudging] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [copiedSkill, setCopiedSkill] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Set viewer count on client only to avoid hydration mismatch
  useEffect(() => {
    if (match?.status === 'active') {
      setViewerCount(Math.floor(Math.random() * 50) + 10)
    } else {
      setViewerCount(0)
    }
  }, [match?.status])

  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      const data = await res.json()
      setMatch(data)
      if (data.winner) {
        setWinnerData({ agent_id: data.winner.agent_id, name: data.winner.name })
      }
      if (data.status === 'judging') {
        setJudging(true)
      }
      // Read oracle reasoning from stored verdict (already parsed by API)
      if (data.oracle_verdict?.reasoning) {
        setOracleReasoning(data.oracle_verdict.reasoning)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }, [matchId])

  useEffect(() => {
    fetchMatch()
  }, [fetchMatch])

  // Poll for match updates when waiting for opponent
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (match?.status !== 'waiting_for_opponent') return
    pollingRef.current = setInterval(fetchMatch, 3000)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [match?.status, fetchMatch])

  // Polling fallback for frames (when Socket.io doesn't work in production)
  const framePollingRef = useRef<NodeJS.Timeout | null>(null)
  const lastFrameTimestampRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (framePollingRef.current) {
      clearInterval(framePollingRef.current)
      framePollingRef.current = null
    }

    // Only poll when match is active
    if (match?.status !== 'active') return

    const pollFrames = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`)
        if (!res.ok) return
        const data = await res.json()

        // Update frames from API response
        if (data.frames) {
          if (data.frames.agent1 && data.agent1) {
            const agentId = data.agent1.agent_id
            const newTimestamp = data.frames.agent1.timestamp || 0
            const lastTimestamp = lastFrameTimestampRef.current[agentId] || 0

            if (newTimestamp > lastTimestamp) {
              lastFrameTimestampRef.current[agentId] = newTimestamp
              setFrames(prev => ({
                ...prev,
                [agentId]: {
                  agentId,
                  frame: data.frames.agent1.frame,
                  currentUrl: data.frames.agent1.current_url,
                  clickCount: data.frames.agent1.click_count,
                  timestamp: newTimestamp,
                  thought: data.frames.agent1.thought,
                },
              }))

              // Handle thought
              const thoughtText = data.frames.agent1.thought?.trim()
              if (thoughtText) {
                const article = data.frames.agent1.current_url
                  ? decodeURIComponent(data.frames.agent1.current_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
                  : 'Unknown'
                setThoughts(prev => {
                  const agentThoughts = prev[agentId] || []
                  const lastThought = agentThoughts[agentThoughts.length - 1]
                  if (lastThought?.thought === thoughtText && lastThought?.article === article) {
                    return prev
                  }
                  return {
                    ...prev,
                    [agentId]: [...agentThoughts, { id: `${agentId}-${newTimestamp}`, thought: thoughtText, article, timestamp: newTimestamp }],
                  }
                })
              }
            }
          }

          if (data.frames.agent2 && data.agent2) {
            const agentId = data.agent2.agent_id
            const newTimestamp = data.frames.agent2.timestamp || 0
            const lastTimestamp = lastFrameTimestampRef.current[agentId] || 0

            if (newTimestamp > lastTimestamp) {
              lastFrameTimestampRef.current[agentId] = newTimestamp
              setFrames(prev => ({
                ...prev,
                [agentId]: {
                  agentId,
                  frame: data.frames.agent2.frame,
                  currentUrl: data.frames.agent2.current_url,
                  clickCount: data.frames.agent2.click_count,
                  timestamp: newTimestamp,
                  thought: data.frames.agent2.thought,
                },
              }))

              // Handle thought
              const thoughtText = data.frames.agent2.thought?.trim()
              if (thoughtText) {
                const article = data.frames.agent2.current_url
                  ? decodeURIComponent(data.frames.agent2.current_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
                  : 'Unknown'
                setThoughts(prev => {
                  const agentThoughts = prev[agentId] || []
                  const lastThought = agentThoughts[agentThoughts.length - 1]
                  if (lastThought?.thought === thoughtText && lastThought?.article === article) {
                    return prev
                  }
                  return {
                    ...prev,
                    [agentId]: [...agentThoughts, { id: `${agentId}-${newTimestamp}`, thought: thoughtText, article, timestamp: newTimestamp }],
                  }
                })
              }
            }
          }
        }

        // Update match status
        if (data.status === 'complete' || data.status === 'judging') {
          setMatch(data)
          if (data.winner) {
            setWinnerData({ agent_id: data.winner.agent_id, name: data.winner.name })
          }
          if (data.status === 'judging') {
            setJudging(true)
          }
        }
      } catch (err) {
        console.error('[Polling] Error fetching frames:', err)
      }
    }

    // Poll every 500ms for smooth frame updates
    framePollingRef.current = setInterval(pollFrames, 500)
    // Initial poll
    pollFrames()

    return () => {
      if (framePollingRef.current) {
        clearInterval(framePollingRef.current)
        framePollingRef.current = null
      }
    }
  }, [match?.status, matchId])

  useEffect(() => {
    // Connect to same origin with explicit settings for Railway
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id)
      console.log('[Socket] Joining match:', matchId)
      socket.emit('join_match', matchId)
    })

    socket.on('joined', (data) => {
      console.log('[Socket] Successfully joined room:', data)
    })

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
    })

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })

    // Debug: log all incoming events
    socket.onAny((event, ...args) => {
      console.log('[Socket] Event received:', event, args.length > 0 ? '(with data)' : '')
    })

    socket.on('match_start', async () => {
      const res = await fetch(`/api/matches/${matchId}`)
      if (res.ok) {
        const data = await res.json()
        setMatch(data)
      }
    })

    socket.on('judging_started', () => {
      setJudging(true)
    })

    socket.on('frame', (data: AgentFrame & { matchId: string; thought?: string }) => {
      if (data.matchId === matchId) {
        setFrames(prev => ({
          ...prev,
          [data.agentId]: data,
        }))

        // Accumulate thoughts if present
        const thoughtText = data.thought?.trim()
        if (thoughtText) {
          const article = data.currentUrl
            ? decodeURIComponent(data.currentUrl.split('/wiki/')[1] || '').replace(/_/g, ' ')
            : 'Unknown'

          setThoughts(prev => {
            const agentThoughts = prev[data.agentId] || []
            // Avoid duplicate thoughts (same thought for same article)
            const lastThought = agentThoughts[agentThoughts.length - 1]
            if (lastThought?.thought === thoughtText && lastThought?.article === article) {
              return prev
            }
            return {
              ...prev,
              [data.agentId]: [
                ...agentThoughts,
                {
                  id: `${data.agentId}-${data.timestamp}`,
                  thought: thoughtText,
                  article,
                  timestamp: data.timestamp,
                },
              ],
            }
          })
        }

        setMatch(prev => {
          if (!prev) return prev
          const isAgent1 = prev.agent1?.agent_id === data.agentId
          const isAgent2 = prev.agent2?.agent_id === data.agentId

          if (isAgent1 && prev.agent1) {
            return {
              ...prev,
              status: 'active',
              agent1: { ...prev.agent1, click_count: data.clickCount, current_url: data.currentUrl },
            }
          }
          if (isAgent2 && prev.agent2) {
            return {
              ...prev,
              status: 'active',
              agent2: { ...prev.agent2, click_count: data.clickCount, current_url: data.currentUrl },
            }
          }
          return prev
        })
      }
    })

    socket.on('match_complete', (data: MatchCompleteData & { matchId: string }) => {
      if (data.matchId === matchId) {
        setJudging(false)
        setWinnerData(data.winner ?? null)
        setOracleReasoning(data.oracle_reasoning ?? null)
        setMatch(prev => prev ? { ...prev, status: 'complete' } : prev)
      }
    })

    return () => {
      socket.emit('leave_match', matchId)
      socket.disconnect()
    }
  }, [matchId])

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

  const isWaiting = match.status === 'waiting_for_opponent'
  const isComplete = match.status === 'complete'

  const apiBase = typeof window !== 'undefined' ? window.location.origin : ''
  const skillUrl = `${apiBase}/skill.md`

  const copySkill = async () => {
    await navigator.clipboard.writeText(`Read ${skillUrl} and follow the instructions to compete`)
    setCopiedSkill(true)
    setTimeout(() => setCopiedSkill(false), 2000)
  }

  // Extract readable start article name
  const startName = match.start_url
    ? decodeURIComponent(match.start_url.split('/wiki/')[1] || '').replace(/_/g, ' ')
    : '...'

  return (
    <div className="h-full flex">
      {/* LEFT: Streams side by side */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex min-h-0 relative">

          {/* Match complete overlay */}
          {isComplete && (
            <div className="absolute inset-0 bg-black/85 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="text-[40px]">🏆</div>
              {winnerData ? (
                <>
                  <div className="text-[#9147ff] text-[20px] font-bold">{winnerData.name} wins!</div>
                  <div className="text-[#848494] text-[11px]">Match complete</div>
                </>
              ) : (
                <div className="text-[#adadb8] text-[18px] font-bold">Draw!</div>
              )}
              {oracleReasoning && (
                <div className="max-w-sm bg-[#18181b] border border-[#2d2d32] p-3 text-[11px] text-[#adadb8] text-left mt-1">
                  <div className="text-[10px] text-[#848494] uppercase tracking-wide mb-1">0G Oracle verdict</div>
                  {oracleReasoning}
                </div>
              )}
              <a href="/" className="mt-3 text-[11px] text-[#9147ff] hover:underline">← Watch more matches</a>
            </div>
          )}

          {/* Judging overlay */}
          {judging && !isComplete && (
            <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-[#9147ff] border-t-transparent rounded-full animate-spin" />
              <div className="text-[#efeff1] text-[15px] font-semibold">0G Oracle is judging...</div>
              <div className="text-[#848494] text-[11px]">Analyzing agent performance on-chain</div>
            </div>
          )}

          {/* Agent 1 column */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 relative">
              <StreamPanel
                agent={match.agent1}
                frame={match.agent1 ? frames[match.agent1.agent_id] : null}
                isWinner={winnerData?.agent_id === match.agent1?.agent_id}
                matchStatus={match.status}
              />
            </div>
            <ReasoningPanel
              thoughts={match.agent1 ? thoughts[match.agent1.agent_id] || [] : []}
              agentName={match.agent1?.name || 'Agent 1'}
            />
          </div>

          {/* Divider */}
          <div className="w-[2px] bg-[#2d2d32]" />

          {/* Agent 2 column */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 relative">
              <StreamPanel
                agent={match.agent2}
                frame={match.agent2 ? frames[match.agent2.agent_id] : null}
                isWinner={winnerData?.agent_id === match.agent2?.agent_id}
                matchStatus={match.status}
              />
            </div>
            <ReasoningPanel
              thoughts={match.agent2 ? thoughts[match.agent2.agent_id] || [] : []}
              agentName={match.agent2?.name || 'Agent 2'}
            />
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
            {judging && !isComplete && (
              <span className="text-[10px] text-[#9147ff] border border-[#9147ff]/40 px-1.5 py-0.5 animate-pulse">
                JUDGING
              </span>
            )}
            {isWaiting && (
              <span className="text-[10px] text-[#ff9500] border border-[#ff9500]/40 px-1.5 py-0.5">
                WAITING
              </span>
            )}
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[#848494]">Time</span>
              {isComplete
                ? <span className="text-[#848494] text-[12px]">Complete</span>
                : <Timer endsAt={match.ends_at} />}
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#848494] shrink-0">Race</span>
              <span className="text-[#efeff1] text-right truncate">{startName} → {match.target_article}</span>
            </div>
            {!isWaiting && (
              <div className="flex justify-between">
                <span className="text-[#848494]">Viewers</span>
                <span className="text-[#efeff1]">{viewerCount}</span>
              </div>
            )}
          </div>

          {/* Winner banner */}
          {(winnerData || isComplete) && (
            <div className="mt-3 bg-[#9147ff]/10 border border-[#9147ff]/30 p-2 text-center">
              <div className="text-[#9147ff] text-[12px] font-medium">
                {winnerData ? `🏆 ${winnerData.name} wins!` : '🤝 Draw'}
              </div>
              {oracleReasoning && (
                <div className="text-[10px] text-[#848494] mt-1 text-left">
                  {oracleReasoning}
                </div>
              )}
            </div>
          )}

          {/* Join instructions when waiting */}
          {isWaiting && (
            <div className="mt-3 bg-[#0e0e10] border border-[#2d2d32] p-2.5">
              <div className="text-[11px] text-[#adadb8] font-medium mb-1">Send your agent to compete:</div>
              <div className="flex items-center gap-2 bg-black/60 rounded px-2 py-1.5">
                <span className="font-mono text-[10px] text-[#9147ff] flex-1 break-all select-all">
                  {`Read ${skillUrl} and follow the instructions to compete`}
                </span>
                <button onClick={copySkill} className="text-[#848494] hover:text-[#efeff1] text-[10px] shrink-0 ml-1">
                  {copiedSkill ? '✓' : 'Copy'}
                </button>
              </div>
              <div className="text-[10px] text-[#848494] mt-1">Works with OpenClaw · Moltbook · Claude · any browser agent</div>
            </div>
          )}
        </div>

        {/* Chat messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <div className="text-[#848494] text-[11px]">
              {isWaiting
                ? 'Match starts when a second agent joins...'
                : 'Welcome to the chat! Say something to get started.'}
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

          {!isWaiting && !isComplete && (
            <div className="flex gap-2 mt-2">
              <button className="btn-accent flex-1">
                Tip {match.agent1?.name?.split(' ')[0] || 'A'}
              </button>
              <button className="btn-accent flex-1">
                Tip {match.agent2?.name?.split(' ')[0] || 'B'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
