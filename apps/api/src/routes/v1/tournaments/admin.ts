// E12: Admin tournament CRUD handlers — COACH role required
import type { FastifyRequest, FastifyReply } from 'fastify'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

export async function adminCreateHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const hasCoachRole = request.user.roles.some((r: any) => r.role === 'COACH')
  if (!hasCoachRole) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'COACH role required' })

  try {
    const tournament = await tournamentService.createTournament(request.body, request.user.sub)
    logger.info({ tournamentId: tournament.id, createdBy: request.user.sub }, 'Tournament created by admin')
    return reply.code(201).send(tournament)
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Validation failed', details: err.flatten() })
    }
    logger.error({ err }, 'Admin tournament create error')
    return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to create tournament' })
  }
}

export async function adminUpdateHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const hasCoachRole = request.user.roles.some((r: any) => r.role === 'COACH')
  if (!hasCoachRole) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'COACH role required' })

  try {
    const updated = await tournamentService.updateTournament(request.params.id, request.body)
    return reply.code(200).send(updated)
  } catch (err: any) {
    if (err?.message === 'NOT_FOUND') return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Tournament not found' })
    if (err?.message === 'PARTNER_DATA_IMMUTABLE') return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cannot modify partner-sourced tournament data' })
    logger.error({ err }, 'Admin tournament update error')
    return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Update failed' })
  }
}

export async function adminDeleteHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const hasCoachRole = request.user.roles.some((r: any) => r.role === 'COACH')
  if (!hasCoachRole) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'COACH role required' })

  await tournamentService.deleteTournament(request.params.id)
  return reply.code(200).send({ message: 'Tournament cancelled' })
}

export async function adminPublishHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const hasCoachRole = request.user.roles.some((r: any) => r.role === 'COACH')
  if (!hasCoachRole) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'COACH role required' })

  const updated = await tournamentService.publishTournament(request.params.id)
  return reply.code(200).send(updated)
}
