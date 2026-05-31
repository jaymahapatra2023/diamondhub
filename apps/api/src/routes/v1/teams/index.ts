// E3 · Team Management routes — all registered under /api/v1/teams
// P2: authenticate hook applied globally; individual handlers add role gates
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  listTeamsHandler,
  createTeamHandler,
  getTeamHandler,
  updateTeamHandler,
  getRosterHandler,
  addPlayerHandler,
  updateMemberHandler,
  archivePlayerHandler,
  createInviteHandler,
  getPendingInvitesHandler,
  revokeInviteHandler,
  acceptInviteHandler,
  getEmergencyContactHandler,
  setEmergencyContactHandler,
  getDocumentUploadUrlHandler,
  recordDocumentHandler,
  getDocumentsHandler,
  setRsvpHandler,
  getRsvpsHandler,
  assignRoleHandler,
  createLinkRequestHandler,
  getLinkRequestsHandler,
  updateLinkRequestHandler,
} from './handlers.js'

export async function teamRoutes(app: FastifyInstance) {
  // P2: All team routes require a valid JWT — set globally for this scope
  app.addHook('preHandler', authenticate)

  // ── Team CRUD ───────────────────────────────────────────────────────────────
  app.get('/', listTeamsHandler)                // GET  /teams
  app.post('/', createTeamHandler)              // POST /teams

  app.get('/:teamId', getTeamHandler)           // GET  /teams/:teamId
  app.patch('/:teamId', updateTeamHandler)      // PATCH /teams/:teamId

  // ── Roster ─────────────────────────────────────────────────────────────────
  app.get('/:teamId/roster', getRosterHandler)
  app.post('/:teamId/roster', addPlayerHandler)
  app.patch('/:teamId/roster/:memberId', updateMemberHandler)
  app.delete('/:teamId/roster/:memberId', archivePlayerHandler)

  // ── Invites ────────────────────────────────────────────────────────────────
  app.post('/:teamId/invites', createInviteHandler)
  app.get('/:teamId/invites', getPendingInvitesHandler)
  app.delete('/:teamId/invites/:inviteId', revokeInviteHandler)

  // Accept invite — no teamId needed, token carries all context
  app.post('/join/:token', acceptInviteHandler)

  // ── Emergency contacts (coach/assistant only) ──────────────────────────────
  app.get('/:teamId/roster/:memberId/emergency-contact', getEmergencyContactHandler)
  app.put('/:teamId/roster/:memberId/emergency-contact', setEmergencyContactHandler)

  // ── Player documents (coach/assistant only) ────────────────────────────────
  app.post('/:teamId/roster/:memberId/documents/upload-url', getDocumentUploadUrlHandler)
  app.post('/:teamId/roster/:memberId/documents', recordDocumentHandler)
  app.get('/:teamId/roster/:memberId/documents', getDocumentsHandler)

  // ── RSVP (any team member) ─────────────────────────────────────────────────
  app.post('/:teamId/events/:eventId/rsvp', setRsvpHandler)
  app.get('/:teamId/events/:eventId/rsvp', getRsvpsHandler)

  // ── Role assignment (HEAD_COACH only) ──────────────────────────────────────
  app.patch('/:teamId/roster/:memberId/role', assignRoleHandler)

  // ── Parent-player link requests (E3-S5) ────────────────────────────────────
  app.post('/:teamId/link-requests', createLinkRequestHandler)    // parent requests link to player
  app.get('/:teamId/link-requests', getLinkRequestsHandler)        // coach sees pending requests
  app.patch('/:teamId/link-requests/:linkId', updateLinkRequestHandler)  // coach approves/rejects
}
