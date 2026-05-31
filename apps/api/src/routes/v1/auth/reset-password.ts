import type { FastifyRequest, FastifyReply } from 'fastify'
import { ForgotPasswordRequestSchema, ResetPasswordRequestSchema } from '@diamondhub/contracts'
import { authService, AuthError } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export const resetPasswordHandler = {
  async forgot(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ForgotPasswordRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid email' })
      return
    }

    // Always return 200 — no user enumeration (P8)
    await authService.forgotPassword(parsed.data.email).catch((err) =>
      logger.error({ err }, 'Error in forgotPassword'),
    )

    reply.code(200).send({ message: 'If an account exists for this email, a reset link has been sent.' })
  },

  async reset(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parsed = ResetPasswordRequestSchema.safeParse(request.body)
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
      await authService.resetPassword(parsed.data)
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' })
      reply.code(200).send({ message: 'Password reset successfully. Please log in with your new password.' })
    } catch (err) {
      if (err instanceof AuthError && err.code === 'INVALID_RESET_TOKEN') {
        reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid or expired reset token. Please request a new one.',
        })
        return
      }
      logger.error({ err }, 'Password reset error')
      reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Reset failed' })
    }
  },
}
