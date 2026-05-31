import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService, AuthError } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export async function verifyEmailHandler(
  request: FastifyRequest<{ Querystring: { token?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const token = request.query.token
  if (!token) {
    reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Verification token required' })
    return
  }

  try {
    await authService.verifyEmail(token)
    reply.code(200).send({ message: 'Email verified successfully. You can now access all features.' })
  } catch (err) {
    if (err instanceof AuthError && err.code === 'INVALID_TOKEN') {
      reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid or expired verification token. Please request a new one.',
      })
      return
    }
    logger.error({ err }, 'Email verification error')
    reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Verification failed' })
  }
}
