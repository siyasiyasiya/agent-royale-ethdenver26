const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  // Initialize socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow all origins for hackathon
      methods: ['GET', 'POST'],
    },
  })

  // Store io instance globally so API routes can access it
  global.io = io

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('Spectator connected:', socket.id)

    // Spectator joins a match room to receive frames
    socket.on('join_match', (matchId) => {
      socket.join(`match:${matchId}`)
      console.log(`Socket ${socket.id} joined match:${matchId}`)
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
