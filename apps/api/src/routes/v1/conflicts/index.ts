// E8 · Conflict Detection — Routes registered under /api/v1/conflicts
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getConflictsHandler,
  resolveConflictHandler,
  checkRsvpConflictHandler,
} from './handlers.js'

export async function conflictRoutes(app: FastifyInstance) {
  // P2: All conflict routes require a valid JWT
  app.addHook('preHandler', authenticate)

  // GET /api/v1/conflicts — user's unresolved conflicts (dashboard widget)
  app.get('/', getConflictsHandler)

  // GET /api/v1/conflicts/check-rsvp?eventId=... — RSVP conflict pre-check
  // Must be registered before /:id/resolve to avoid route param capture
  app.get('/check-rsvp', checkRsvpConflictHandler)

  // PATCH /api/v1/conflicts/:id/resolve — mark resolved
  app.patch('/:id/resolve', resolveConflictHandler)
}
