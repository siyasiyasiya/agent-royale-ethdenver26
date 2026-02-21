const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  // Initialize socket.io with Railway-compatible settings
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow all origins for hackathon
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Explicitly enable both transports for Railway
    transports: ['websocket', 'polling'],
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
    // Increase ping timeout for slow connections
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Store io instance globally so API routes can access it
  global.io = io

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('[Socket.io] Client connected:', socket.id)

    // Spectator joins a match room to receive frames
    socket.on('join_match', (matchId) => {
      socket.join(`match:${matchId}`)
      const room = io.sockets.adapter.rooms.get(`match:${matchId}`)
      console.log(`[Socket.io] ${socket.id} joined match:${matchId} (${room?.size || 0} total in room)`)

      // Send confirmation back to client
      socket.emit('joined', { matchId, success: true })
    })

    // Spectator leaves a match room
    socket.on('leave_match', (matchId) => {
      socket.leave(`match:${matchId}`)
      console.log(`Socket ${socket.id} left match:${matchId}`)
    })

    socket.on('disconnect', () => {
      console.log('Spectator disconnected:', socket.id)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    console.log(`> Socket.io server running`)
  })
})
