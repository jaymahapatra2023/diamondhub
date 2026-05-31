import type { FastifyRequest, FastifyReply } from 'fastify'
import { authService, AuthError } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refreshToken = request.cookies['refreshToken']

  if (!refreshToken) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'No refresh token' })
    return
  }

  try {
    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(
      refreshToken,
      request.ip,
    )

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth',
    })

    reply.code(200).send({ accessToken })
  } catch (err) {
    if (err instanceof AuthError && err.code === 'INVALID_REFRESH_TOKEN') {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' })
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Session expired' })
      return
    }
    logger.error({ err }, 'Refresh error')
    reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Token refresh failed' })
  }
}
