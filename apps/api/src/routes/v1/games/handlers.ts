// E9 · Live Scoring & Brackets — Route Handlers
// P3: WebSocket primary, REST polling fallback (30s)
// P4: Socket.io emits happen AFTER DB write

import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { UpdateScoreRequestSchema } from '@diamondhub/contracts'
import { gameService, GameError } from '../../../services/game.service.js'
import { emitScoreUpdate } from '../../../lib/socket.js'
import { prisma } from '@diamondhub/db'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendValidationError(reply: FastifyReply, err: ZodError) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    details: err.flatten().fieldErrors,
  })
}

function mapGameToResponse(game: any) {
  return {
    id: game.id,
    tournamentId: game.tournamentId,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeamName: game.homeTeam?.name ?? '',
    awayTeamName: game.awayTeam?.name ?? '',
    field: game.field,
    round: game.round,
    pool: game.pool,
    gameNumber: game.gameNumber,
    scheduledTime: game.scheduledTime instanceof Date ? game.scheduledTime.toISOString() : game.scheduledTime,
    actualStartTime: game.actualStartTime instanceof Date
      ? game.actualStartTime.toISOString()
      : game.actualStartTime ?? null,
    scoreHome: game.scoreHome,
    scoreAway: game.scoreAway,
    inning: game.inning,
    half: game.half,
    status: game.status,
    winnerId: game.winnerId ?? null,
    inningsDetail: game.inningsDetail ?? [],
    updatedAt: game.updatedAt instanceof Date ? game.updatedAt.toISOString() : game.updatedAt,
  }
}

// ── GET /api/v1/games/tournaments/:tournamentId — all games ───────────────────

export async function getTournamentGamesHandler(
  request: FastifyRequest<{ Params: { tournamentId: string } }>,
  reply: FastifyReply,
) {
  const { tournamentId } = request.params
  const games = await gameService.getTournamentGames(tournamentId)
  return reply.code(200).send(games.map(mapGameToResponse))
}

// ── GET /api/v1/games/tournaments/:tournamentId/bracket ───────────────────────

export async function getBracketHandler(
  request: FastifyRequest<{ Params: { tournamentId: string } }>,
  reply: FastifyReply,
) {
  const { tournamentId } = request.params
  const userId = request.user?.sub

  // Optionally get user's team for isUserTeam flag
  let userTeamId: string | undefined
  if (userId) {
    const membership = await prisma.teamMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { teamId: true },
    })
    userTeamId = membership?.teamId
  }

  const bracket = await gameService.getBracket(tournamentId, userTeamId)
  return reply.code(200).send(bracket)
}

// ── GET /api/v1/games/tournaments/:tournamentId/standings ─────────────────────

export async function getStandingsHandler(
  request: FastifyRequest<{ Params: { tournamentId: string } }>,
  reply: FastifyReply,
) {
  const { tournamentId } = request.params
  const query = request.query as { pool?: string }
  const standings = await gameService.getStandings(tournamentId, query.pool)
  return reply.code(200).send(standings)
}

// ── GET /api/v1/games/teams/:teamId/history ───────────────────────────────────

export async function getTeamGameHistoryHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const history = await gameService.getTeamGameHistory(teamId)
  return reply.code(200).send(history)
}

// ── GET /api/v1/games/:gameId — single game (public for live score) ──────────

export async function getGameHandler(
  request: FastifyRequest<{ Params: { gameId: string } }>,
  reply: FastifyReply,
) {
  const { gameId } = request.params
  const game = await gameService.getGame(gameId)
  if (!game) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
  }
  return reply.code(200).send(mapGameToResponse(game))
}

// ── PATCH /api/v1/games/:gameId/score — update score (scorekeeper/coach auth) ─

export async function updateScoreHandler(
  request: FastifyRequest<{ Params: { gameId: string } }>,
  reply: FastifyReply,
) {
  const { gameId } = request.params
  const userId = request.user!.sub

  // Determine which team the user represents (must be coach of home or away team)
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
    },
    select: { teamId: true },
  })

  // Also allow if user is assigned scorekeeper
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { scorekeeperId: true, homeTeamId: true, awayTeamId: true },
  })

  if (!game) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
  }

  // Determine teamId: if user is scorekeeper, use homeTeamId; otherwise use their coaching team
  const isScorekeeper = game.scorekeeperId === userId
  const teamId = isScorekeeper
    ? game.homeTeamId
    : membership?.teamId

  if (!teamId) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You must be a coach or assigned scorekeeper for this game',
    })
  }

  const parsed = UpdateScoreRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  try {
    const updated = await gameService.updateScore(gameId, teamId, parsed.data)
    const responseData = mapGameToResponse(updated)

    // Emit after DB write (P3: WebSocket enhancement, not required path)
    emitScoreUpdate(gameId, updated.tournamentId, responseData)

    return reply.code(200).send(responseData)
  } catch (err) {
    if (err instanceof GameError) {
      if (err.statusCode === 403) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You are not a participant in this game' })
      }
      if (err.statusCode === 404) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
      }
    }
    throw err
  }
}

// ── PATCH /api/v1/games/:gameId/details — update game schedule/field (E5-S3) ──

export async function updateGameDetailsHandler(
  request: FastifyRequest<{ Params: { gameId: string } }>,
  reply: FastifyReply,
) {
  const { gameId } = request.params
  const body = request.body as { scheduledTime?: string; field?: string }

  const oldGame = await gameService.getGame(gameId)
  if (!oldGame) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
  }

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: {
      ...(body.scheduledTime && { scheduledTime: new Date(body.scheduledTime) }),
      ...(body.field && { field: body.field }),
    },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } }
  })

  // Trigger notification if time changed (E5-S3)
  if (body.scheduledTime && oldGame.scheduledTime.toISOString() !== body.scheduledTime) {
    const { notificationService } = await import('../../../services/notification.service.js')
    await notificationService.sendGameTimeChange(
      gameId,
      updated.tournamentId,
      oldGame.scheduledTime.toISOString(),
      body.scheduledTime,
      body.field,
    )
  }

  return reply.code(200).send(mapGameToResponse(updated))
}

// ── POST /api/v1/games — create game (tournament organizer/admin) ─────────────

export async function createGameHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = request.body as any

  if (!body.tournamentId || !body.homeTeamId || !body.awayTeamId || !body.scheduledTime) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'tournamentId, homeTeamId, awayTeamId, and scheduledTime are required',
    })
  }

  const game = await gameService.createGame({
    tournamentId: body.tournamentId,
    homeTeamId: body.homeTeamId,
    awayTeamId: body.awayTeamId,
    field: body.field,
    round: body.round,
    pool: body.pool,
    gameNumber: body.gameNumber,
    scheduledTime: new Date(body.scheduledTime),
  })

  return reply.code(201).send(mapGameToResponse(game))
}

// ── POST /api/v1/games/:gameId/scorekeeper — assign scorekeeper (coach auth) ──

export async function assignScorekeeperHandler(
  request: FastifyRequest<{ Params: { gameId: string } }>,
  reply: FastifyReply,
) {
  const { gameId } = request.params
  const userId = request.user!.sub
  const body = request.body as { scorekeeperId?: string }

  if (!body.scorekeeperId) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'scorekeeperId is required',
    })
  }

  // Verify user is a coach of one of the game's teams
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { homeTeamId: true, awayTeamId: true },
  })

  if (!game) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
      teamId: { in: [game.homeTeamId, game.awayTeamId] },
    },
  })

  if (!membership) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You must be a coach of a participating team',
    })
  }

  const updated = await gameService.assignScorekeeper(gameId, body.scorekeeperId)
  return reply.code(200).send(mapGameToResponse(updated))
}
