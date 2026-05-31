// E9 · Live Scoring & Brackets — Socket.io server setup
// P3: WebSocket primary delivery with polling fallback
// P4: emitScoreUpdate called AFTER DB write — never in the DB write path

import { Server as SocketServer } from 'socket.io'
import type { FastifyInstance } from 'fastify'
import { logger } from './logger.js'
import { config } from '../config.js'

let io: SocketServer | null = null

export function setupSocket(app: FastifyInstance): SocketServer {
  io = new SocketServer(app.server, {
    cors: {
      origin: config.CORS_ORIGINS.split(',').map(o => o.trim()),
      credentials: true,
    },
    transports: ['websocket', 'polling'], // polling fallback for P3
  })

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'WebSocket client connected')

    socket.on('join:game', (gameId: string) => {
      void socket.join(`game:${gameId}`)
      logger.info({ socketId: socket.id, gameId }, 'Client joined game room')
    })

    socket.on('join:tournament', (tournamentId: string) => {
      void socket.join(`tournament:${tournamentId}`)
    })

    socket.on('leave:game', (gameId: string) => {
      void socket.leave(`game:${gameId}`)
    })

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'WebSocket client disconnected')
    })
  })

  return io
}

export function getSocket(): SocketServer | null {
  return io
}

// Emit score update to all listeners (called AFTER DB write — P4)
export function emitScoreUpdate(gameId: string, tournamentId: string, gameData: unknown): void {
  if (!io) return
  io.to(`game:${gameId}`).emit('score:update', gameData)
  io.to(`tournament:${tournamentId}`).emit('score:update', gameData)
}
