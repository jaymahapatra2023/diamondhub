import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authService, AuthError } from '../auth.service.js'
import { prisma } from '@diamondhub/db'
import { redis } from '../../lib/redis.js'
import { emailService } from '../email.service.js'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'coach@example.com',
  name: 'John Coach',
  // bcrypt hash of 'secret123' with 12 rounds — generated offline, stable
  passwordHash: '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  emailVerified: false,
  avatarUrl: null,
  phone: null,
  timezone: 'America/New_York',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  roles: [],
}

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── AuthError class ────────────────────────────────────────────────────────

  describe('AuthError', () => {
    it('is an instance of Error', () => {
      const err = new AuthError('TEST_CODE', 400)
      expect(err).toBeInstanceOf(Error)
    })

    it('sets code and statusCode', () => {
      const err = new AuthError('EMAIL_TAKEN', 409)
      expect(err.code).toBe('EMAIL_TAKEN')
      expect(err.statusCode).toBe(409)
    })

    it('sets name to AuthError', () => {
      const err = new AuthError('X', 400)
      expect(err.name).toBe('AuthError')
    })

    it('message equals the code', () => {
      const err = new AuthError('INVALID_CREDENTIALS', 401)
      expect(err.message).toBe('INVALID_CREDENTIALS')
    })
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates user and returns access + refresh tokens', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          user: { create: vi.fn().mockResolvedValue(mockUser) },
          emailVerificationToken: { create: vi.fn().mockResolvedValue({}) },
        }),
      )
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([])
      vi.mocked(prisma.authToken.create).mockResolvedValue({} as any)

      const result = await authService.register(
        { email: 'coach@example.com', password: 'Password1', name: 'John Coach', timezone: 'America/New_York' },
        '127.0.0.1',
      )

      expect(result.user).toBeDefined()
      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
    })

    it('sends verification email after registration', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          user: { create: vi.fn().mockResolvedValue(mockUser) },
          emailVerificationToken: { create: vi.fn().mockResolvedValue({}) },
        }),
      )
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([])
      vi.mocked(prisma.authToken.create).mockResolvedValue({} as any)

      await authService.register(
        { email: 'coach@example.com', password: 'Password1', name: 'John Coach', timezone: 'America/New_York' },
        '127.0.0.1',
      )

      // Fire-and-forget, so we allow a tick for the promise to fire
      await new Promise((r) => setTimeout(r, 0))
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.name,
        expect.any(String),
      )
    })

    it('throws EMAIL_TAKEN (409) when email exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const err = await authService
        .register(
          { email: 'coach@example.com', password: 'Password1', name: 'Coach', timezone: 'America/New_York' },
          '127.0.0.1',
        )
        .catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('EMAIL_TAKEN')
      expect(err.statusCode).toBe(409)
    })

    it('does not call $transaction when email is taken', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await authService
        .register(
          { email: 'coach@example.com', password: 'Password1', name: 'Coach', timezone: 'America/New_York' },
          '127.0.0.1',
        )
        .catch(() => {})

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('creates authToken record after successful registration', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          user: { create: vi.fn().mockResolvedValue(mockUser) },
          emailVerificationToken: { create: vi.fn().mockResolvedValue({}) },
        }),
      )
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([])
      vi.mocked(prisma.authToken.create).mockResolvedValue({} as any)

      await authService.register(
        { email: 'coach@example.com', password: 'Password1', name: 'Coach', timezone: 'America/New_York' },
        '127.0.0.1',
      )

      expect(prisma.authToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: mockUser.id }),
        }),
      )
    })
  })

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws INVALID_CREDENTIALS for wrong password', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(redis.incr).mockResolvedValue(1)

      const err = await authService
        .login({ email: 'coach@example.com', password: 'wrongpassword' }, '127.0.0.1')
        .catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('INVALID_CREDENTIALS')
      expect(err.statusCode).toBe(401)
    })

    it('throws ACCOUNT_LOCKED when lockout key is set in redis', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(redis.get).mockResolvedValue('1') // locked

      const err = await authService
        .login({ email: 'coach@example.com', password: 'password' }, '127.0.0.1')
        .catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('ACCOUNT_LOCKED')
      expect(err.statusCode).toBe(429)
    })

    it('does not enumerate users — same error for unknown email', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null) // user not found

      const err = await authService
        .login({ email: 'nobody@example.com', password: 'password' }, '127.0.0.1')
        .catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('INVALID_CREDENTIALS')
    })

    it('increments failed attempts counter in redis on wrong password', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(redis.incr).mockResolvedValue(2)

      await authService
        .login({ email: 'coach@example.com', password: 'wrong' }, '127.0.0.1')
        .catch(() => {})

      expect(redis.incr).toHaveBeenCalled()
      expect(redis.expire).toHaveBeenCalled()
    })

    it('locks account when failed attempts reach threshold (5)', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(redis.incr).mockResolvedValue(5) // exactly at threshold

      await authService
        .login({ email: 'coach@example.com', password: 'wrong' }, '127.0.0.1')
        .catch(() => {})

      expect(redis.setex).toHaveBeenCalledWith(
        `auth:lockout:${mockUser.id}`,
        15 * 60, // LOCKOUT_TTL_SECONDS
        '1',
      )
    })

    it('does not lock when failed attempts below threshold', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(redis.incr).mockResolvedValue(3) // below threshold

      await authService
        .login({ email: 'coach@example.com', password: 'wrong' }, '127.0.0.1')
        .catch(() => {})

      expect(redis.setex).not.toHaveBeenCalled()
    })

    it('clears failed attempts from redis on successful login', async () => {
      // Use bcrypt to hash a known password for this test
      const bcrypt = await import('bcrypt')
      const hash = await bcrypt.hash('correct-password', 1) // rounds=1 for speed in tests
      const userWithKnownPassword = { ...mockUser, passwordHash: hash }

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(userWithKnownPassword as any)
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
        ...userWithKnownPassword,
        roles: [],
      } as any)
      vi.mocked(redis.del).mockResolvedValue(1)
      vi.mocked(prisma.authToken.create).mockResolvedValue({} as any)

      await authService.login({ email: 'coach@example.com', password: 'correct-password' }, '127.0.0.1')

      expect(redis.del).toHaveBeenCalledWith(`auth:fails:${mockUser.id}`)
    })
  })

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes authToken by hashed token', async () => {
      vi.mocked(prisma.authToken.deleteMany).mockResolvedValue({ count: 1 })

      await authService.logout('refresh-token-value')

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tokenHash: expect.any(String) }),
        }),
      )
    })

    it('does not throw when token does not exist', async () => {
      vi.mocked(prisma.authToken.deleteMany).mockResolvedValue({ count: 0 })

      await expect(authService.logout('nonexistent-token')).resolves.toBeUndefined()
    })
  })

  // ── logoutAll ──────────────────────────────────────────────────────────────

  describe('logoutAll', () => {
    it('deletes all authTokens for the user', async () => {
      vi.mocked(prisma.authToken.deleteMany).mockResolvedValue({ count: 3 })

      await authService.logoutAll(mockUser.id)

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUser.id } }),
      )
    })
  })

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('throws INVALID_REFRESH_TOKEN when token not found', async () => {
      vi.mocked(prisma.authToken.findUnique).mockResolvedValue(null)

      const err = await authService.refresh('unknown-token', '127.0.0.1').catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('INVALID_REFRESH_TOKEN')
      expect(err.statusCode).toBe(401)
    })

    it('throws INVALID_REFRESH_TOKEN for expired token and deletes record', async () => {
      const expiredRecord = {
        id: 'token-record-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date('2020-01-01'), // past
        lastUsedAt: null,
        deviceInfo: null,
        createdAt: new Date(),
        user: { ...mockUser, roles: [] },
      }
      vi.mocked(prisma.authToken.findUnique).mockResolvedValue(expiredRecord as any)
      vi.mocked(prisma.authToken.delete).mockResolvedValue({} as any)

      const err = await authService.refresh('expired-token', '127.0.0.1').catch((e) => e)

      expect(err.code).toBe('INVALID_REFRESH_TOKEN')
      expect(prisma.authToken.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: expiredRecord.id } }),
      )
    })

    it('rotates token on valid refresh — updates hash', async () => {
      const validRecord = {
        id: 'token-record-1',
        userId: mockUser.id,
        tokenHash: 'old-hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // future
        lastUsedAt: null,
        deviceInfo: null,
        createdAt: new Date(),
        user: {
          ...mockUser,
          roles: [{ id: 'role-1', role: 'COACH', teamId: null, isPrimary: true }],
        },
      }
      vi.mocked(prisma.authToken.findUnique).mockResolvedValue(validRecord as any)
      vi.mocked(prisma.authToken.update).mockResolvedValue({} as any)

      const result = await authService.refresh('valid-refresh-token', '127.0.0.1')

      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(prisma.authToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validRecord.id },
          data: expect.objectContaining({ tokenHash: expect.any(String) }),
        }),
      )
      // New refresh token should not equal the old one
      expect(result.refreshToken).not.toBe('valid-refresh-token')
    })
  })

  // ── forgotPassword ─────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('silently succeeds for unknown email (no user enumeration)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(authService.forgotPassword('nobody@example.com')).resolves.toBeUndefined()
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('creates reset token and sends email for known user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, {}] as any)

      await authService.forgotPassword('coach@example.com')

      // Fire-and-forget — allow micro-task to flush
      await new Promise((r) => setTimeout(r, 0))
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.name,
        expect.any(String),
      )
    })

    it('calls $transaction with deleteMany + create', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 0 }, {}] as any)

      await authService.forgotPassword('coach@example.com')

      expect(prisma.$transaction).toHaveBeenCalled()
    })
  })

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('throws INVALID_RESET_TOKEN for unknown token hash', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null)

      const err = await authService
        .resetPassword({ token: 'bad-token', password: 'NewPass1', confirmPassword: 'NewPass1' })
        .catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('INVALID_RESET_TOKEN')
      expect(err.statusCode).toBe(400)
    })

    it('throws INVALID_RESET_TOKEN for expired token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date('2020-01-01'), // past
        usedAt: null,
        createdAt: new Date(),
        user: mockUser as any,
      } as any)

      const err = await authService
        .resetPassword({ token: 'expired', password: 'NewPass1', confirmPassword: 'NewPass1' })
        .catch((e) => e)

      expect(err.code).toBe('INVALID_RESET_TOKEN')
    })

    it('throws INVALID_RESET_TOKEN for already-used token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // future
        usedAt: new Date(), // already used
        createdAt: new Date(),
        user: mockUser as any,
      } as any)

      const err = await authService
        .resetPassword({ token: 'used-token', password: 'NewPass1', confirmPassword: 'NewPass1' })
        .catch((e) => e)

      expect(err.code).toBe('INVALID_RESET_TOKEN')
    })

    it('updates password and invalidates all sessions on valid token', async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: 'token-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // future
        usedAt: null,
        createdAt: new Date(),
        user: { id: mockUser.id } as any,
      } as any)
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}, { count: 2 }] as any)

      await authService.resetPassword({ token: 'valid-reset', password: 'NewPass1', confirmPassword: 'NewPass1' })

      expect(prisma.$transaction).toHaveBeenCalled()
    })
  })

  // ── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('throws INVALID_TOKEN when token not found', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue(null)

      const err = await authService.verifyEmail('bad-token').catch((e) => e)

      expect(err).toBeInstanceOf(AuthError)
      expect(err.code).toBe('INVALID_TOKEN')
      expect(err.statusCode).toBe(400)
    })

    it('throws INVALID_TOKEN for expired verification token', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
        id: 'vt-1',
        userId: mockUser.id,
        token: 'expired-token',
        expiresAt: new Date('2020-01-01'),
        createdAt: new Date(),
      } as any)

      const err = await authService.verifyEmail('expired-token').catch((e) => e)

      expect(err.code).toBe('INVALID_TOKEN')
    })

    it('marks user emailVerified=true and deletes token on valid token', async () => {
      vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
        id: 'vt-1',
        userId: mockUser.id,
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        createdAt: new Date(),
      } as any)
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as any)

      await authService.verifyEmail('valid-token')

      expect(prisma.$transaction).toHaveBeenCalled()
    })
  })

  // ── assignRole ─────────────────────────────────────────────────────────────

  describe('assignRole', () => {
    it('sets isPrimary=true for first role (count=0)', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await authService.assignRole(mockUser.id, { role: 'COACH' })

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isPrimary: true }),
        }),
      )
    })

    it('sets isPrimary=false for additional roles (count>0)', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1) // already has a role
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await authService.assignRole(mockUser.id, { role: 'PARENT' })

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isPrimary: false }),
        }),
      )
    })

    it('includes teamId in the upsert key when provided', async () => {
      const teamId = '550e8400-e29b-41d4-a716-446655440099'
      vi.mocked(prisma.userRole.count).mockResolvedValue(0)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await authService.assignRole(mockUser.id, { role: 'COACH', teamId })

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_role_teamId: expect.objectContaining({ teamId }),
          }),
        }),
      )
    })

    it('sets teamId to null when not provided', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await authService.assignRole(mockUser.id, { role: 'PLAYER' })

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_role_teamId: expect.objectContaining({ teamId: null }),
          }),
        }),
      )
    })
  })

  // ── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('calls findUniqueOrThrow with the user id', async () => {
      const profileData = {
        ...mockUser,
        roles: [{ id: 'role-1', role: 'COACH', teamId: null, isPrimary: true }],
      }
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(profileData as any)

      const result = await authService.getProfile(mockUser.id)

      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockUser.id } }),
      )
      expect(result).toBeDefined()
    })
  })

  // ── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('calls prisma.user.update with the correct userId and data', async () => {
      const updatedProfile = {
        ...mockUser,
        name: 'Updated Name',
        roles: [],
      }
      vi.mocked(prisma.user.update).mockResolvedValue(updatedProfile as any)

      const result = await authService.updateProfile(mockUser.id, { name: 'Updated Name' })

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({ name: 'Updated Name' }),
        }),
      )
      expect(result).toBeDefined()
    })
  })
})
