import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// Mock auth service
vi.mock('../services/auth.service.js', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    refresh: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    assignRole: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    _createSession: vi.fn(),
  },
  AuthError: class AuthError extends Error {
    code: string
    statusCode: number
    constructor(code: string, statusCode: number) {
      super(code)
      this.code = code
      this.statusCode = statusCode
      this.name = 'AuthError'
    }
  },
}))

vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

const { authService } = await import('../services/auth.service.js')
const { tokenService } = await import('../services/token.service.js')

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── POST /api/v1/auth/register ─────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('returns 201 with accessToken and user on valid registration', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash',
        emailVerified: false,
        phone: null,
        avatarUrl: null,
        timezone: 'America/New_York',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'Password1', name: 'Test User' },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.accessToken).toBe('access-token')
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.emailVerified).toBe(false)
  })

  it('sets httpOnly refreshToken cookie on registration', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash',
        emailVerified: false,
        phone: null,
        avatarUrl: null,
        timezone: 'America/New_York',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'Password1', name: 'Test User' },
    })

    expect(response.headers['set-cookie']).toBeDefined()
    const cookie = response.headers['set-cookie'] as string
    expect(cookie).toContain('refreshToken')
    expect(cookie).toContain('HttpOnly')
  })

  it('does not expose refreshToken in response body', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hash',
        emailVerified: false,
        phone: null,
        avatarUrl: null,
        timezone: 'America/New_York',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'Password1', name: 'Test User' },
    })

    const body = JSON.parse(response.body)
    expect(body.refreshToken).toBeUndefined()
  })

  it('returns 400 for invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: 'Password1', name: 'Test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for weak password missing a number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'weakpassword', name: 'Test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for password shorter than 8 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'Pass1', name: 'Test' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for name shorter than 2 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com', password: 'Password1', name: 'A' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when required fields are missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'test@example.com' }, // missing password + name
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 409 when email is already taken', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.register).mockRejectedValue(new AuthError('EMAIL_TAKEN', 409))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'taken@example.com', password: 'Password1', name: 'Test' },
    })
    expect(response.statusCode).toBe(409)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Conflict')
  })

  it('returns 400 validation error with details field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bad', password: 'x', name: '' },
    })
    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.details).toBeDefined()
  })
})

// ── POST /api/v1/auth/login ────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with accessToken and user on valid credentials', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        emailVerified: true,
        roles: [{ id: 'r1', role: 'COACH', teamId: null, isPrimary: true }],
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'Password1' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.accessToken).toBe('access-token')
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.roles).toHaveLength(1)
  })

  it('sets httpOnly refreshToken cookie on login', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        emailVerified: true,
        roles: [],
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'Password1' },
    })

    expect(response.headers['set-cookie']).toBeDefined()
    const cookie = response.headers['set-cookie'] as string
    expect(cookie).toContain('HttpOnly')
  })

  it('does not expose refreshToken in login response body', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        emailVerified: true,
        roles: [],
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'Password1' },
    })

    const body = JSON.parse(response.body)
    expect(body.refreshToken).toBeUndefined()
  })

  it('returns 401 for invalid credentials', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.login).mockRejectedValue(new AuthError('INVALID_CREDENTIALS', 401))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'wrong' },
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 429 for locked account', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.login).mockRejectedValue(new AuthError('ACCOUNT_LOCKED', 429))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'locked@example.com', password: 'password' },
    })

    expect(response.statusCode).toBe(429)
  })

  it('returns 400 when email is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'Password1' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when password is empty string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: '' },
    })
    expect(response.statusCode).toBe(400)
  })
})

// ── POST /api/v1/auth/logout ───────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 and clears cookie when refresh token is present', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refreshToken: 'some-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Logged out')
  })

  it('returns 200 even when no refresh cookie is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    })
    // Should still be 200 — logout is idempotent
    expect(response.statusCode).toBe(200)
  })

  it('clears the refreshToken cookie in the response', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refreshToken: 'some-token' },
    })

    const cookie = response.headers['set-cookie'] as string
    // Cookie should be cleared (max-age=0 or expires in past, or explicitly cleared)
    expect(cookie).toBeDefined()
    expect(cookie).toContain('refreshToken')
  })
})

// ── POST /api/v1/auth/refresh ──────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns 200 with new accessToken when refresh cookie is valid', async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: 'valid-refresh-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.accessToken).toBe('new-access-token')
  })

  it('rotates the refresh cookie on success', async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: 'valid-refresh-token' },
    })

    expect(response.headers['set-cookie']).toBeDefined()
    const cookie = response.headers['set-cookie'] as string
    expect(cookie).toContain('refreshToken')
    expect(cookie).toContain('HttpOnly')
  })

  it('returns 401 when no refresh cookie provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 401 when refresh token is invalid/expired', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.refresh).mockRejectedValue(new AuthError('INVALID_REFRESH_TOKEN', 401))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: 'expired-token' },
    })

    expect(response.statusCode).toBe(401)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Session expired')
  })

  it('clears cookie when refresh token is invalid', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.refresh).mockRejectedValue(new AuthError('INVALID_REFRESH_TOKEN', 401))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: 'expired-token' },
    })

    // Cookie should be cleared on invalid refresh
    const cookie = response.headers['set-cookie'] as string
    expect(cookie).toContain('refreshToken')
  })
})

// ── POST /api/v1/auth/forgot-password ─────────────────────────────────────

describe('POST /api/v1/auth/forgot-password', () => {
  it('always returns 200 for known users (no user enumeration)', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'exists@example.com' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('always returns 200 for unknown users (no user enumeration)', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    })

    expect(response.statusCode).toBe(200)
    // Response body should be identical regardless of whether user exists
    const body = JSON.parse(response.body)
    expect(body.message).toBeDefined()
  })

  it('returns 400 for invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'not-valid' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when email is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })
})

// ── POST /api/v1/auth/reset-password ──────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  it('returns 200 on successful password reset', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'valid-reset-token', password: 'NewPass1', confirmPassword: 'NewPass1' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 400 for invalid/expired reset token', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.resetPassword).mockRejectedValue(new AuthError('INVALID_RESET_TOKEN', 400))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'bad-token', password: 'NewPass1', confirmPassword: 'NewPass1' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when passwords do not match', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'valid', password: 'NewPass1', confirmPassword: 'DifferentPass1' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for weak new password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'valid', password: 'weakpass', confirmPassword: 'weakpass' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('clears refreshToken cookie on successful reset', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'valid', password: 'NewPass1', confirmPassword: 'NewPass1' },
    })

    expect(response.statusCode).toBe(200)
    const cookie = response.headers['set-cookie'] as string
    // Should clear the cookie
    expect(cookie).toContain('refreshToken')
  })
})

// ── GET /api/v1/auth/verify-email ─────────────────────────────────────────

describe('GET /api/v1/auth/verify-email', () => {
  it('returns 200 on valid token', async () => {
    vi.mocked(authService.verifyEmail).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email?token=valid-token',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('verified')
  })

  it('returns 400 when no token query param', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email',
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for invalid/expired token', async () => {
    const { AuthError } = await import('../services/auth.service.js')
    vi.mocked(authService.verifyEmail).mockRejectedValue(new AuthError('INVALID_TOKEN', 400))

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/verify-email?token=expired-token',
    })

    expect(response.statusCode).toBe(400)
  })
})

// ── GET /api/v1/auth/me ────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with malformed Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: 'Token invalid-format' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 401 with invalid Bearer token', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockRejectedValue(new Error('invalid token'))

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with profile on valid Bearer token', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })
    vi.mocked(authService.getProfile).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      phone: null,
      avatarUrl: null,
      emailVerified: true,
      timezone: 'America/New_York',
      createdAt: new Date('2024-01-01'),
      roles: [],
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.email).toBe('test@example.com')
    expect(body.id).toBe('user-1')
    expect(body.createdAt).toBeDefined()
  })
})

// ── PATCH /api/v1/auth/me ─────────────────────────────────────────────────

describe('PATCH /api/v1/auth/me', () => {
  it('returns 401 without Authorization', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { name: 'New Name' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with updated profile on valid request', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })
    vi.mocked(authService.updateProfile).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'New Name',
      phone: null,
      avatarUrl: null,
      emailVerified: true,
      timezone: 'America/New_York',
      createdAt: new Date('2024-01-01'),
      roles: [],
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { name: 'New Name' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.name).toBe('New Name')
  })

  it('returns 400 for invalid profile update data', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { phone: 'not-e164-format' },
    })

    expect(response.statusCode).toBe(400)
  })
})

// ── POST /api/v1/auth/me/roles ─────────────────────────────────────────────

describe('POST /api/v1/auth/me/roles', () => {
  it('returns 401 without Authorization', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/roles',
      payload: { role: 'COACH' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 on valid role assignment', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })
    vi.mocked(authService.assignRole).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/roles',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { role: 'COACH' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Role assigned')
  })

  it('returns 400 for invalid role value', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/me/roles',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { role: 'INVALID_ROLE' },
    })

    expect(response.statusCode).toBe(400)
  })
})

// ── DELETE /api/v1/auth/me/sessions ───────────────────────────────────────

describe('DELETE /api/v1/auth/me/sessions', () => {
  it('returns 401 without Authorization', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me/sessions',
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 and clears all sessions for authenticated user', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test',
      roles: [],
      activeRole: null,
      iat: 0,
      exp: 9999999999,
      jti: '550e8400-e29b-41d4-a716-446655440001',
    })
    vi.mocked(authService.logoutAll).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me/sessions',
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(authService.logoutAll).toHaveBeenCalledWith('user-1')
  })
})

// ── GET /health ────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toBe('ok')
  })
})

// ── 404 handler ────────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' })
    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Not Found')
  })
})
