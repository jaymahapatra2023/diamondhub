// E1-S3: Google OAuth — verify Google ID token, upsert user
import type { FastifyRequest, FastifyReply } from 'fastify'
import { OAuth2Client } from 'google-auth-library'
import { GoogleOAuthRequestSchema } from '@diamondhub/contracts'
import { prisma } from '@diamondhub/db'
import { authService } from '../../../services/auth.service.js'
import { config } from '../../../config.js'
import { logger } from '../../../lib/logger.js'

const googleClient = config.GOOGLE_CLIENT_ID
  ? new OAuth2Client(config.GOOGLE_CLIENT_ID)
  : null

export async function googleOAuthHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!googleClient || !config.GOOGLE_CLIENT_ID) {
    reply.code(501).send({ statusCode: 501, error: 'Not Implemented', message: 'Google OAuth not configured' })
    return
  }

  const parsed = GoogleOAuthRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request' })
    return
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: config.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) {
      reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid Google token' })
      return
    }

    const googleId = payload.sub
    const email = payload.email
    const name = payload.name ?? email.split('@')[0] ?? 'User'
    const avatarUrl = payload.picture ?? null

    // Find existing OAuth account or match by email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { oauthAccounts: { some: { provider: 'GOOGLE', providerAccountId: googleId } } },
          { email },
        ],
      },
      include: { roles: { select: { id: true, role: true, teamId: true, isPrimary: true } } },
    })

    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, name, avatarUrl, emailVerified: true },
        })
        await tx.oAuthAccount.create({
          data: { userId: created.id, provider: 'GOOGLE', providerAccountId: googleId, email },
        })
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          include: { roles: { select: { id: true, role: true, teamId: true, isPrimary: true } } },
        })
      })
    } else {
      // Link Google account if not already linked
      const existing = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: googleId } },
      })
      if (!existing) {
        await prisma.oAuthAccount.create({
          data: { userId: user.id, provider: 'GOOGLE', providerAccountId: googleId, email },
        })
      }
    }

    const session = await authService['_createSession'](user, request.ip)

    reply.setCookie('refreshToken', session.refreshToken, {
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
      accessToken: session.accessToken,
    })

    logger.info({ userId: user.id }, 'Google OAuth login')
  } catch (err) {
    logger.error({ err }, 'Google OAuth error')
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Google authentication failed' })
  }
}
