// E2-S4/S5/S7: Tournament detail, bookmark, and follow handlers
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

// ── Tournament Detail ────────────────────────────────────────────────────────

export async function detailHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id } = request.params
  const userId = request.user?.sub

  try {
    const tournament = await tournamentService.getById(id, userId)
    if (!tournament) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Tournament ${id} not found`,
      })
    }
    return reply.code(200).send(tournament)
  } catch (err) {
    logger.error({ err, id }, 'Failed to fetch tournament detail')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch tournament',
    })
  }
}

// ── Bookmark ─────────────────────────────────────────────────────────────────

export const bookmarkHandler = {
  async add(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const userId = request.user!.sub
    const { id: tournamentId } = request.params

    try {
      // Verify tournament exists before bookmarking
      const tournament = await tournamentService.getById(tournamentId)
      if (!tournament) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Tournament ${tournamentId} not found`,
        })
      }

      await tournamentService.bookmark(userId, tournamentId)
      return reply.code(200).send({ message: 'Tournament bookmarked' })
    } catch (err) {
      logger.error({ err, userId, tournamentId }, 'Failed to bookmark tournament')
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to bookmark tournament',
      })
    }
  },

  async remove(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const userId = request.user!.sub
    const { id: tournamentId } = request.params

    try {
      await tournamentService.unbookmark(userId, tournamentId)
      return reply.code(200).send({ message: 'Bookmark removed' })
    } catch (err) {
      logger.error({ err, userId, tournamentId }, 'Failed to remove tournament bookmark')
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to remove bookmark',
      })
    }
  },
}

// ── Follow ────────────────────────────────────────────────────────────────────

const FollowBodySchema = z.object({
  guestToken: z.string().min(1).optional(),
})

export const followHandler = {
  async add(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { id: tournamentId } = request.params
    const userId = request.user?.sub

    // Parse optional guest token from body
    const parsed = FollowBodySchema.safeParse(request.body ?? {})
    const guestToken = parsed.success ? parsed.data.guestToken : undefined

    if (!userId && !guestToken) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Either authenticate or provide a guestToken',
      })
    }

    try {
      // Verify tournament exists
      const tournament = await tournamentService.getById(tournamentId)
      if (!tournament) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Tournament ${tournamentId} not found`,
        })
      }

      await tournamentService.follow(tournamentId, userId, guestToken)
      return reply.code(200).send({ message: 'Following tournament' })
    } catch (err) {
      logger.error({ err, tournamentId }, 'Failed to follow tournament')
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to follow tournament',
      })
    }
  },

  async remove(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { id: tournamentId } = request.params
    const userId = request.user?.sub

    const parsed = FollowBodySchema.safeParse(request.body ?? {})
    const guestToken = parsed.success ? parsed.data.guestToken : undefined

    try {
      await tournamentService.unfollow(tournamentId, userId, guestToken)
      return reply.code(200).send({ message: 'Unfollowed tournament' })
    } catch (err) {
      logger.error({ err, tournamentId }, 'Failed to unfollow tournament')
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to unfollow tournament',
      })
    }
  },
}
