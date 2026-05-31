import type { FastifyRequest, FastifyReply } from 'fastify'
import { LoginRequestSchema } from '@diamondhub/contracts'
import { authService, AuthError } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export async function loginHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = LoginRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      details: parsed.error.flatten(),
    })
    return
  }

  try {
    const { user, accessToken, refreshToken } = await authService.login(parsed.data, request.ip)

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth',
    })

    reply.code(200).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        roles: user.roles,
      },
      accessToken,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === 'ACCOUNT_LOCKED') {
        reply.code(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.',
        })
        return
      }
      if (err.code === 'INVALID_CREDENTIALS') {
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        })
        return
      }
    }
    logger.error({ err }, 'Login error')
    reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Login failed' })
  }
}
