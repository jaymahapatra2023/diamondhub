import type { FastifyRequest, FastifyReply } from 'fastify'
import { enqueueCrawl, type CrawlSource } from '@diamondhub/workers'
import { logger } from '../../../lib/logger.js'

const VALID_SOURCES: CrawlSource[] = ['USSSA', 'TRIPLE_CROWN', 'EXPOSURE_EVENTS', 'BASEBALL_CONNECTED', 'ALL']

export async function adminCrawlHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
  const hasCoachRole = request.user.roles.some((r: any) => r.role === 'COACH')
  if (!hasCoachRole) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'COACH role required' })

  const { source = 'ALL' } = (request.body as any) ?? {}
  if (!VALID_SOURCES.includes(source)) {
    return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `source must be one of: ${VALID_SOURCES.join(', ')}` })
  }

  try {
    const job = await enqueueCrawl(source as CrawlSource, request.user.sub)
    logger.info({ source, jobId: job.id, triggeredBy: request.user.sub }, 'Manual crawl enqueued')
    return reply.code(202).send({ jobId: job.id, source, message: 'Crawl job enqueued' })
  } catch (err) {
    logger.error({ err }, 'Failed to enqueue crawl job')
    return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to enqueue crawl' })
  }
}
