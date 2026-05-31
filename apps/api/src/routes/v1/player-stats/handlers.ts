// E11 · Player Profiles & Stats — Route Handlers
// P2: Coach-only guard on upsert endpoint
// P9: Zod validation on all inputs

import type { FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodError } from 'zod'
import { playerStatsService } from '../../../services/player-stats.service.js'
import { prisma } from '@diamondhub/db'

// ── Input schemas ─────────────────────────────────────────────────────────────

const UpsertStatSchema = z.object({
  atBats: z.number().int().min(0),
  hits: z.number().int().min(0),
  doubles: z.number().int().min(0),
  triples: z.number().int().min(0),
  homeRuns: z.number().int().min(0),
  rbi: z.number().int().min(0),
  walks: z.number().int().min(0),
  strikeouts: z.number().int().min(0),
  inningsPitched: z.number().min(0),
  earnedRuns: z.number().int().min(0),
  pitchingWin: z.boolean().nullable().optional(),
})

const SeasonQuerySchema = z.object({
  season: z.coerce.number().int().min(2000).max(2100).optional(),
})

// ── Error helpers ─────────────────────────────────────────────────────────────

function sendValidationError(reply: FastifyReply, err: ZodError) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    details: err.flatten().fieldErrors,
  })
}

// ── GET /api/v1/player-stats/games/:gameId ───────────────────────────────────

export async function getGameStatsHandler(
  request: FastifyRequest<{ Params: { gameId: string } }>,
  reply: FastifyReply,
) {
  const { gameId } = request.params
  const stats = await playerStatsService.getGameStats(gameId)
  return reply.code(200).send(stats)
}

// ── POST /api/v1/player-stats/games/:gameId/players/:playerId ────────────────

export async function upsertPlayerStatHandler(
  request: FastifyRequest<{ Params: { gameId: string; playerId: string } }>,
  reply: FastifyReply,
) {
  const { gameId, playerId } = request.params
  const userId = request.user!.sub

  // Verify user is a coach of one of the game's teams
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { homeTeamId: true, awayTeamId: true },
  })

  if (!game) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Game not found' })
  }

  const coachMembership = await prisma.teamMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
      teamId: { in: [game.homeTeamId, game.awayTeamId] },
    },
  })

  if (!coachMembership) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only coaches of participating teams can enter player stats',
    })
  }

  const parsed = UpsertStatSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const stat = await playerStatsService.upsertGameStat(gameId, playerId, parsed.data)
  return reply.code(200).send(stat)
}

// ── GET /api/v1/player-stats/players/:playerId/season ────────────────────────

export async function getPlayerSeasonStatsHandler(
  request: FastifyRequest<{ Params: { playerId: string } }>,
  reply: FastifyReply,
) {
  const { playerId } = request.params
  const userId = request.user!.sub

  const queryParsed = SeasonQuerySchema.safeParse(request.query)
  if (!queryParsed.success) return sendValidationError(reply, queryParsed.error)

  // Verify requester has access: either the player themselves or a coach on their team
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { teamId: true, userId: true },
  })

  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player not found' })
  }

  // Allow if requester is the player's user or a coach on the same team
  const isOwnProfile = player.userId === userId
  const isTeamCoach = !isOwnProfile && await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: player.teamId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
    },
  })

  // Also allow if the user is an active team member (parents can see their player's stats)
  const isTeamMember = !isOwnProfile && !isTeamCoach && await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: player.teamId, userId } },
    select: { status: true },
  })

  if (!isOwnProfile && !isTeamCoach && (!isTeamMember || (isTeamMember as any).status !== 'ACTIVE')) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have access to this player\'s stats',
    })
  }

  const stats = await playerStatsService.getPlayerSeasonStats(playerId, queryParsed.data.season)
  return reply.code(200).send(stats)
}

// ── GET /api/v1/player-stats/teams/:teamId/record ────────────────────────────

export async function getTeamRecordHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const queryParsed = SeasonQuerySchema.safeParse(request.query)
  if (!queryParsed.success) return sendValidationError(reply, queryParsed.error)

  // Verify requester is a member of this team
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { status: true },
  })

  if (!membership || membership.status !== 'ACTIVE') {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You are not an active member of this team',
    })
  }

  const record = await playerStatsService.getTeamRecord(teamId, queryParsed.data.season)
  return reply.code(200).send(record)
}
