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

// ── Mock schedule service ─────────────────────────────────────────────────────

vi.mock('../services/schedule.service.js', () => ({
  scheduleService: {
    getUserEvents: vi.fn(),
    getTeamEvents: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    cancelEvent: vi.fn(),
    getEventById: vi.fn(),
    generateIcs: vi.fn(),
  },
}))

// ── Lazy import mocks ─────────────────────────────────────────────────────────

const { tokenService } = await import('../services/token.service.js')
const { scheduleService } = await import('../services/schedule.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440030'

const mockJwt = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: TEAM_ID }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const baseMember = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH' as const,
  jerseyNumber: null,
  positions: [] as string[],
  status: 'ACTIVE' as const,
  joinedAt: new Date(),
  updatedAt: new Date(),
}

const baseEventResponse = {
  id: EVENT_ID,
  teamId: TEAM_ID,
  type: 'PRACTICE',
  title: 'Morning Practice',
  locationName: 'Thunder Field',
  locationAddress: '123 Main St',
  lat: null,
  lng: null,
  startTime: '2026-06-01T09:00:00.000Z',
  endTime: '2026-06-01T11:00:00.000Z',
  notes: null,
  isCancelled: false,
  cancelledAt: null,
  rsvpCounts: { yes: 0, no: 0, maybe: 0, noResponse: 0 },
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

const baseEventDb = {
  id: EVENT_ID,
  teamId: TEAM_ID,
  tournamentRegistrationId: null,
  type: 'PRACTICE' as const,
  title: 'Morning Practice',
  locationName: 'Thunder Field',
  locationAddress: '123 Main St',
  lat: null,
  lng: null,
  startTime: new Date('2026-06-01T09:00:00.000Z'),
  endTime: new Date('2026-06-01T11:00:00.000Z'),
  notes: null,
  isCancelled: false,
  cancelledAt: null,
  cancelledBy: null,
  sendNotification: true,
  createdBy: COACH_ID,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
}

const validCreatePayload = {
  title: 'Morning Practice',
  type: 'PRACTICE',
  startTime: '2026-06-01T09:00:00.000Z',
  endTime: '2026-06-01T11:00:00.000Z',
  sendNotification: true,
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

// ── GET /api/v1/schedule ──────────────────────────────────────────────────────

describe('GET /api/v1/schedule', () => {
  it('returns 200 with events array for authenticated user', async () => {
    const userEventResponse = { ...baseEventResponse, teamName: 'Thunder Hawks', teamSport: 'BASEBALL', userRsvp: null }
    vi.mocked(scheduleService.getUserEvents).mockResolvedValue([userEventResponse] as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/schedule?start=2026-06-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z',
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(EVENT_ID)
    expect(scheduleService.getUserEvents).toHaveBeenCalledWith(
      COACH_ID,
      expect.any(Date),
      expect.any(Date),
    )
  })

  it('returns 200 with empty array when user has no events', async () => {
    vi.mocked(scheduleService.getUserEvents).mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/schedule',
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
      url: '/api/v1/schedule',
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/schedule/teams/:teamId ───────────────────────────────────────

describe('GET /api/v1/schedule/teams/:teamId', () => {
  it('returns 200 with team events for a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getTeamEvents).mockResolvedValue([baseEventResponse] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}?start=2026-06-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].teamId).toBe(TEAM_ID)
    expect(scheduleService.getTeamEvents).toHaveBeenCalledWith(
      TEAM_ID,
      expect.any(Date),
      expect.any(Date),
    )
  })

  it('returns 404 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/schedule/teams/:teamId/export.ics ────────────────────────────

describe('GET /api/v1/schedule/teams/:teamId/export.ics', () => {
  it('returns 200 with Content-Type text/calendar for team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getTeamEvents).mockResolvedValue([baseEventResponse] as any)
    vi.mocked(prisma.team.findUniqueOrThrow).mockResolvedValue({
      id: TEAM_ID,
      name: 'Thunder Hawks',
    } as any)
    vi.mocked(scheduleService.generateIcs).mockReturnValue(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
    )

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/export.ics`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/calendar')
    expect(response.body).toContain('BEGIN:VCALENDAR')
  })

  it('sets Content-Disposition attachment header with team name', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getTeamEvents).mockResolvedValue([])
    vi.mocked(prisma.team.findUniqueOrThrow).mockResolvedValue({
      id: TEAM_ID,
      name: 'Thunder Hawks',
    } as any)
    vi.mocked(scheduleService.generateIcs).mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR')

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/export.ics`,
      headers: AUTH_HEADER,
    })

    expect(response.headers['content-disposition']).toContain('Thunder Hawks-schedule.ics')
  })

  it('returns 404 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/export.ics`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/export.ics`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/schedule/teams/:teamId/events ───────────────────────────────

describe('POST /api/v1/schedule/teams/:teamId/events', () => {
  it('returns 201 with created event for coach', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.createEvent).mockResolvedValue(baseEventDb as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      headers: AUTH_HEADER,
      payload: validCreatePayload,
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(EVENT_ID)
    expect(scheduleService.createEvent).toHaveBeenCalledWith(
      TEAM_ID,
      COACH_ID,
      expect.objectContaining({
        title: 'Morning Practice',
        type: 'PRACTICE',
      }),
    )
  })

  it('returns 400 for invalid payload — missing required fields', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      headers: AUTH_HEADER,
      payload: { title: 'Practice' }, // missing type, startTime, endTime
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.details).toBeDefined()
  })

  it('returns 400 when endTime is before startTime', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      headers: AUTH_HEADER,
      payload: {
        title: 'Bad Event',
        type: 'PRACTICE',
        startTime: '2026-06-01T11:00:00.000Z',
        endTime: '2026-06-01T09:00:00.000Z', // end before start
        sendNotification: true,
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 403 when PLAYER role tries to create event', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...baseMember,
      role: 'PLAYER',
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      headers: AUTH_HEADER,
      payload: validCreatePayload,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 404 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      headers: AUTH_HEADER,
      payload: validCreatePayload,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events`,
      payload: validCreatePayload,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── PATCH /api/v1/schedule/teams/:teamId/events/:eventId ─────────────────────

describe('PATCH /api/v1/schedule/teams/:teamId/events/:eventId', () => {
  it('returns 200 with updated event for coach', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(baseEventDb as any)
    vi.mocked(scheduleService.updateEvent).mockResolvedValue({
      ...baseEventDb,
      title: 'Updated Practice',
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
      payload: { title: 'Updated Practice' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.title).toBe('Updated Practice')
    expect(scheduleService.updateEvent).toHaveBeenCalledWith(
      EVENT_ID,
      TEAM_ID,
      expect.objectContaining({ title: 'Updated Practice' }),
    )
  })

  it('returns 404 when event does not exist', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
      payload: { title: 'Updated' },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 403 when PARENT role tries to update', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...baseMember,
      role: 'PARENT',
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
      payload: { title: 'Updated' },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      payload: { title: 'Updated' },
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── DELETE /api/v1/schedule/teams/:teamId/events/:eventId ────────────────────

describe('DELETE /api/v1/schedule/teams/:teamId/events/:eventId', () => {
  it('returns 200 with cancelled event for coach (soft cancel)', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(baseEventDb as any)
    vi.mocked(scheduleService.cancelEvent).mockResolvedValue({
      ...baseEventDb,
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: COACH_ID,
    } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.isCancelled).toBe(true)
    expect(scheduleService.cancelEvent).toHaveBeenCalledWith(EVENT_ID, TEAM_ID, COACH_ID)
  })

  it('returns 404 when event does not exist', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 409 when event is already cancelled', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue({
      ...baseEventDb,
      isCancelled: true,
    } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(409)
  })

  it('returns 403 when PLAYER role tries to cancel', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...baseMember,
      role: 'PLAYER',
    } as any)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/schedule/teams/:teamId/events/:eventId ───────────────────────

describe('GET /api/v1/schedule/teams/:teamId/events/:eventId', () => {
  it('returns 200 with event details for team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(baseEventDb as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(EVENT_ID)
    expect(body.type).toBe('PRACTICE')
    expect(body.startTime).toBe('2026-06-01T09:00:00.000Z')
  })

  it('returns 404 when event does not exist', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
    vi.mocked(scheduleService.getEventById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 404 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── All protected schedule routes return 401 without auth ─────────────────────

describe('All protected schedule routes return 401 without auth', () => {
  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string }> = [
    { method: 'GET', url: '/api/v1/schedule' },
    { method: 'GET', url: `/api/v1/schedule/teams/${TEAM_ID}` },
    { method: 'GET', url: `/api/v1/schedule/teams/${TEAM_ID}/export.ics` },
    { method: 'POST', url: `/api/v1/schedule/teams/${TEAM_ID}/events` },
    { method: 'GET', url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}` },
    { method: 'PATCH', url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}` },
    { method: 'DELETE', url: `/api/v1/schedule/teams/${TEAM_ID}/events/${EVENT_ID}` },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
