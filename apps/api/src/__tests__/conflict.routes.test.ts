// E8 · Conflict Detection — Integration Tests

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// ── Mock conflict service ─────────────────────────────────────────────────────

vi.mock('../services/conflict.service.js', () => ({
  conflictService: {
    checkEventConflicts: vi.fn(),
    getConflictsForUser: vi.fn(),
    checkRsvpConflict: vi.fn(),
    resolveConflict: vi.fn(),
  },
}))

// ── Mock token service ────────────────────────────────────────────────────────

vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

// ── Lazy import mocks ─────────────────────────────────────────────────────────

const { conflictService } = await import('../services/conflict.service.js')
const { tokenService } = await import('../services/token.service.js')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const CONFLICT_ID = '550e8400-e29b-41d4-a716-446655440010'
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440020'

const mockJwt = {
  sub: USER_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: null }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const baseConflictRecord = {
  id: CONFLICT_ID,
  userId: USER_ID,
  eventAId: EVENT_ID,
  eventBId: '550e8400-e29b-41d4-a716-446655440030',
  conflictType: 'COACH',
  playersAffected: [],
  detectedAt: new Date('2026-06-01T10:00:00.000Z').toISOString(),
  resolvedAt: null,
  resolvedBy: null,
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwt as any)
})

// ── GET /api/v1/conflicts ─────────────────────────────────────────────────────

describe('GET /api/v1/conflicts', () => {
  it('returns 200 with list of unresolved conflicts', async () => {
    vi.mocked(conflictService.getConflictsForUser).mockResolvedValue([baseConflictRecord] as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conflicts',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(CONFLICT_ID)
    expect(conflictService.getConflictsForUser).toHaveBeenCalledWith(USER_ID)
  })

  it('returns 200 with empty array when no conflicts', async () => {
    vi.mocked(conflictService.getConflictsForUser).mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conflicts',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conflicts',
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/conflicts/check-rsvp ─────────────────────────────────────────

describe('GET /api/v1/conflicts/check-rsvp', () => {
  it('returns 200 with hasConflict=true when RSVP overlaps', async () => {
    vi.mocked(conflictService.checkRsvpConflict).mockResolvedValue({
      hasConflict: true,
      conflictingEvents: [
        {
          id: 'other-event',
          title: 'Team B Practice',
          startTime: '2026-06-01T09:30:00.000Z',
          teamName: 'Thunder Hawks B',
        },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/conflicts/check-rsvp?eventId=${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.hasConflict).toBe(true)
    expect(body.conflictingEvents).toHaveLength(1)
    expect(body.conflictingEvents[0].teamName).toBe('Thunder Hawks B')
    expect(conflictService.checkRsvpConflict).toHaveBeenCalledWith(USER_ID, EVENT_ID)
  })

  it('returns 200 with hasConflict=false when no overlap', async () => {
    vi.mocked(conflictService.checkRsvpConflict).mockResolvedValue({
      hasConflict: false,
      conflictingEvents: [],
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/conflicts/check-rsvp?eventId=${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.hasConflict).toBe(false)
  })

  it('returns 400 when eventId query parameter is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conflicts/check-rsvp',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('eventId')
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/conflicts/check-rsvp?eventId=${EVENT_ID}`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── PATCH /api/v1/conflicts/:id/resolve ──────────────────────────────────────

describe('PATCH /api/v1/conflicts/:id/resolve', () => {
  it('returns 200 with resolved conflict record', async () => {
    const resolved = {
      ...baseConflictRecord,
      resolvedAt: new Date().toISOString(),
      resolvedBy: USER_ID,
    }
    vi.mocked(conflictService.resolveConflict).mockResolvedValue(resolved as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conflicts/${CONFLICT_ID}/resolve`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.resolvedBy).toBe(USER_ID)
    expect(conflictService.resolveConflict).toHaveBeenCalledWith(CONFLICT_ID, USER_ID)
  })

  it('returns 404 when conflict record not found', async () => {
    const prismaError = new Error('Record to update not found')
    vi.mocked(conflictService.resolveConflict).mockRejectedValue(prismaError)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conflicts/${CONFLICT_ID}/resolve`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conflicts/${CONFLICT_ID}/resolve`,
    })

    expect(response.statusCode).toBe(401)
  })
})
