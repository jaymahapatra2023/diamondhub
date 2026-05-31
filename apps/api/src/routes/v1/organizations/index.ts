// E15 · Organization / Club Admin — Routes registered under /api/v1/organizations
// All routes require authentication
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  createOrgHandler,
  getMyOrgHandler,
  getOrgDashboardHandler,
  addCoachHandler,
  linkTeamHandler,
  getOrgPlayersHandler,
} from './handlers.js'

export async function organizationRoutes(app: FastifyInstance) {
  // POST /api/v1/organizations — create org
  app.post('/', { preHandler: authenticate }, createOrgHandler)

  // GET /api/v1/organizations/me — get user's org
  app.get('/me', { preHandler: authenticate }, getMyOrgHandler)

  // GET /api/v1/organizations/:orgId/dashboard — dashboard stats
  app.get('/:orgId/dashboard', { preHandler: authenticate }, getOrgDashboardHandler)

  // POST /api/v1/organizations/:orgId/coaches — add coach by email
  app.post('/:orgId/coaches', { preHandler: authenticate }, addCoachHandler)

  // POST /api/v1/organizations/:orgId/teams — link team to org
  app.post('/:orgId/teams', { preHandler: authenticate }, linkTeamHandler)

  // GET /api/v1/organizations/:orgId/players — cross-team player lookup
  app.get('/:orgId/players', { preHandler: authenticate }, getOrgPlayersHandler)
}
