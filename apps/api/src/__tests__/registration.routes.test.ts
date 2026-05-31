// E7 · Registration Routes Integration Tests
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// Mock registration service
vi.mock('../services/registration.service.js', () => ({
  registrationService: {
    startRegistration: vi.fn(),
    handleStripeWebhook: vi.fn(),
    getTeamRegistrations: vi.fn(),
    getPaymentHistory: vi.fn(),
    withdrawRegistration: vi.fn(),
    lockRoster: vi.fn(),
  },
  RegistrationError: class RegistrationError extends Error {
    code: string
    statusCode: number
    constructor(code: string, statusCode: number) {
      super(code)
      this.code = code
      this.statusCode = statusCode
      this.name = 'RegistrationError'
    }
  },
}))

// Mock token service
vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

const { registrationService } = await import('../services/registration.service.js')
const { tokenService } = await import('../services/token.service.js')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440010'
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440020'
const REGISTRATION_ID = '550e8400-e29b-41d4-a716-446655440030'
const COACH_ID = 'coach-user-1'

const mockJwtPayload = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Test Coach',
  roles: [{ id: 'r1', role: 'HEAD_COACH', teamId: TEAM_ID, isPrimary: true }],
  activeRole: null,
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440001',
}

const mockRegistration = {
  id: REGISTRATION_ID,
  tournamentId: TOURNAMENT_ID,
  teamId: TEAM_ID,
  division: '12U',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  waitlistPosition: null,
  stripePaymentIntentId: 'pi_test_123',
  entryFeePaid: '0.00',
  rosterLocked: false,
  rosterLockedAt: null,
  registeredAt: new Date().toISOString(),
  confirmedAt: null,
  notes: null,
}

// ── App Setup ─────────────────────────────────────────────────────────────────

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

// ── POST /api/v1/registrations ────────────────────────────────────────────────

describe('POST /api/v1/registrations', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID, division: '12U' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 201 with registration + clientSecret for HEAD_COACH', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.startRegistration).mockResolvedValue({
      registration: mockRegistration,
      isWaitlist: false,
      clientSecret: 'pi_test_123_secret',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID, division: '12U' },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.registration.id).toBe(REGISTRATION_ID)
    expect(body.clientSecret).toBe('pi_test_123_secret')
    expect(body.isWaitlist).toBe(false)
  })

  it('returns 403 when user is not HEAD_COACH of the team', async () => {
    const nonCoachPayload = {
      ...mockJwtPayload,
      roles: [{ id: 'r2', role: 'PLAYER', teamId: TEAM_ID, isPrimary: false }],
    }
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(nonCoachPayload)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID, division: '12U' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 409 for already registered team', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    const { RegistrationError } = await import('../services/registration.service.js')
    vi.mocked(registrationService.startRegistration).mockRejectedValue(
      new RegistrationError('ALREADY_REGISTERED', 409)
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID, division: '12U' },
    })

    expect(response.statusCode).toBe(409)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('ALREADY_REGISTERED')
  })

  it('returns 400 for invalid body (missing division)', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 201 with isWaitlist=true when tournament is full', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.startRegistration).mockResolvedValue({
      registration: { ...mockRegistration, status: 'WAITLISTED', waitlistPosition: 2 },
      isWaitlist: true,
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations',
      headers: { Authorization: 'Bearer valid-token' },
      payload: { tournamentId: TOURNAMENT_ID, teamId: TEAM_ID, division: '12U' },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.isWaitlist).toBe(true)
  })
})

// ── POST /api/v1/registrations/webhook/stripe ─────────────────────────────────

describe('POST /api/v1/registrations/webhook/stripe', () => {
  it('returns 200 on valid Stripe signature (mocked)', async () => {
    vi.mocked(registrationService.handleStripeWebhook).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations/webhook/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'valid-sig',
      },
      payload: JSON.stringify({ type: 'payment_intent.succeeded' }),
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.received).toBe(true)
    expect(registrationService.handleStripeWebhook).toHaveBeenCalled()
  })

  it('returns 400 for invalid signature', async () => {
    const { RegistrationError } = await import('../services/registration.service.js')
    vi.mocked(registrationService.handleStripeWebhook).mockRejectedValue(
      new RegistrationError('INVALID_SIGNATURE', 400)
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations/webhook/stripe',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'invalid-sig',
      },
      payload: JSON.stringify({ type: 'payment_intent.succeeded' }),
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('signature')
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/registrations/webhook/stripe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ type: 'payment_intent.succeeded' }),
    })

    expect(response.statusCode).toBe(400)
  })
})

// ── GET /api/v1/registrations/team/:teamId ────────────────────────────────────

describe('GET /api/v1/registrations/team/:teamId', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/registrations/team/${TEAM_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with registrations list', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.getTeamRegistrations).mockResolvedValue([
      { ...mockRegistration, tournament: { id: TOURNAMENT_ID, name: 'Test Open 2026' } },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/registrations/team/${TEAM_ID}`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.registrations).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('returns 403 when user has no team role', async () => {
    const noTeamPayload = {
      ...mockJwtPayload,
      roles: [{ id: 'r3', role: 'COACH', teamId: 'other-team-id', isPrimary: true }],
    }
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(noTeamPayload)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/registrations/team/${TEAM_ID}`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(403)
  })
})

// ── GET /api/v1/registrations/team/:teamId/payment-history ───────────────────

describe('GET /api/v1/registrations/team/:teamId/payment-history', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/registrations/team/${TEAM_ID}/payment-history`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with payment history', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.getPaymentHistory).mockResolvedValue([
      {
        ...mockRegistration,
        paymentStatus: 'PAID',
        entryFeePaid: '495.00',
        confirmedAt: new Date().toISOString(),
        tournament: { name: 'Test Open 2026', startDate: new Date().toISOString() },
      },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/registrations/team/${TEAM_ID}/payment-history`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.payments).toHaveLength(1)
    expect(body.total).toBe(1)
  })
})

// ── PATCH /api/v1/registrations/:id/withdraw ─────────────────────────────────

describe('PATCH /api/v1/registrations/:id/withdraw', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/registrations/${REGISTRATION_ID}/withdraw`,
      payload: { teamId: TEAM_ID },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 on successful withdrawal', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.withdrawRegistration).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/registrations/${REGISTRATION_ID}/withdraw`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('withdrawn')
    expect(registrationService.withdrawRegistration).toHaveBeenCalledWith(REGISTRATION_ID, TEAM_ID)
  })

  it('returns 404 when registration not found', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    const { RegistrationError } = await import('../services/registration.service.js')
    vi.mocked(registrationService.withdrawRegistration).mockRejectedValue(
      new RegistrationError('NOT_FOUND', 404)
    )

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/registrations/${REGISTRATION_ID}/withdraw`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(404)
  })
})

// ── POST /api/v1/registrations/:id/lock-roster ────────────────────────────────

describe('POST /api/v1/registrations/:id/lock-roster', () => {
  it('returns 401 without token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/registrations/${REGISTRATION_ID}/lock-roster`,
      payload: { teamId: TEAM_ID },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with locked=true and empty violations when eligible', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.lockRoster).mockResolvedValue({
      locked: true,
      violations: [],
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/registrations/${REGISTRATION_ID}/lock-roster`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.locked).toBe(true)
    expect(body.violations).toHaveLength(0)
  })

  it('returns 422 with violations array when players are over-age', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(registrationService.lockRoster).mockResolvedValue({
      locked: false,
      violations: [{ playerName: 'Old Player', age: 16 }],
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/registrations/${REGISTRATION_ID}/lock-roster`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(422)
    const body = JSON.parse(response.body)
    expect(body.locked).toBe(false)
    expect(body.violations).toHaveLength(1)
    expect(body.violations[0].playerName).toBe('Old Player')
  })

  it('returns 402 when payment not completed', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    const { RegistrationError } = await import('../services/registration.service.js')
    vi.mocked(registrationService.lockRoster).mockRejectedValue(
      new RegistrationError('PAYMENT_REQUIRED', 402)
    )

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/registrations/${REGISTRATION_ID}/lock-roster`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(402)
  })

  it('returns 403 when user is not HEAD_COACH', async () => {
    const playerPayload = {
      ...mockJwtPayload,
      roles: [{ id: 'r4', role: 'PLAYER', teamId: TEAM_ID, isPrimary: false }],
    }
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(playerPayload)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/registrations/${REGISTRATION_ID}/lock-roster`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: { teamId: TEAM_ID },
    })

    expect(response.statusCode).toBe(403)
  })
})
