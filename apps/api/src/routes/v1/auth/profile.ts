import type { FastifyRequest, FastifyReply } from 'fastify'
import { UpdateProfileRequestSchema, AssignRoleRequestSchema } from '@diamondhub/contracts'
import { authService } from '../../../services/auth.service.js'
import { logger } from '../../../lib/logger.js'

export const profileHandler = {
  async getMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
      return
    }

    try {
      const profile = await authService.getProfile(request.user.sub)
      reply.code(200).send({
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        roles: profile.roles.map((r) => ({
          ...r,
          role: r.role as string,
        })),
      })
    } catch (err) {
      logger.error({ err, userId: request.user.sub }, 'Error fetching profile')
      reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Failed to fetch profile' })
    }
  },

  async updateMe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
      return
    }

    const parsed = UpdateProfileRequestSchema.safeParse(request.body)
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
      const updated = await authService.updateProfile(request.user.sub, parsed.data)
      reply.code(200).send({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        roles: updated.roles,
      })
    } catch (err) {
      logger.error({ err, userId: request.user.sub }, 'Error updating profile')
      reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Update failed' })
    }
  },

  async assignRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
      return
    }

    const parsed = AssignRoleRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid role',
        details: parsed.error.flatten(),
      })
      return
    }

    try {
      await authService.assignRole(request.user.sub, parsed.data)
      reply.code(200).send({ message: 'Role assigned successfully' })
    } catch (err) {
      logger.error({ err, userId: request.user.sub }, 'Error assigning role')
      reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Role assignment failed' })
    }
  },
}
