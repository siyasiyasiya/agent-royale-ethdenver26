// Frame data structure
export interface FrameData {
  agentId: string
  frame: string // base64 JPEG
  currentUrl: string
  clickCount: number
  timestamp: number
  thought?: string // AI reasoning
}

// In-memory store for latest frames
// Key: `${matchId}:${agentId}` -> frame data
const frameStore = new Map<string, FrameData>()

// In-memory store for full frame history (screen recording)
// Key: `${matchId}:${agentId}` -> ordered list of all frames
const frameHistory = new Map<string, FrameData[]>()

// Store frame and emit to socket.io subscribers
export function storeFrame(matchId: string, agentId: string, data: Omit<FrameData, 'agentId'>) {
  const frameData: FrameData = { ...data, agentId }
  frameStore.set(`${matchId}:${agentId}`, frameData)

  // Append to history for full recording
  const key = `${matchId}:${agentId}`
  const history = frameHistory.get(key) || []
  history.push(frameData)
  frameHistory.set(key, history)

  // Debug: log when emitting thought
  if (data.thought && data.thought.trim()) {
    console.log(`[Frame emit] ${agentId} thought: ${data.thought.substring(0, 50)}...`)
  }

  // Emit to socket.io room for this match
  if (global.io) {
    const room = `match:${matchId}`
    const sockets = global.io.sockets.adapter.rooms.get(room)
    const clientCount = sockets?.size || 0
    if (clientCount > 0) {
      console.log(`[Socket] Emitting frame to ${room} (${clientCount} clients)`)
    }
    global.io.to(room).emit('frame', {
      matchId,
      ...frameData,
    })
  } else {
    console.log('[Socket] WARNING: global.io not available - frames not being broadcast!')
  }
}

// Emit match event (start, end, victory claim, etc.)
export function emitMatchEvent(matchId: string, event: string, data: unknown) {
  if (global.io) {
    global.io.to(`match:${matchId}`).emit(event, {
      matchId,
      ...data as object,
    })
  }
}

// Get latest frame for an agent
export function getFrame(matchId: string, agentId: string): FrameData | null {
  return frameStore.get(`${matchId}:${agentId}`) || null
}

// Get full frame history for an agent (screen recording)
export function getFrameHistory(matchId: string, agentId: string): FrameData[] {
  return frameHistory.get(`${matchId}:${agentId}`) || []
}

// Get all frames for a match
export function getFramesForMatch(matchId: string, agent1Id: string | null, agent2Id: string | null) {
  return {
    agent1: agent1Id ? getFrame(matchId, agent1Id) : null,
    agent2: agent2Id ? getFrame(matchId, agent2Id) : null,
  }
}

// Clear frames when match ends
export function clearMatchFrames(matchId: string) {
  const keysToDelete: string[] = []
  frameStore.forEach((_, key) => {
    if (key.startsWith(`${matchId}:`)) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => {
    frameStore.delete(key)
    frameHistory.delete(key)
  })
}
