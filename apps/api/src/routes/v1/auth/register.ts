import type { FastifyRequest, FastifyReply } from 'fastify'
import { RegisterRequestSchema } from '@diamondhub/contracts'
import { authService, AuthError } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = RegisterRequestSchema.safeParse(request.body)
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
    const { user, accessToken, refreshToken } = await authService.register(
      parsed.data,
      request.ip,
    )

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth',
    })

    reply.code(201).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
      },
      accessToken,
      message: 'Registration successful. Check your email to verify your account.',
    })
  } catch (err) {
    if (err instanceof AuthError && err.code === 'EMAIL_TAKEN') {
      reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'An account with this email already exists',
      })
      return
    }
    logger.error({ err }, 'Registration error')
    reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Registration failed' })
  }
}
