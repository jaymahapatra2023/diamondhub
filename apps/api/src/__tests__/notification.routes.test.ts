// E5 · Notifications & Alerts — Route integration tests
// All routes require valid Bearer token → 401 without auth

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// ── Mock token service ────────────────────────────────────────────────────────

vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

// ── Mock notification service ─────────────────────────────────────────────────

vi.mock('../services/notification.service.js', () => ({
  notificationService: {
    getNotifications: vi.fn(),
    markRead: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    registerDeviceToken: vi.fn(),
    unregisterDeviceToken: vi.fn(),
    sendTeamBroadcast: vi.fn(),
    sendGameTimeChange: vi.fn(),
    scheduleRsvpReminders: vi.fn(),
    sendWeeklyDigest: vi.fn(),
    sendBracketUpdate: vi.fn(),
  },
}))

// ── Lazy import mocks ─────────────────────────────────────────────────────────

const { tokenService } = await import('../services/token.service.js')
const { notificationService } = await import('../services/notification.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const NOTIF_ID = '550e8400-e29b-41d4-a716-446655440050'

const mockCoachJwt = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: TEAM_ID }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const mockPlayerJwt = {
  sub: '550e8400-e29b-41d4-a716-446655440002',
  email: 'player@example.com',
  name: 'Player Pete',
  roles: [{ role: 'PLAYER', teamId: TEAM_ID }],
  activeRole: 'PLAYER',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440098',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const mockNotification = {
  id: NOTIF_ID,
  type: 'GAME_TIME_CHANGE',
  title: 'Game time changed',
  body: 'New time: 11:00 AM',
  data: {},
  isRead: false,
  createdAt: '2026-06-01T12:00:00.000Z',
}

const mockPrefs = {
  GAME_TIME_CHANGE: { push: true, sms: true, email: false },
  RSVP_REMINDER: { push: true, sms: false, email: false },
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
  vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockCoachJwt as any)
})

// ── GET /api/v1/notifications ────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns 200 with notifications list and unreadCount', async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue({
      notifications: [mockNotification],
      unreadCount: 1,
      total: 5,
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.notifications).toHaveLength(1)
    expect(body.unreadCount).toBe(1)
    expect(body.total).toBe(5)
    expect(notificationService.getNotifications).toHaveBeenCalledWith(COACH_ID, 1, 20)
  })

  it('passes page and limit query params to service', async () => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      total: 0,
    } as any)

    await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=2&limit=10',
      headers: AUTH_HEADER,
    })

    expect(notificationService.getNotifications).toHaveBeenCalledWith(COACH_ID, 2, 10)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── PATCH /api/v1/notifications/read ─────────────────────────────────────────

describe('PATCH /api/v1/notifications/read', () => {
  it('returns 200 and marks all read when no IDs provided', async () => {
    vi.mocked(notificationService.markRead).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/read',
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(notificationService.markRead).toHaveBeenCalledWith(COACH_ID, undefined)
  })

  it('returns 200 and marks specific notifications as read', async () => {
    vi.mocked(notificationService.markRead).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/read',
      headers: AUTH_HEADER,
      payload: { notificationIds: [NOTIF_ID] },
    })

    expect(response.statusCode).toBe(200)
    expect(notificationService.markRead).toHaveBeenCalledWith(COACH_ID, [NOTIF_ID])
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/read',
      payload: {},
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/notifications/preferences ────────────────────────────────────

describe('GET /api/v1/notifications/preferences', () => {
  it('returns 200 with preferences object', async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(mockPrefs as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/preferences',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual(mockPrefs)
    expect(notificationService.getPreferences).toHaveBeenCalledWith(COACH_ID, 'COACH')
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/preferences',
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── PUT /api/v1/notifications/preferences ────────────────────────────────────

describe('PUT /api/v1/notifications/preferences', () => {
  const validPrefs = {
    GAME_TIME_CHANGE: { push: true, sms: false, email: false },
    GAME_CANCELLED: { push: true, sms: true, email: false },
    RAIN_DELAY: { push: true, sms: true, email: false },
    FIELDS_CLOSED: { push: true, sms: false, email: false },
    BRACKET_UPDATE: { push: true, sms: false, email: false },
    RSVP_REMINDER: { push: true, sms: false, email: false },
    NEW_TOURNAMENT: { push: false, sms: false, email: true },
    REGISTRATION_CONFIRMED: { push: true, sms: false, email: true },
    ROSTER_APPROVED: { push: true, sms: false, email: false },
    PAYMENT_DUE: { push: true, sms: true, email: true },
    TEAM_ANNOUNCEMENT: { push: true, sms: false, email: false },
    NEW_MESSAGE: { push: true, sms: false, email: false },
    INVITE: { push: true, sms: false, email: true },
    CONFLICT_DETECTED: { push: true, sms: false, email: false },
    WAITLIST_SPOT_OPEN: { push: true, sms: false, email: false },
    WEATHER_ALERT: { push: true, sms: true, email: false },
    EMAIL_VERIFIED: { push: false, sms: false, email: false },
    ALL_CLEAR: { push: true, sms: false, email: false },
  }

  it('returns 200 and updates preferences', async () => {
    vi.mocked(notificationService.updatePreferences).mockResolvedValue({} as any)

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: AUTH_HEADER,
      payload: validPrefs,
    })

    expect(response.statusCode).toBe(200)
    expect(notificationService.updatePreferences).toHaveBeenCalledWith(
      COACH_ID,
      expect.objectContaining({ GAME_TIME_CHANGE: { push: true, sms: false, email: false } }),
    )
  })

  it('returns 400 for invalid preference shape', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      headers: AUTH_HEADER,
      payload: { INVALID_TYPE: { push: 'yes' } },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/notifications/preferences',
      payload: validPrefs,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/notifications/device-tokens ─────────────────────────────────

describe('POST /api/v1/notifications/device-tokens', () => {
  it('returns 201 when token registered successfully', async () => {
    vi.mocked(notificationService.registerDeviceToken).mockResolvedValue({} as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/device-tokens',
      headers: AUTH_HEADER,
      payload: { token: 'fcm-token-abc123xyz', platform: 'IOS' },
    })

    expect(response.statusCode).toBe(201)
    expect(notificationService.registerDeviceToken).toHaveBeenCalledWith(
      COACH_ID,
      'fcm-token-abc123xyz',
      'IOS',
    )
  })

  it('returns 400 for missing token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/device-tokens',
      headers: AUTH_HEADER,
      payload: { platform: 'IOS' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for invalid platform', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/device-tokens',
      headers: AUTH_HEADER,
      payload: { token: 'fcm-token-abc123xyz', platform: 'INVALID' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/device-tokens',
      payload: { token: 'fcm-token-abc123', platform: 'IOS' },
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/notifications/broadcast ─────────────────────────────────────

describe('POST /api/v1/notifications/broadcast', () => {
  const validBroadcast = {
    teamId: TEAM_ID,
    type: 'RAIN_DELAY',
    message: 'Game delayed 30 minutes due to lightning in the area',
  }

  beforeEach(() => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      id: 'tm-1',
      teamId: TEAM_ID,
      userId: COACH_ID,
      role: 'HEAD_COACH',
      status: 'ACTIVE',
    } as any)
    vi.mocked(notificationService.sendTeamBroadcast).mockResolvedValue(undefined)
  })

  it('returns 200 for a coach on the team', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      headers: AUTH_HEADER,
      payload: validBroadcast,
    })

    expect(response.statusCode).toBe(200)
    expect(notificationService.sendTeamBroadcast).toHaveBeenCalledWith(
      TEAM_ID,
      'RAIN_DELAY',
      'Rain delay',
      validBroadcast.message,
    )
  })

  it('returns 403 when a PLAYER role attempts broadcast', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockPlayerJwt as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      headers: AUTH_HEADER,
      payload: validBroadcast,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 403 when coach is not a member of the team', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      headers: AUTH_HEADER,
      payload: validBroadcast,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 400 for invalid broadcast type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      headers: AUTH_HEADER,
      payload: { ...validBroadcast, type: 'INVALID_TYPE' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for empty message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      headers: AUTH_HEADER,
      payload: { ...validBroadcast, message: '' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/broadcast',
      payload: validBroadcast,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── All protected routes → 401 without auth ───────────────────────────────────

describe('All protected notification routes return 401 without auth', () => {
  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/notifications' },
    { method: 'PATCH', url: '/api/v1/notifications/read' },
    { method: 'GET', url: '/api/v1/notifications/preferences' },
    { method: 'PUT', url: '/api/v1/notifications/preferences' },
    { method: 'POST', url: '/api/v1/notifications/device-tokens' },
    { method: 'DELETE', url: '/api/v1/notifications/device-tokens' },
    { method: 'POST', url: '/api/v1/notifications/broadcast' },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
