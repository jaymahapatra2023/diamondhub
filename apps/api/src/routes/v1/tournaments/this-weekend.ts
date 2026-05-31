// E2-S6: "This Weekend Near Me" — requires lat/lng query params
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { tournamentService } from '../../../services/tournament.service.js'
import { logger } from '../../../lib/logger.js'

const ThisWeekendQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

export async function thisWeekendHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = ThisWeekendQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid lat/lng params',
      details: parsed.error.flatten(),
    })
  }

  const { lat, lng } = parsed.data
  // lat/lng optional — returns national upcoming weekend events when not provided
  const userId = request.user?.sub

  try {
    const result = await tournamentService.getThisWeekend(lat, lng, userId)
    return reply.code(200).send(result)
  } catch (err) {
    logger.error({ err, lat, lng }, 'Failed to fetch this-weekend tournaments')
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch this weekend tournaments',
    })
  }
}
