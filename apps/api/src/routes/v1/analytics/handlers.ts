// E14 · Coach Analytics — Route Handlers
import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@diamondhub/db'
import { analyticsService } from '../../../services/analytics.service.js'

// ── Helper: verify coach membership ──────────────────────────────────────────

async function verifyCoachMembership(
  userId: string,
  teamId: string,
): Promise<boolean> {
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
    },
  })
  return !!membership
}

// ── GET /api/v1/analytics/teams/:teamId/costs ─────────────────────────────────

export async function getSeasonCostsHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  if (!(await verifyCoachMembership(userId, teamId))) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You must be a coach of this team',
    })
  }

  const data = await analyticsService.getSeasonCosts(teamId)
  return reply.code(200).send(data)
}

// ── GET /api/v1/analytics/teams/:teamId/attendance ────────────────────────────

export async function getAttendanceRatesHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  if (!(await verifyCoachMembership(userId, teamId))) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You must be a coach of this team',
    })
  }

  const data = await analyticsService.getAttendanceRates(teamId)
  return reply.code(200).send(data)
}

// ── GET /api/v1/analytics/teams/:teamId/win-rates ─────────────────────────────

export async function getWinRatesHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  if (!(await verifyCoachMembership(userId, teamId))) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You must be a coach of this team',
    })
  }

  const data = await analyticsService.getTournamentWinRates(teamId)
  return reply.code(200).send(data)
}
