// E2-S8: Search history — last 5 searches per user, requires auth (P2)
import type { FastifyRequest, FastifyReply } from 'fastify'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

export async function searchHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub

  try {
    const history = await tournamentService.getSearchHistory(userId)
    return reply.code(200).send({ history, total: history.length })
  } catch (err) {
    logger.error({ err, userId }, 'Failed to fetch search history')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch search history',
    })
  }
}
