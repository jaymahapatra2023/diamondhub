// E11 · Player Profiles & Stats — Route integration tests
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

// ── Mock player stats service ─────────────────────────────────────────────────

vi.mock('../services/player-stats.service.js', () => ({
  playerStatsService: {
    getGameStats: vi.fn(),
    upsertGameStat: vi.fn(),
    getPlayerSeasonStats: vi.fn(),
    getTeamRecord: vi.fn(),
  },
}))

// ── Lazy import mocks ─────────────────────────────────────────────────────────

const { tokenService } = await import('../services/token.service.js')
const { playerStatsService } = await import('../services/player-stats.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440010'
const HOME_TEAM_ID = TEAM_ID
const AWAY_TEAM_ID = '550e8400-e29b-41d4-a716-446655440011'
const GAME_ID = '550e8400-e29b-41d4-a716-446655440020'
const PLAYER_ID = '550e8400-e29b-41d4-a716-446655440030'
const PLAYER_USER_ID = '550e8400-e29b-41d4-a716-446655440031'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const NOW = '2026-06-15T00:00:00.000Z'

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

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const coachMembership = {
  id: 'tm-1',
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH',
  status: 'ACTIVE',
  jerseyNumber: null,
  positions: [],
  joinedAt: new Date(),
  updatedAt: new Date(),
}

const mockGameDb = {
  id: GAME_ID,
  homeTeamId: HOME_TEAM_ID,
  awayTeamId: AWAY_TEAM_ID,
}

const mockStatRecord = {
  id: 'stat-1',
  gameId: GAME_ID,
  playerId: PLAYER_ID,
  atBats: 4,
  hits: 2,
  doubles: 1,
  triples: 0,
  homeRuns: 0,
  rbi: 1,
  walks: 1,
  strikeouts: 2,
  inningsPitched: 3,
  earnedRuns: 1,
  pitchingWin: null,
}

const validStatPayload = {
  atBats: 4,
  hits: 2,
  doubles: 1,
  triples: 0,
  homeRuns: 0,
  rbi: 1,
  walks: 1,
  strikeouts: 2,
  inningsPitched: 3,
  earnedRuns: 1,
  pitchingWin: null,
}

const mockSeasonStats = {
  playerId: PLAYER_ID,
  games: 5,
  batting: {
    atBats: 18,
    hits: 7,
    battingAverage: '.389',
    sluggingPct: '.556',
    doubles: 2,
    triples: 0,
    homeRuns: 0,
    rbi: 4,
    walks: 3,
    strikeouts: 8,
  },
  pitching: {
    inningsPitched: '10.0',
    earnedRuns: 4,
    era: '3.60',
  },
  gameStats: [],
}

const mockTeamRecord = {
  teamId: TEAM_ID,
  wins: 8,
  losses: 3,
  ties: 1,
  total: 12,
  tournamentFinishes: [
    { tournamentName: 'Summer Classic', result: 'Participated' },
  ],
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

// ── GET /api/v1/player-stats/games/:gameId ───────────────────────────────────

describe('GET /api/v1/player-stats/games/:gameId', () => {
  it('returns 200 with game stats for all players', async () => {
    const statsWithPlayer = [
      {
        ...mockStatRecord,
        player: { id: PLAYER_ID, teamId: TEAM_ID, user: { name: 'Test Player' } },
      },
    ]
    vi.mocked(playerStatsService.getGameStats).mockResolvedValue(statsWithPlayer as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/games/${GAME_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].gameId).toBe(GAME_ID)
    expect(playerStatsService.getGameStats).toHaveBeenCalledWith(GAME_ID)
  })

  it('returns 200 with empty array when no stats yet', async () => {
    vi.mocked(playerStatsService.getGameStats).mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/games/${GAME_ID}`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveLength(0)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/games/${GAME_ID}`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/player-stats/games/:gameId/players/:playerId ────────────────

describe('POST /api/v1/player-stats/games/:gameId/players/:playerId', () => {
  it('returns 200 when coach upserts player stat', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(mockGameDb as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(playerStatsService.upsertGameStat).mockResolvedValue(mockStatRecord as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      headers: AUTH_HEADER,
      payload: validStatPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(playerStatsService.upsertGameStat).toHaveBeenCalledWith(
      GAME_ID,
      PLAYER_ID,
      expect.objectContaining({ atBats: 4, hits: 2 }),
    )
  })

  it('returns 403 when user is not a coach of a participating team', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(mockGameDb as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      headers: AUTH_HEADER,
      payload: validStatPayload,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 404 when game does not exist', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      headers: AUTH_HEADER,
      payload: validStatPayload,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 400 for invalid stat payload (negative atBats)', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(mockGameDb as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      headers: AUTH_HEADER,
      payload: { ...validStatPayload, atBats: -1 },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for missing required fields', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(mockGameDb as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      headers: AUTH_HEADER,
      payload: { atBats: 4 }, // missing most required fields
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}`,
      payload: validStatPayload,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/player-stats/players/:playerId/season ────────────────────────

describe('GET /api/v1/player-stats/players/:playerId/season', () => {
  it('returns 200 with season stats for a team member', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      id: PLAYER_ID,
      teamId: TEAM_ID,
      userId: PLAYER_USER_ID,
    } as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(playerStatsService.getPlayerSeasonStats).mockResolvedValue(mockSeasonStats as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/players/${PLAYER_ID}/season`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.playerId).toBe(PLAYER_ID)
    expect(body.batting.battingAverage).toBe('.389')
    expect(playerStatsService.getPlayerSeasonStats).toHaveBeenCalledWith(PLAYER_ID, undefined)
  })

  it('passes season year when provided in query', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      id: PLAYER_ID,
      teamId: TEAM_ID,
      userId: PLAYER_USER_ID,
    } as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(playerStatsService.getPlayerSeasonStats).mockResolvedValue(mockSeasonStats as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/players/${PLAYER_ID}/season?season=2026`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(playerStatsService.getPlayerSeasonStats).toHaveBeenCalledWith(PLAYER_ID, 2026)
  })

  it('returns 404 when player not found', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/players/${PLAYER_ID}/season`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/players/${PLAYER_ID}/season`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/player-stats/teams/:teamId/record ────────────────────────────

describe('GET /api/v1/player-stats/teams/:teamId/record', () => {
  it('returns 200 with W/L/T record for team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...coachMembership,
      status: 'ACTIVE',
    } as any)
    vi.mocked(playerStatsService.getTeamRecord).mockResolvedValue(mockTeamRecord as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/teams/${TEAM_ID}/record`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.teamId).toBe(TEAM_ID)
    expect(body.wins).toBe(8)
    expect(body.losses).toBe(3)
    expect(body.ties).toBe(1)
    expect(body.total).toBe(12)
    expect(playerStatsService.getTeamRecord).toHaveBeenCalledWith(TEAM_ID, undefined)
  })

  it('passes season year when provided in query', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      ...coachMembership,
      status: 'ACTIVE',
    } as any)
    vi.mocked(playerStatsService.getTeamRecord).mockResolvedValue(mockTeamRecord as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/teams/${TEAM_ID}/record?season=2026`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    expect(playerStatsService.getTeamRecord).toHaveBeenCalledWith(TEAM_ID, 2026)
  })

  it('returns 403 when user is not a team member', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/teams/${TEAM_ID}/record`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/player-stats/teams/${TEAM_ID}/record`,
    })
    expect(response.statusCode).toBe(401)
  })
})

// ── All protected routes → 401 without auth ───────────────────────────────────

describe('All protected player-stats routes return 401 without auth', () => {
  const protectedRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH'; url: string }> = [
    { method: 'GET', url: `/api/v1/player-stats/games/${GAME_ID}` },
    { method: 'POST', url: `/api/v1/player-stats/games/${GAME_ID}/players/${PLAYER_ID}` },
    { method: 'GET', url: `/api/v1/player-stats/players/${PLAYER_ID}/season` },
    { method: 'GET', url: `/api/v1/player-stats/teams/${TEAM_ID}/record` },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401`, async () => {
      const response = await app.inject({ method: route.method, url: route.url })
      expect(response.statusCode).toBe(401)
    })
  }
})
