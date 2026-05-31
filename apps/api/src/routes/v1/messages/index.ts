// E10 · Communication & Messaging — Routes registered under /api/v1/messages
// All routes require authentication
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getInboxHandler,
  getTeamMessagesHandler,
  sendTeamMessageHandler,
  getDmMessagesHandler,
  sendDmHandler,
  deleteMessageHandler,
  markReadHandler,
  getAnnouncementsHandler,
  createAnnouncementHandler,
  pinAnnouncementHandler,
} from './handlers.js'

export async function messageRoutes(app: FastifyInstance) {
  // P2: All messaging routes require a valid JWT
  app.addHook('preHandler', authenticate)

  // GET  /api/v1/messages/inbox — unified inbox (all threads for user)
  app.get('/inbox', getInboxHandler)

  // GET  /api/v1/messages/teams/:teamId — team chat messages (paginated)
  app.get('/teams/:teamId', getTeamMessagesHandler)

  // POST /api/v1/messages/teams/:teamId — send to team chat
  app.post('/teams/:teamId', sendTeamMessageHandler)

  // GET  /api/v1/messages/teams/:teamId/dm/:recipientId — DM thread
  app.get('/teams/:teamId/dm/:recipientId', getDmMessagesHandler)

  // POST /api/v1/messages/teams/:teamId/dm/:recipientId — send DM
  app.post('/teams/:teamId/dm/:recipientId', sendDmHandler)

  // GET  /api/v1/messages/teams/:teamId/announcements — list announcements
  app.get('/teams/:teamId/announcements', getAnnouncementsHandler)

  // POST /api/v1/messages/teams/:teamId/announcements — create announcement (coach)
  app.post('/teams/:teamId/announcements', createAnnouncementHandler)

  // PATCH /api/v1/messages/teams/:teamId/announcements/:id/pin — pin/unpin (coach)
  app.patch('/teams/:teamId/announcements/:id/pin', pinAnnouncementHandler)

  // DELETE /api/v1/messages/:messageId — delete message (coach or sender)
  app.delete('/:messageId', deleteMessageHandler)

  // POST /api/v1/messages/:messageId/read — mark read
  app.post('/:messageId/read', markReadHandler)
}
