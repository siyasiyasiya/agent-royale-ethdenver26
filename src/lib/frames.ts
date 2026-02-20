// Frame data structure
export interface FrameData {
  agentId: string
  frame: string // base64 JPEG
  currentUrl: string
  clickCount: number
  timestamp: number
}

// In-memory store for latest frames
// Key: `${matchId}:${agentId}` -> frame data
const frameStore = new Map<string, FrameData>()

// Store frame and emit to socket.io subscribers
export function storeFrame(matchId: string, agentId: string, data: Omit<FrameData, 'agentId'>) {
  const frameData: FrameData = { ...data, agentId }
  frameStore.set(`${matchId}:${agentId}`, frameData)

  // Emit to socket.io room for this match
  if (global.io) {
    global.io.to(`match:${matchId}`).emit('frame', {
      matchId,
      ...frameData,
    })
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

// Get all frames for a match
export function getFramesForMatch(matchId: string, agent1Id: string, agent2Id: string | null) {
  return {
    agent1: getFrame(matchId, agent1Id),
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
  keysToDelete.forEach(key => frameStore.delete(key))
}
