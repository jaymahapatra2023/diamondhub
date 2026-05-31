import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refreshToken = request.cookies['refreshToken']

  if (refreshToken) {
    await authService.logout(refreshToken).catch((err) =>
      logger.error({ err }, 'Error clearing refresh token on logout'),
    )
  }

  reply.clearCookie('refreshToken', { path: '/api/v1/auth' })
  reply.code(200).send({ message: 'Logged out successfully' })
}

export async function logoutAllHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
    return
  }

  await authService.logoutAll(request.user.sub)
  reply.clearCookie('refreshToken', { path: '/api/v1/auth' })
  reply.code(200).send({ message: 'All sessions invalidated' })
}
