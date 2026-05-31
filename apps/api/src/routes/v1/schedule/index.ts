// E4 · Schedule & Calendar routes — all registered under /api/v1/schedule
// P2: authenticate hook applied globally; individual handlers add role gates
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getUserEventsHandler,
  getTeamEventsHandler,
  exportIcsHandler,
  createEventHandler,
  updateEventHandler,
  cancelEventHandler,
  getEventByIdHandler,
} from './handlers.js'

export async function scheduleRoutes(app: FastifyInstance) {
  // P2: All schedule routes require a valid JWT — set globally for this scope
  app.addHook('preHandler', authenticate)

  // ── User-level calendar (all teams) ────────────────────────────────────────
  // GET /api/v1/schedule?start=...&end=...
  app.get('/', getUserEventsHandler)

  // ── Team-scoped calendar ───────────────────────────────────────────────────
  // GET /api/v1/schedule/teams/:teamId?start=...&end=...
  app.get('/teams/:teamId', getTeamEventsHandler)

  // GET /api/v1/schedule/teams/:teamId/export.ics
  app.get('/teams/:teamId/export.ics', exportIcsHandler)

  // ── Event CRUD (coach/assistant only for write operations) ─────────────────
  // POST /api/v1/schedule/teams/:teamId/events
  app.post('/teams/:teamId/events', createEventHandler)

  // GET /api/v1/schedule/teams/:teamId/events/:eventId
  app.get('/teams/:teamId/events/:eventId', getEventByIdHandler)

  // PATCH /api/v1/schedule/teams/:teamId/events/:eventId
  app.patch('/teams/:teamId/events/:eventId', updateEventHandler)

  // DELETE /api/v1/schedule/teams/:teamId/events/:eventId (soft-cancel)
  app.delete('/teams/:teamId/events/:eventId', cancelEventHandler)
}
