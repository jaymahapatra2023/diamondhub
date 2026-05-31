// E1 · Auth Service — all authentication business logic
// P2: Role-scoped JWT. P8: bcrypt 12, timing-safe compare, lockout.

import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '@diamondhub/db'
import type {
  RegisterRequest,
  LoginRequest,
  UpdateProfileRequest,
  AssignRoleRequest,
  ResetPasswordRequest,
} from '@diamondhub/contracts'
import { tokenService } from './token.service.js'
import { emailService } from './email.service.js'
import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

const BCRYPT_ROUNDS = 12 // P8 requirement
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_TTL_SECONDS = 15 * 60 // 15 minutes
const FAILED_ATTEMPTS_TTL = 15 * 60 // reset window
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Redis key helpers (never store PII in keys)
const failKey = (userId: string) => `auth:fails:${userId}`
const lockoutKey = (userId: string) => `auth:lockout:${userId}`

export const authService = {
  // ── E1-S1: Register ──────────────────────────────────────────────────────

  async register(data: RegisterRequest, ip: string) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    })
    if (existing) {
      throw new AuthError('EMAIL_TAKEN', 409)
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)
    const verificationToken = uuidv4()

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          name: data.name,
          phone: data.phone ?? null,
          timezone: data.timezone,
        },
      })
      await tx.emailVerificationToken.create({
        data: {
          userId: created.id,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      return created
    })

    // Fire-and-forget — P4: never block API response on email delivery
    emailService.sendVerificationEmail(user.email, user.name, verificationToken).catch((err) =>
      logger.error({ err, userId: user.id }, 'Failed to send verification email'),
    )

    const session = await this._createSession(user, ip)
    logger.info({ userId: user.id, ip }, 'User registered')
    return { user, ...session }
  },

  // ── E1-S2: Login ─────────────────────────────────────────────────────────

  async login(data: LoginRequest, ip: string) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, email: true, name: true, passwordHash: true, emailVerified: true },
    })

    // Check lockout AFTER finding user (prevents enumeration via timing)
    if (user) {
      const locked = await redis.get(lockoutKey(user.id))
      if (locked) throw new AuthError('ACCOUNT_LOCKED', 429)
    }

    // Always compare a hash — prevents timing attack user enumeration
    const dummyHash = '$2b$12$invalidhashforcomparisonpurposesBBBBBBBBBBBBBBBBBBBBBB'
    const passwordMatch = await bcrypt.compare(
      data.password,
      user?.passwordHash ?? dummyHash,
    )

    if (!user || !passwordMatch) {
      if (user) {
        const fails = await redis.incr(failKey(user.id))
        await redis.expire(failKey(user.id), FAILED_ATTEMPTS_TTL)
        if (fails >= MAX_FAILED_ATTEMPTS) {
          await redis.setex(lockoutKey(user.id), LOCKOUT_TTL_SECONDS, '1')
          logger.warn({ userId: user.id }, 'Account locked after failed attempts')
        }
      }
      throw new AuthError('INVALID_CREDENTIALS', 401)
    }

    // Clear failed attempts on successful login
    await redis.del(failKey(user.id))

    const fullUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { select: { id: true, role: true, teamId: true, isPrimary: true } } },
    })

    const session = await this._createSession(fullUser, ip)
    logger.info({ userId: user.id, ip }, 'User logged in')
    return { user: fullUser, ...session }
  },

  // ── E1-S5: Refresh ───────────────────────────────────────────────────────

  async refresh(refreshToken: string, ip: string) {
    const hash = tokenService.hashToken(refreshToken)
    const tokenRecord = await prisma.authToken.findUnique({
      where: { tokenHash: hash },
      include: {
        user: {
          include: {
            roles: { select: { id: true, role: true, teamId: true, isPrimary: true } },
          },
        },
      },
    })

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      if (tokenRecord) {
        await prisma.authToken.delete({ where: { id: tokenRecord.id } })
      }
      throw new AuthError('INVALID_REFRESH_TOKEN', 401)
    }

    // Rotate: replace old token with new
    const { token: newRefreshToken, hash: newHash } = tokenService.generateRefreshToken()
    await prisma.authToken.update({
      where: { id: tokenRecord.id },
      data: { tokenHash: newHash, lastUsedAt: new Date() },
    })

    const accessToken = await tokenService.generateAccessToken({
      sub: tokenRecord.user.id,
      email: tokenRecord.user.email,
      name: tokenRecord.user.name,
      emailVerified: tokenRecord.user.emailVerified,
      roles: tokenRecord.user.roles.map((r) => ({ role: r.role as any, teamId: r.teamId })),
      activeRole: (() => {
        const primary = tokenRecord.user.roles.find((r) => r.isPrimary)
        return primary ? { role: primary.role as any, teamId: primary.teamId } : null
      })(),
    })

    return { accessToken, refreshToken: newRefreshToken }
  },

  // ── E1-S2 (logout): Clear session ────────────────────────────────────────

  async logout(refreshToken: string) {
    const hash = tokenService.hashToken(refreshToken)
    await prisma.authToken.deleteMany({ where: { tokenHash: hash } })
  },

  async logoutAll(userId: string) {
    await prisma.authToken.deleteMany({ where: { userId } })
    logger.info({ userId }, 'All sessions invalidated')
  },

  // ── E1-S8: Password reset ─────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    })
    if (!user) return // Silent — no user enumeration (P8)

    const resetToken = uuidv4()
    const hash = tokenService.hashToken(resetToken)

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
        },
      }),
    ])

    emailService.sendPasswordResetEmail(user.email, user.name, resetToken).catch((err) =>
      logger.error({ err, userId: user.id }, 'Failed to send password reset email'),
    )

    logger.info({ userId: user.id }, 'Password reset requested')
  },

  async resetPassword(data: ResetPasswordRequest) {
    const hash = tokenService.hashToken(data.token)
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { select: { id: true } } },
    })

    if (!record || record.expiresAt < new Date() || record.usedAt !== null) {
      throw new AuthError('INVALID_RESET_TOKEN', 400)
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.authToken.deleteMany({ where: { userId: record.userId } }),
    ])

    logger.info({ userId: record.userId }, 'Password reset completed, all sessions invalidated')
  },

  // ── Email verification ────────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const record = await prisma.emailVerificationToken.findUnique({ where: { token } })
    if (!record || record.expiresAt < new Date()) {
      throw new AuthError('INVALID_TOKEN', 400)
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.emailVerificationToken.delete({ where: { id: record.id } }),
    ])

    logger.info({ userId: record.userId }, 'Email verified')
  },

  // ── E1-S6: Role assignment ────────────────────────────────────────────────

  async assignRole(userId: string, data: AssignRoleRequest) {
    const existingCount = await prisma.userRole.count({ where: { userId } })
    const isPrimary = existingCount === 0
    const teamId = data.teamId ?? null

    const existing = await prisma.userRole.findFirst({
      where: { userId, role: data.role as any, teamId },
    })

    if (existing) {
      if (isPrimary) {
        await prisma.userRole.update({ where: { id: existing.id }, data: { isPrimary: true } })
      }
    } else {
      await prisma.userRole.create({ data: { userId, role: data.role as any, teamId, isPrimary } })
    }

    logger.info({ userId, role: data.role }, 'Role assigned')
  },

  // ── E1-S9: Profile update ─────────────────────────────────────────────────

  async updateProfile(userId: string, data: UpdateProfileRequest) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phone: data.phone,
        timezone: data.timezone,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        emailVerified: true,
        timezone: true,
        createdAt: true,
        roles: { select: { id: true, role: true, teamId: true, isPrimary: true } },
      },
    })
  },

  async getProfile(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        emailVerified: true,
        timezone: true,
        createdAt: true,
        roles: { select: { id: true, role: true, teamId: true, isPrimary: true } },
      },
    })
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  async _createSession(
    user: { id: string; email: string; name: string; emailVerified?: boolean; roles?: Array<{ role: string; teamId: string | null; isPrimary: boolean }> },
    ip: string,
  ) {
    const roles = user.roles ?? (await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: true, teamId: true, isPrimary: true },
    }))

    const primaryRole = roles.find((r) => r.isPrimary)

    const accessToken = await tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified ?? false,
      roles: roles.map((r) => ({ role: r.role as any, teamId: r.teamId })),
      activeRole: primaryRole ? { role: primaryRole.role as any, teamId: primaryRole.teamId } : null,
    })

    const { token: refreshToken, hash } = tokenService.generateRefreshToken()
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        deviceInfo: ip,
      },
    })

    return { accessToken, refreshToken }
  },
}

// Typed error class for clean route handler error handling
export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(code)
    this.name = 'AuthError'
  }
}
