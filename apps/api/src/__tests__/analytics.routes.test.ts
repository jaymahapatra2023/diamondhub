// E14 · Coach Analytics — Route integration tests
// All routes require valid Bearer token and HEAD_COACH/ASSISTANT_COACH membership

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

// ── Mock analytics service ────────────────────────────────────────────────────

vi.mock('../services/analytics.service.js', () => ({
  analyticsService: {
    getSeasonCosts: vi.fn(),
    getAttendanceRates: vi.fn(),
    getTournamentWinRates: vi.fn(),
  },
}))

const { tokenService } = await import('../services/token.service.js')
const { analyticsService } = await import('../services/analytics.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

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

const coachMembership = {
  id: 'tm-1',
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH',
  status: 'ACTIVE',
}

const mockSeasonCosts = {
  totalSpent: 550,
  perPlayerCost: 110,
  registrations: [
    { tournamentName: 'Summer Classic', date: '2026-06-01T00:00:00.000Z', amount: 250 },
    { tournamentName: 'Fall Invitational', date: '2026-09-15T00:00:00.000Z', amount: 300 },
  ],
}

const mockAttendance = [
  { userId: 'p1', name: 'Alice', attended: 8, total: 10, rate: 80, belowThreshold: false },
  { userId: 'p2', name: 'Bob', attended: 5, total: 10, rate: 50, belowThreshold: true },
]

const mockWinRates = [
  { organizer: 'USSSA', wins: 3, total: 5, winRate: 60 },
  { organizer: 'PGF', wins: 2, total: 2, winRate: 100 },
]

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

// ── GET /api/v1/analytics/teams/:teamId/costs ────────────────────────────────

describe('GET /api/v1/analytics/teams/:teamId/costs', () => {
  it('returns 200 with season cost data for a coach', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(analyticsService.getSeasonCosts).mockResolvedValue(mockSeasonCosts as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/costs`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.totalSpent).toBe(550)
    expect(body.perPlayerCost).toBe(110)
    expect(body.registrations).toHaveLength(2)
    expect(analyticsService.getSeasonCosts).toHaveBeenCalledWith(TEAM_ID)
  })

  it('returns 403 when user is not a coach of this team', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/costs`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/costs`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/analytics/teams/:teamId/attendance ───────────────────────────

describe('GET /api/v1/analytics/teams/:teamId/attendance', () => {
  it('returns 200 with attendance rates array', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(analyticsService.getAttendanceRates).mockResolvedValue(mockAttendance as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/attendance`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    const bob = body.find((r: any) => r.name === 'Bob')
    expect(bob.belowThreshold).toBe(true)
    expect(analyticsService.getAttendanceRates).toHaveBeenCalledWith(TEAM_ID)
  })

  it('returns 403 when user is not a coach', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/attendance`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/attendance`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/analytics/teams/:teamId/win-rates ────────────────────────────

describe('GET /api/v1/analytics/teams/:teamId/win-rates', () => {
  it('returns 200 with win rates by organizer', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(analyticsService.getTournamentWinRates).mockResolvedValue(mockWinRates as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/win-rates`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    const usssa = body.find((r: any) => r.organizer === 'USSSA')
    expect(usssa.winRate).toBe(60)
    expect(analyticsService.getTournamentWinRates).toHaveBeenCalledWith(TEAM_ID)
  })

  it('returns 403 when user is not a coach', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/win-rates`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/teams/${TEAM_ID}/win-rates`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── All analytics routes → 401 without auth ───────────────────────────────────

describe('All analytics routes return 401 without auth', () => {
  const routes: Array<{ method: 'GET'; url: string }> = [
    { method: 'GET', url: `/api/v1/analytics/teams/${TEAM_ID}/costs` },
    { method: 'GET', url: `/api/v1/analytics/teams/${TEAM_ID}/attendance` },
    { method: 'GET', url: `/api/v1/analytics/teams/${TEAM_ID}/win-rates` },
  ]

  for (const route of routes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
