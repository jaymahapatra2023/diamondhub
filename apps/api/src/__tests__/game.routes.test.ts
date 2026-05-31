// E9 · Live Scoring & Brackets — Integration Tests

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// ── Mock game service ─────────────────────────────────────────────────────────

vi.mock('../services/game.service.js', () => ({
  gameService: {
    updateScore: vi.fn(),
    getTournamentGames: vi.fn(),
    getGame: vi.fn(),
    createGame: vi.fn(),
    getBracket: vi.fn(),
    getStandings: vi.fn(),
    getTeamGameHistory: vi.fn(),
    assignScorekeeper: vi.fn(),
  },
  GameError: class GameError extends Error {
    constructor(public code: string, public statusCode: number) {
      super(code)
      this.name = 'GameError'
    }
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

const { gameService, GameError } = await import('../services/game.service.js')
const { tokenService } = await import('../services/token.service.js')
const { prisma } = await import('@diamondhub/db')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440000'
const GAME_ID = '550e8400-e29b-41d4-a716-446655440010'
const HOME_TEAM_ID = '550e8400-e29b-41d4-a716-446655440020'
const AWAY_TEAM_ID = '550e8400-e29b-41d4-a716-446655440021'
const COACH_ID = '550e8400-e29b-41d4-a716-446655440001'
const SCOREKEEPER_ID = '550e8400-e29b-41d4-a716-446655440050'

const mockJwt = {
  sub: COACH_ID,
  email: 'coach@example.com',
  name: 'Coach Bob',
  roles: [{ role: 'COACH', teamId: HOME_TEAM_ID }],
  activeRole: 'COACH',
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440099',
}

const AUTH_HEADER = { Authorization: 'Bearer valid-token' }

const baseGameResponse = {
  id: GAME_ID,
  tournamentId: TOURNAMENT_ID,
  homeTeamId: HOME_TEAM_ID,
  awayTeamId: AWAY_TEAM_ID,
  homeTeamName: 'Home Hawks',
  awayTeamName: 'Away Eagles',
  field: 'Field A',
  round: 'Pool',
  pool: 'A',
  gameNumber: 1,
  scheduledTime: '2026-06-15T14:00:00.000Z',
  actualStartTime: null,
  scoreHome: 0,
  scoreAway: 0,
  inning: 1,
  half: 'TOP',
  status: 'SCHEDULED',
  winnerId: null,
  inningsDetail: [],
  updatedAt: '2026-06-15T14:00:00.000Z',
}

const baseGameDb = {
  ...baseGameResponse,
  scheduledTime: new Date('2026-06-15T14:00:00.000Z'),
  updatedAt: new Date('2026-06-15T14:00:00.000Z'),
  homeTeam: { id: HOME_TEAM_ID, name: 'Home Hawks' },
  awayTeam: { id: AWAY_TEAM_ID, name: 'Away Eagles' },
  tournament: { id: TOURNAMENT_ID, name: 'Summer Classic', organizer: 'USSSA' },
  scorekeeperId: null,
  createdAt: new Date(),
}

const coachMembership = {
  id: 'member-1',
  teamId: HOME_TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH' as const,
  status: 'ACTIVE' as const,
  jerseyNumber: null,
  positions: [],
  joinedAt: new Date(),
  updatedAt: new Date(),
}

const validScorePayload = {
  scoreHome: 3,
  scoreAway: 1,
  inning: 4,
  half: 'TOP',
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

// ── GET /api/v1/games/tournaments/:tournamentId ───────────────────────────────

describe('GET /api/v1/games/tournaments/:tournamentId', () => {
  it('returns 200 with all tournament games (public route)', async () => {
    vi.mocked(gameService.getTournamentGames).mockResolvedValue([baseGameDb] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(GAME_ID)
    expect(gameService.getTournamentGames).toHaveBeenCalledWith(TOURNAMENT_ID)
  })

  it('returns 200 with empty array when no games', async () => {
    vi.mocked(gameService.getTournamentGames).mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveLength(0)
  })
})

// ── GET /api/v1/games/tournaments/:tournamentId/bracket ──────────────────────

describe('GET /api/v1/games/tournaments/:tournamentId/bracket', () => {
  it('returns 200 with bracket data (no auth required)', async () => {
    vi.mocked(gameService.getBracket).mockResolvedValue([
      { ...baseGameResponse, isUserTeam: false },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}/bracket`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].id).toBe(GAME_ID)
  })

  it('enriches isUserTeam when authenticated', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(gameService.getBracket).mockResolvedValue([
      { ...baseGameResponse, isUserTeam: true },
    ] as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}/bracket`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(gameService.getBracket).toHaveBeenCalledWith(TOURNAMENT_ID, HOME_TEAM_ID)
  })
})

// ── GET /api/v1/games/tournaments/:tournamentId/standings ────────────────────

describe('GET /api/v1/games/tournaments/:tournamentId/standings', () => {
  it('returns 200 with standings data (public route)', async () => {
    const standings = [
      {
        teamId: HOME_TEAM_ID,
        teamName: 'Home Hawks',
        wins: 2,
        losses: 0,
        ties: 0,
        runsScored: 12,
        runsAllowed: 5,
        runDifferential: 7,
        pool: 'A',
        isUserTeam: false,
      },
    ]
    vi.mocked(gameService.getStandings).mockResolvedValue(standings as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}/standings`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].wins).toBe(2)
    expect(gameService.getStandings).toHaveBeenCalledWith(TOURNAMENT_ID, undefined)
  })

  it('passes pool query param to service', async () => {
    vi.mocked(gameService.getStandings).mockResolvedValue([])

    await app.inject({
      method: 'GET',
      url: `/api/v1/games/tournaments/${TOURNAMENT_ID}/standings?pool=A`,
    })

    expect(gameService.getStandings).toHaveBeenCalledWith(TOURNAMENT_ID, 'A')
  })
})

// ── GET /api/v1/games/teams/:teamId/history ───────────────────────────────────

describe('GET /api/v1/games/teams/:teamId/history', () => {
  it('returns 200 with team game history (auth required)', async () => {
    const history = [
      {
        gameId: GAME_ID,
        tournamentId: TOURNAMENT_ID,
        tournamentName: 'Summer Classic',
        organizer: 'USSSA',
        scheduledTime: '2026-06-15T14:00:00.000Z',
        opponentName: 'Away Eagles',
        teamScore: 5,
        opponentScore: 2,
        result: 'W',
        field: 'Field A',
      },
    ]
    vi.mocked(gameService.getTeamGameHistory).mockResolvedValue(history as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/teams/${HOME_TEAM_ID}/history`,
      headers: AUTH_HEADER,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].result).toBe('W')
    expect(gameService.getTeamGameHistory).toHaveBeenCalledWith(HOME_TEAM_ID)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/teams/${HOME_TEAM_ID}/history`,
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── GET /api/v1/games/:gameId ─────────────────────────────────────────────────

describe('GET /api/v1/games/:gameId', () => {
  it('returns 200 with game data (public route)', async () => {
    vi.mocked(gameService.getGame).mockResolvedValue(baseGameDb as any)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/${GAME_ID}`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(GAME_ID)
    expect(body.homeTeamName).toBe('Home Hawks')
    expect(body.awayTeamName).toBe('Away Eagles')
  })

  it('returns 404 when game does not exist', async () => {
    vi.mocked(gameService.getGame).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/games/${GAME_ID}`,
    })

    expect(response.statusCode).toBe(404)
  })
})

// ── PATCH /api/v1/games/:gameId/score ────────────────────────────────────────

describe('PATCH /api/v1/games/:gameId/score', () => {
  it('returns 200 with updated score when user is coach of home team', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      scorekeeperId: null,
    } as any)
    vi.mocked(gameService.updateScore).mockResolvedValue({
      ...baseGameDb,
      scoreHome: 3,
      scoreAway: 1,
      status: 'LIVE',
      tournamentId: TOURNAMENT_ID,
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      headers: AUTH_HEADER,
      payload: validScorePayload,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.scoreHome).toBe(3)
    expect(body.scoreAway).toBe(1)
    expect(gameService.updateScore).toHaveBeenCalledWith(
      GAME_ID,
      HOME_TEAM_ID,
      expect.objectContaining(validScorePayload),
    )
  })

  it('returns 400 for invalid score payload — missing required fields', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      scorekeeperId: null,
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      headers: AUTH_HEADER,
      payload: { scoreHome: 3 }, // missing scoreAway, inning, half
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.details).toBeDefined()
  })

  it('returns 403 when user is not a coach or scorekeeper', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      scorekeeperId: null,
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      headers: AUTH_HEADER,
      payload: validScorePayload,
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 404 when game does not exist', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(prisma.game.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      headers: AUTH_HEADER,
      payload: validScorePayload,
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      payload: validScorePayload,
    })

    expect(response.statusCode).toBe(401)
  })

  it('allows scorekeeper to update score', async () => {
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null) // no coaching membership
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      scorekeeperId: COACH_ID, // coach is the scorekeeper
    } as any)
    vi.mocked(gameService.updateScore).mockResolvedValue({
      ...baseGameDb,
      scoreHome: 2,
      scoreAway: 0,
      status: 'LIVE',
      tournamentId: TOURNAMENT_ID,
    } as any)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/games/${GAME_ID}/score`,
      headers: AUTH_HEADER,
      payload: { scoreHome: 2, scoreAway: 0, inning: 2, half: 'TOP' },
    })

    expect(response.statusCode).toBe(200)
  })
})

// ── POST /api/v1/games/:gameId/scorekeeper ───────────────────────────────────

describe('POST /api/v1/games/:gameId/scorekeeper', () => {
  it('returns 200 when coach assigns scorekeeper', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
    } as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(coachMembership as any)
    vi.mocked(gameService.assignScorekeeper).mockResolvedValue({
      ...baseGameDb,
      scorekeeperId: SCOREKEEPER_ID,
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/games/${GAME_ID}/scorekeeper`,
      headers: AUTH_HEADER,
      payload: { scorekeeperId: SCOREKEEPER_ID },
    })

    expect(response.statusCode).toBe(200)
    expect(gameService.assignScorekeeper).toHaveBeenCalledWith(GAME_ID, SCOREKEEPER_ID)
  })

  it('returns 400 when scorekeeperId is missing', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/games/${GAME_ID}/scorekeeper`,
      headers: AUTH_HEADER,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 403 when user is not a participating team coach', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue({
      ...baseGameDb,
      homeTeamId: HOME_TEAM_ID,
      awayTeamId: AWAY_TEAM_ID,
    } as any)
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/games/${GAME_ID}/scorekeeper`,
      headers: AUTH_HEADER,
      payload: { scorekeeperId: SCOREKEEPER_ID },
    })

    expect(response.statusCode).toBe(403)
  })

  it('returns 404 when game does not exist', async () => {
    vi.mocked(prisma.game.findUnique).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/games/${GAME_ID}/scorekeeper`,
      headers: AUTH_HEADER,
      payload: { scorekeeperId: SCOREKEEPER_ID },
    })

    expect(response.statusCode).toBe(404)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/games/${GAME_ID}/scorekeeper`,
      payload: { scorekeeperId: SCOREKEEPER_ID },
    })

    expect(response.statusCode).toBe(401)
  })
})

// ── POST /api/v1/games — create game ─────────────────────────────────────────

describe('POST /api/v1/games', () => {
  it('returns 201 with created game for authenticated user', async () => {
    vi.mocked(gameService.createGame).mockResolvedValue(baseGameDb as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/games',
      headers: AUTH_HEADER,
      payload: {
        tournamentId: TOURNAMENT_ID,
        homeTeamId: HOME_TEAM_ID,
        awayTeamId: AWAY_TEAM_ID,
        scheduledTime: '2026-06-15T14:00:00.000Z',
        field: 'Field A',
        round: 'Pool',
        pool: 'A',
        gameNumber: 1,
      },
    })

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(GAME_ID)
    expect(gameService.createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: TOURNAMENT_ID,
        homeTeamId: HOME_TEAM_ID,
        awayTeamId: AWAY_TEAM_ID,
      }),
    )
  })

  it('returns 400 when required fields are missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/games',
      headers: AUTH_HEADER,
      payload: {
        tournamentId: TOURNAMENT_ID,
        // missing homeTeamId, awayTeamId, scheduledTime
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/games',
      payload: {
        tournamentId: TOURNAMENT_ID,
        homeTeamId: HOME_TEAM_ID,
        awayTeamId: AWAY_TEAM_ID,
        scheduledTime: '2026-06-15T14:00:00.000Z',
      },
    })

    expect(response.statusCode).toBe(401)
  })
})
