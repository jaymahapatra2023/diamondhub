// E2-S5: Bookmarks list — requires authentication (P2)
import type { FastifyRequest, FastifyReply } from 'fastify'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

export async function bookmarksListHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub

  try {
    const bookmarks = await tournamentService.getBookmarks(userId)
    return reply.code(200).send({ bookmarks, total: bookmarks.length })
  } catch (err) {
    logger.error({ err, userId }, 'Failed to fetch bookmarks')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch bookmarks',
    })
  }
}
