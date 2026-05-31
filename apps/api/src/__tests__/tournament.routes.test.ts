import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import type { FastifyInstance } from 'fastify'

// Mock tournament service
vi.mock('../services/tournament.service.js', () => ({
  tournamentService: {
    search: vi.fn(),
    getById: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
    getBookmarks: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
    getThisWeekend: vi.fn(),
    saveSearch: vi.fn(),
    getSearchHistory: vi.fn(),
  },
}))

// Mock token service (needed by authenticate middleware)
vi.mock('../services/token.service.js', () => ({
  tokenService: {
    verifyAccessToken: vi.fn(),
    generateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    generateRefreshToken: vi.fn().mockReturnValue({ token: 'mock-refresh', hash: 'mock-hash' }),
    hashToken: vi.fn().mockReturnValue('mock-hash'),
  },
}))

const { tournamentService } = await import('../services/tournament.service.js')
const { tokenService } = await import('../services/token.service.js')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockJwtPayload = {
  sub: 'user-1',
  email: 'coach@example.com',
  name: 'Test Coach',
  roles: [{ id: 'r1', role: 'COACH', teamId: null, isPrimary: true }],
  activeRole: null,
  iat: 0,
  exp: 9999999999,
  jti: '550e8400-e29b-41d4-a716-446655440001',
}

const mockSearchResult = {
  tournaments: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Tournament',
      organizer: 'PERFECT_GAME',
      sport: 'BASEBALL',
      ageDivisions: ['10U', '12U'],
      format: 'POOL_BRACKET',
      startDate: '2026-06-06T00:00:00.000Z',
      endDate: '2026-06-08T23:59:59.000Z',
      city: 'New York',
      state: 'NY',
      entryFee: 495,
      maxTeams: 16,
      currentTeams: 8,
      spotsRemaining: 8,
      status: 'OPEN',
      lat: 40.7484,
      lng: -73.9967,
      distanceMeters: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  hasMore: false,
}

const mockTournamentDetail = {
  ...mockSearchResult.tournaments[0],
  registrationDeadline: null,
  address: '123 Main St',
  zip: '10001',
  fieldsCount: 4,
  surface: 'TURF',
  hotelDealUrl: null,
  registrationUrl: null,
  umpireInfo: null,
  notes: null,
  isBookmarked: false,
  isFollowing: false,
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

// ── GET /api/v1/tournaments ────────────────────────────────────────────────────

describe('GET /api/v1/tournaments', () => {
  it('returns 200 with tournament list', async () => {
    vi.mocked(tournamentService.search).mockResolvedValue(mockSearchResult)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.tournaments).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.hasMore).toBe(false)
  })

  it('returns 200 with lat/lng and radiusMiles params', async () => {
    const resultWithDistance = {
      ...mockSearchResult,
      tournaments: [{ ...mockSearchResult.tournaments[0], distanceMeters: 1500.5 }],
    }
    vi.mocked(tournamentService.search).mockResolvedValue(resultWithDistance)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?lat=40.7&lng=-74.0&radiusMiles=50',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.tournaments[0].distanceMeters).toBe(1500.5)
  })

  it('returns 200 with zip param — geocoded to NYC lat/lng', async () => {
    vi.mocked(tournamentService.search).mockResolvedValue(mockSearchResult)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?zip=10001',
    })

    expect(response.statusCode).toBe(200)
    expect(tournamentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ zip: '10001' }),
      undefined,
    )
  })

  it('returns 200 filtered by sport', async () => {
    vi.mocked(tournamentService.search).mockResolvedValue(mockSearchResult)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?sport=BASEBALL',
    })

    expect(response.statusCode).toBe(200)
    expect(tournamentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'BASEBALL' }),
      undefined,
    )
  })

  it('returns 200 filtered by ageDivisions', async () => {
    vi.mocked(tournamentService.search).mockResolvedValue(mockSearchResult)

    // Single ageDivisions value is normalized to array by the handler
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?ageDivisions=10U',
    })

    expect(response.statusCode).toBe(200)
    expect(tournamentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ ageDivisions: ['10U'] }),
      undefined,
    )
  })

  it('returns 400 for invalid search params (bad sport)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?sport=INVALID_SPORT',
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body)
    expect(body.statusCode).toBe(400)
    expect(body.details).toBeDefined()
  })

  it('saves search history for authenticated user with location', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.search).mockResolvedValue(mockSearchResult)
    vi.mocked(tournamentService.saveSearch).mockResolvedValue(undefined)

    await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments?zip=10001',
      headers: { Authorization: 'Bearer valid-token' },
    })

    // saveSearch is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10))
    expect(tournamentService.saveSearch).toHaveBeenCalledWith('user-1', expect.any(Object))
  })
})

// ── GET /api/v1/tournaments/this-weekend ──────────────────────────────────────

describe('GET /api/v1/tournaments/this-weekend', () => {
  it('returns 200 with lat/lng params', async () => {
    vi.mocked(tournamentService.getThisWeekend).mockResolvedValue(mockSearchResult)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/this-weekend?lat=40.7&lng=-74.0',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.tournaments).toBeDefined()
    expect(tournamentService.getThisWeekend).toHaveBeenCalledWith(40.7, -74.0, undefined)
  })

  it('returns 400 when lat/lng are missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/this-weekend',
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when only lat is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/this-weekend?lat=40.7',
    })

    expect(response.statusCode).toBe(400)
  })
})

// ── GET /api/v1/tournaments/bookmarks ────────────────────────────────────────

describe('GET /api/v1/tournaments/bookmarks', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/bookmarks',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with auth and bookmark list', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getBookmarks).mockResolvedValue([
      {
        ...mockSearchResult.tournaments[0],
        bookmarkedAt: '2026-05-01T00:00:00.000Z',
      } as any,
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/bookmarks',
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.bookmarks).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(tournamentService.getBookmarks).toHaveBeenCalledWith('user-1')
  })
})

// ── GET /api/v1/tournaments/search-history ───────────────────────────────────

describe('GET /api/v1/tournaments/search-history', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/search-history',
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with auth and search history', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getSearchHistory).mockResolvedValue([
      { zip: '10001', savedAt: '2026-05-01T00:00:00.000Z' },
      { zip: '10002', savedAt: '2026-05-02T00:00:00.000Z' },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/search-history',
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.history).toHaveLength(2)
    expect(body.total).toBe(2)
  })
})

// ── GET /api/v1/tournaments/:id ───────────────────────────────────────────────

describe('GET /api/v1/tournaments/:id', () => {
  it('returns 200 for existing tournament', async () => {
    vi.mocked(tournamentService.getById).mockResolvedValue(mockTournamentDetail)

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}`,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.id).toBe(mockTournamentDetail.id)
    expect(body.name).toBe('Test Tournament')
    expect(body.isBookmarked).toBe(false)
  })

  it('returns 404 for unknown tournament id', async () => {
    vi.mocked(tournamentService.getById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tournaments/00000000-0000-0000-0000-000000000000',
    })

    expect(response.statusCode).toBe(404)
    const body = JSON.parse(response.body)
    expect(body.error).toBe('Not Found')
  })

  it('passes userId to getById when authenticated', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getById).mockResolvedValue({
      ...mockTournamentDetail,
      isBookmarked: true,
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    expect(tournamentService.getById).toHaveBeenCalledWith(mockTournamentDetail.id, 'user-1')
    const body = JSON.parse(response.body)
    expect(body.isBookmarked).toBe(true)
  })
})

// ── POST /api/v1/tournaments/:id/bookmark ────────────────────────────────────

describe('POST /api/v1/tournaments/:id/bookmark', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/bookmark`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with auth', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getById).mockResolvedValue(mockTournamentDetail)
    vi.mocked(tournamentService.bookmark).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/bookmark`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('bookmark')
  })

  it('returns 404 when tournament does not exist', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tournaments/00000000-0000-0000-0000-000000000000/bookmark',
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(404)
  })
})

// ── DELETE /api/v1/tournaments/:id/bookmark ──────────────────────────────────

describe('DELETE /api/v1/tournaments/:id/bookmark', () => {
  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/bookmark`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 200 with auth', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.unbookmark).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/bookmark`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Bookmark removed')
  })
})

// ── POST /api/v1/tournaments/:id/follow ──────────────────────────────────────

describe('POST /api/v1/tournaments/:id/follow', () => {
  it('returns 200 with guestToken (no auth needed)', async () => {
    vi.mocked(tournamentService.getById).mockResolvedValue(mockTournamentDetail)
    vi.mocked(tournamentService.follow).mockResolvedValue({} as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/follow`,
      payload: { guestToken: 'guest-token-abc' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Following')
  })

  it('returns 200 with authenticated user (no guestToken needed)', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.getById).mockResolvedValue(mockTournamentDetail)
    vi.mocked(tournamentService.follow).mockResolvedValue({} as any)

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/follow`,
      headers: { Authorization: 'Bearer valid-token' },
      payload: {},
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 400 when no auth and no guestToken', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/follow`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 404 when tournament does not exist', async () => {
    vi.mocked(tournamentService.getById).mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/tournaments/00000000-0000-0000-0000-000000000000/follow',
      payload: { guestToken: 'guest-abc' },
    })

    expect(response.statusCode).toBe(404)
  })
})

// ── DELETE /api/v1/tournaments/:id/follow ────────────────────────────────────

describe('DELETE /api/v1/tournaments/:id/follow', () => {
  it('returns 200 with guestToken', async () => {
    vi.mocked(tournamentService.unfollow).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/follow`,
      payload: { guestToken: 'guest-token-abc' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.message).toContain('Unfollow')
  })

  it('returns 200 with authenticated user', async () => {
    vi.mocked(tokenService.verifyAccessToken).mockResolvedValue(mockJwtPayload)
    vi.mocked(tournamentService.unfollow).mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tournaments/${mockTournamentDetail.id}/follow`,
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(response.statusCode).toBe(200)
  })
})
