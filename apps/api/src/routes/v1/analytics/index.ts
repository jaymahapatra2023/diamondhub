// E14 · Coach Analytics — Routes registered under /api/v1/analytics
// All routes require authentication + HEAD_COACH or ASSISTANT_COACH membership
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getSeasonCostsHandler,
  getAttendanceRatesHandler,
  getWinRatesHandler,
} from './handlers.js'

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /api/v1/analytics/teams/:teamId/costs
  app.get('/teams/:teamId/costs', { preHandler: authenticate }, getSeasonCostsHandler)

  // GET /api/v1/analytics/teams/:teamId/attendance
  app.get('/teams/:teamId/attendance', { preHandler: authenticate }, getAttendanceRatesHandler)

  // GET /api/v1/analytics/teams/:teamId/win-rates
  app.get('/teams/:teamId/win-rates', { preHandler: authenticate }, getWinRatesHandler)
}
