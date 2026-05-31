// E2-S1/S2: Tournament search handler
import type { FastifyRequest, FastifyReply } from 'fastify'
import { TournamentSearchParamsSchema } from '@diamondhub/contracts'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

// Normalize query params: Fastify parses repeated keys as arrays but a single value
// as a plain string. Zod schemas expect arrays for ageDivisions and organizers.
function normalizeQueryArrays(query: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...query }
  if (normalized['ageDivisions'] !== undefined && !Array.isArray(normalized['ageDivisions'])) {
    normalized['ageDivisions'] = [normalized['ageDivisions']]
  }
  if (normalized['organizers'] !== undefined && !Array.isArray(normalized['organizers'])) {
    normalized['organizers'] = [normalized['organizers']]
  }
  return normalized
}

export async function searchHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = TournamentSearchParamsSchema.safeParse(
    normalizeQueryArrays(request.query as Record<string, unknown>),
  )
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid search params',
      details: parsed.error.flatten(),
    })
  }

  try {
    const userId = request.user?.sub
    const result = await tournamentService.search(parsed.data, userId)

    // Save to search history if logged in and location provided (E2-S8)
    if (userId && (parsed.data.lat || parsed.data.zip || parsed.data.city)) {
      tournamentService
        .saveSearch(userId, {
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          zip: parsed.data.zip,
          city: parsed.data.city,
          state: parsed.data.state,
          sport: parsed.data.sport,
          ageDivisions: parsed.data.ageDivisions,
          radiusMiles: parsed.data.radiusMiles,
        })
        .catch((err) => logger.error({ err }, 'Failed to save search history'))
    }

    return reply.code(200).send(result)
  } catch (err) {
    logger.error({ err }, 'Tournament search error')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Search failed',
    })
  }
}
