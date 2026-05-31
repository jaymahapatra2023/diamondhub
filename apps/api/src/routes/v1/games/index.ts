// E9 · Live Scoring & Brackets — Routes registered under /api/v1/games
// Public routes: GET game, tournament games, bracket, standings, history
// Protected routes: PATCH score, POST scorekeeper, POST create game
import type { FastifyInstance } from 'fastify'
import { optionalAuthenticate, authenticate } from '../../../middleware/authenticate.js'
import {
  getTournamentGamesHandler,
  getBracketHandler,
  getStandingsHandler,
  getTeamGameHistoryHandler,
  getGameHandler,
  updateScoreHandler,
  assignScorekeeperHandler,
  createGameHandler,
  updateGameDetailsHandler,
} from './handlers.js'

export async function gameRoutes(app: FastifyInstance) {
  // ── Public read routes (optional auth for isUserTeam enrichment) ───────────

  // GET /api/v1/games/tournaments/:tournamentId — all games for a tournament
  app.get('/tournaments/:tournamentId', { preHandler: optionalAuthenticate }, getTournamentGamesHandler)

  // GET /api/v1/games/tournaments/:tournamentId/bracket — bracket view
  app.get('/tournaments/:tournamentId/bracket', { preHandler: optionalAuthenticate }, getBracketHandler)

  // GET /api/v1/games/tournaments/:tournamentId/standings — pool standings
  app.get('/tournaments/:tournamentId/standings', getStandingsHandler)

  // GET /api/v1/games/:gameId — single game (public for live score display)
  app.get('/:gameId', { preHandler: optionalAuthenticate }, getGameHandler)

  // ── Protected routes ───────────────────────────────────────────────────────

  // GET /api/v1/games/teams/:teamId/history — team game history
  app.get('/teams/:teamId/history', { preHandler: authenticate }, getTeamGameHistoryHandler)

  // PATCH /api/v1/games/:gameId/score — update score (scorekeeper/coach)
  app.patch('/:gameId/score', { preHandler: authenticate }, updateScoreHandler)

  // POST /api/v1/games/:gameId/scorekeeper — assign scorekeeper
  app.post('/:gameId/scorekeeper', { preHandler: authenticate }, assignScorekeeperHandler)

  // POST /api/v1/games — create a game (tournament organizer/admin)
  app.post('/', { preHandler: authenticate }, createGameHandler)

  // PATCH /api/v1/games/:gameId/details — update game schedule/field (E5-S3)
  app.patch('/:gameId/details', { preHandler: authenticate }, updateGameDetailsHandler)
}
