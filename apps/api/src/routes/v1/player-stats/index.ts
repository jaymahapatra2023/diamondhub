// E11 · Player Profiles & Stats — Routes registered under /api/v1/player-stats
// All routes require authentication
// Upsert requires HEAD_COACH or ASSISTANT_COACH role on a participating team
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/authenticate.js'
import {
  getGameStatsHandler,
  upsertPlayerStatHandler,
  getPlayerSeasonStatsHandler,
  getTeamRecordHandler,
} from './handlers.js'

export async function playerStatsRoutes(app: FastifyInstance) {
  // P2: All player stats routes require a valid JWT
  app.addHook('preHandler', authenticate)

  // GET  /api/v1/player-stats/games/:gameId — all player stats for a game
  app.get('/games/:gameId', getGameStatsHandler)

  // POST /api/v1/player-stats/games/:gameId/players/:playerId — upsert stat (coach)
  app.post('/games/:gameId/players/:playerId', upsertPlayerStatHandler)

  // GET  /api/v1/player-stats/players/:playerId/season — season aggregate stats
  app.get('/players/:playerId/season', getPlayerSeasonStatsHandler)

  // GET  /api/v1/player-stats/teams/:teamId/record — team W/L/T record
  app.get('/teams/:teamId/record', getTeamRecordHandler)
}
