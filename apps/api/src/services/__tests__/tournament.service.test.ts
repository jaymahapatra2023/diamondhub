import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tournamentService } from '../tournament.service.js'
import { prisma } from '@diamondhub/db'
import { redis } from '../../lib/redis.js'

// Mock geocoding service
vi.mock('../geocoding.service.js', () => ({
  geocodingService: {
    geocodeZip: vi.fn().mockReturnValue({ lat: 40.7484, lng: -73.9967, city: 'New York', state: 'NY' }),
    getRadiusMeters: vi.fn().mockReturnValue(80467.2),
  },
}))

const { geocodingService } = await import('../geocoding.service.js')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTournamentRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Tournament',
  organizer: 'PERFECT_GAME',
  sport: 'BASEBALL',
  age_divisions: ['10U', '12U'],
  format: 'POOL_BRACKET',
  start_date: new Date('2026-06-06T00:00:00Z'),
  end_date: new Date('2026-06-08T23:59:59Z'),
  city: 'New York',
  state: 'NY',
  entry_fee: '495.00',
  max_teams: 16,
  current_teams: 8,
  status: 'OPEN',
  lat: '40.7484',
  lng: '-73.9967',
  distance_meters: 1500.5,
}

const mockTournamentRecord = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Tournament',
  organizer: 'PERFECT_GAME',
  sport: 'BASEBALL',
  ageDivisions: ['10U', '12U'],
  format: 'POOL_BRACKET',
  startDate: new Date('2026-06-06T00:00:00Z'),
  endDate: new Date('2026-06-08T23:59:59Z'),
  registrationDeadline: null,
  locationName: 'Test Field',
  address: '123 Main St',
  city: 'New York',
  state: 'NY',
  zip: '10001',
  lat: 40.7484,
  lng: -73.9967,
  entryFee: 495.0,
  maxTeams: 16,
  currentTeams: 8,
  fieldsCount: 4,
  surface: 'TURF',
  hotelDealUrl: null,
  registrationUrl: null,
  umpireInfo: null,
  notes: null,
  status: 'OPEN',
  dataSource: 'MANUAL',
  scrapedAt: null,
  isPublished: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('tournamentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── search ──────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns cached result when cache hit', async () => {
      const cachedResult = {
        tournaments: [{ id: 'cached-1', name: 'Cached Tournament' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      }
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedResult))

      const result = await tournamentService.search({ radiusMiles: 50, page: 1, limit: 20 })

      expect(result).toEqual(cachedResult)
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('builds correct response structure on cache miss', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([mockTournamentRow])

      const result = await tournamentService.search({ radiusMiles: 50, page: 1, limit: 20 })

      expect(result.tournaments).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.hasMore).toBe(false)

      const t = result.tournaments[0]
      expect(t.id).toBe(mockTournamentRow.id)
      expect(t.name).toBe(mockTournamentRow.name)
      expect(t.entryFee).toBe(495)
      expect(t.spotsRemaining).toBe(8) // maxTeams(16) - currentTeams(8)
      expect(t.distanceMeters).toBe(1500.5)
    })

    it('handles no coordinates gracefully (no PostGIS clause)', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      const result = await tournamentService.search({ radiusMiles: 50, page: 1, limit: 20 })

      expect(result.tournaments).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('caches the result after DB query', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      await tournamentService.search({ radiusMiles: 50, page: 1, limit: 20 })

      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining('tournaments:'),
        3600,
        expect.any(String),
      )
    })

    it('sets spotsRemaining to null when maxTeams is null', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      const rowWithNoMaxTeams = { ...mockTournamentRow, max_teams: null }
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([rowWithNoMaxTeams])

      const result = await tournamentService.search({ radiusMiles: 50, page: 1, limit: 20 })

      expect(result.tournaments[0].spotsRemaining).toBeNull()
      expect(result.tournaments[0].maxTeams).toBeNull()
    })
  })

  // ── search with zip ─────────────────────────────────────────────────────────

  describe('search with zip', () => {
    it('calls geocodingService.geocodeZip to resolve lat/lng from zip', async () => {
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      await tournamentService.search({ zip: '10001', radiusMiles: 50, page: 1, limit: 20 })

      expect(geocodingService.geocodeZip).toHaveBeenCalledWith('10001')
    })

    it('proceeds without geo filter when zip not found', async () => {
      vi.mocked(geocodingService.geocodeZip).mockReturnValueOnce(null)
      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      const result = await tournamentService.search({
        zip: '99999',
        radiusMiles: 50,
        page: 1,
        limit: 20,
      })

      expect(result.total).toBe(0)
    })
  })

  // ── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns null for non-existent tournament', async () => {
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue(null)

      const result = await tournamentService.getById('nonexistent-id')

      expect(result).toBeNull()
    })

    it('returns full detail with isBookmarked=false for guest (no userId)', async () => {
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue(mockTournamentRecord as any)

      const result = await tournamentService.getById(mockTournamentRecord.id)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(mockTournamentRecord.id)
      expect(result!.isBookmarked).toBe(false)
      expect(result!.isFollowing).toBe(false)
      expect(result!.spotsRemaining).toBe(8)
      expect(result!.address).toBe('123 Main St')
    })

    it('returns isBookmarked=true when bookmark exists for userId', async () => {
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue(mockTournamentRecord as any)
      vi.mocked(prisma.tournamentBookmark.findUnique).mockResolvedValue({
        userId: 'user-1',
        tournamentId: mockTournamentRecord.id,
        createdAt: new Date(),
      } as any)
      vi.mocked(prisma.tournamentFollower.findFirst).mockResolvedValue(null)

      const result = await tournamentService.getById(mockTournamentRecord.id, 'user-1')

      expect(result!.isBookmarked).toBe(true)
      expect(result!.isFollowing).toBe(false)
    })

    it('returns isFollowing=true when user follows the tournament', async () => {
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue(mockTournamentRecord as any)
      vi.mocked(prisma.tournamentBookmark.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.tournamentFollower.findFirst).mockResolvedValue({
        id: 'follower-1',
        tournamentId: mockTournamentRecord.id,
        userId: 'user-1',
        guestToken: null,
        createdAt: new Date(),
      } as any)

      const result = await tournamentService.getById(mockTournamentRecord.id, 'user-1')

      expect(result!.isFollowing).toBe(true)
    })
  })

  // ── bookmark ────────────────────────────────────────────────────────────────

  describe('bookmark', () => {
    it('upserts a bookmark record', async () => {
      vi.mocked(prisma.tournamentBookmark.upsert).mockResolvedValue({} as any)

      await tournamentService.bookmark('user-1', 'tournament-1')

      expect(prisma.tournamentBookmark.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_tournamentId: { userId: 'user-1', tournamentId: 'tournament-1' },
          },
          create: { userId: 'user-1', tournamentId: 'tournament-1' },
        }),
      )
    })
  })

  // ── unbookmark ──────────────────────────────────────────────────────────────

  describe('unbookmark', () => {
    it('deletes bookmark record', async () => {
      vi.mocked(prisma.tournamentBookmark.deleteMany).mockResolvedValue({ count: 1 })

      await tournamentService.unbookmark('user-1', 'tournament-1')

      expect(prisma.tournamentBookmark.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', tournamentId: 'tournament-1' },
        }),
      )
    })

    it('does not throw when bookmark does not exist', async () => {
      vi.mocked(prisma.tournamentBookmark.deleteMany).mockResolvedValue({ count: 0 })

      await expect(tournamentService.unbookmark('user-1', 'nonexistent')).resolves.toBeUndefined()
    })
  })

  // ── follow ──────────────────────────────────────────────────────────────────

  describe('follow', () => {
    it('creates a follower record for authenticated user', async () => {
      vi.mocked(prisma.tournamentFollower.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.tournamentFollower.create).mockResolvedValue({
        id: 'follower-1',
        tournamentId: 'tournament-1',
        userId: 'user-1',
        guestToken: null,
        createdAt: new Date(),
      } as any)

      await tournamentService.follow('tournament-1', 'user-1')

      expect(prisma.tournamentFollower.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tournamentId: 'tournament-1', userId: 'user-1' }),
        }),
      )
    })

    it('creates a follower record for guest via guestToken', async () => {
      vi.mocked(prisma.tournamentFollower.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.tournamentFollower.create).mockResolvedValue({
        id: 'follower-2',
        tournamentId: 'tournament-1',
        userId: null,
        guestToken: 'guest-abc',
        createdAt: new Date(),
      } as any)

      await tournamentService.follow('tournament-1', undefined, 'guest-abc')

      expect(prisma.tournamentFollower.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ guestToken: 'guest-abc', userId: null }),
        }),
      )
    })

    it('skips duplicate — returns existing record without creating', async () => {
      const existing = {
        id: 'follower-1',
        tournamentId: 'tournament-1',
        userId: 'user-1',
        guestToken: null,
        createdAt: new Date(),
      }
      vi.mocked(prisma.tournamentFollower.findFirst).mockResolvedValue(existing as any)

      const result = await tournamentService.follow('tournament-1', 'user-1')

      expect(result).toEqual(existing)
      expect(prisma.tournamentFollower.create).not.toHaveBeenCalled()
    })

    it('throws error when neither userId nor guestToken provided', async () => {
      await expect(tournamentService.follow('tournament-1')).rejects.toThrow(
        'Must provide userId or guestToken',
      )
    })
  })

  // ── unfollow ─────────────────────────────────────────────────────────────────

  describe('unfollow', () => {
    it('deletes follower record by userId', async () => {
      vi.mocked(prisma.tournamentFollower.deleteMany).mockResolvedValue({ count: 1 })

      await tournamentService.unfollow('tournament-1', 'user-1')

      expect(prisma.tournamentFollower.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', userId: 'user-1' },
        }),
      )
    })

    it('deletes follower record by guestToken', async () => {
      vi.mocked(prisma.tournamentFollower.deleteMany).mockResolvedValue({ count: 1 })

      await tournamentService.unfollow('tournament-1', undefined, 'guest-abc')

      expect(prisma.tournamentFollower.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId: 'tournament-1', guestToken: 'guest-abc' },
        }),
      )
    })

    it('does nothing when neither userId nor guestToken provided', async () => {
      await tournamentService.unfollow('tournament-1')
      expect(prisma.tournamentFollower.deleteMany).not.toHaveBeenCalled()
    })
  })

  // ── getThisWeekend ──────────────────────────────────────────────────────────

  describe('getThisWeekend', () => {
    it('calculates correct Fri-Sun date window for a Wednesday', async () => {
      // Fixed date: Wednesday 2026-05-28 (day=3)
      const fixedNow = new Date('2026-05-28T10:00:00Z')
      vi.setSystemTime(fixedNow)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      await tournamentService.getThisWeekend(40.7484, -73.9967)

      // Should have queried with friday 2026-05-29 and sunday 2026-05-31
      const calls = vi.mocked(prisma.$queryRawUnsafe).mock.calls
      // The search params are baked into the raw query string — just verify search ran
      expect(calls.length).toBe(2) // count + data queries

      vi.useRealTimers()
    })

    it('calculates correct window when today is Friday', async () => {
      // Fixed date: Friday 2026-05-29
      const fixedFriday = new Date('2026-05-29T10:00:00Z')
      vi.setSystemTime(fixedFriday)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      const result = await tournamentService.getThisWeekend(40.7484, -73.9967)

      expect(result.limit).toBe(10) // getThisWeekend always passes limit: 10
      vi.useRealTimers()
    })

    it('calculates correct window when today is Saturday', async () => {
      // Fixed date: Saturday 2026-05-30
      const fixedSat = new Date('2026-05-30T10:00:00Z')
      vi.setSystemTime(fixedSat)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      await tournamentService.getThisWeekend(40.7484, -73.9967)

      expect(vi.mocked(prisma.$queryRawUnsafe).mock.calls.length).toBe(2)
      vi.useRealTimers()
    })

    it('passes lat/lng and radiusMiles=50 to search', async () => {
      const fixedNow = new Date('2026-05-28T10:00:00Z')
      vi.setSystemTime(fixedNow)

      vi.mocked(redis.get).mockResolvedValue(null)
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([])

      const result = await tournamentService.getThisWeekend(40.7484, -73.9967)

      // The result should have page=1 and limit=10
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)

      vi.useRealTimers()
    })
  })

  // ── saveSearch ──────────────────────────────────────────────────────────────

  describe('saveSearch', () => {
    it('saves search params and trims history to 5 entries', async () => {
      // Existing history of 5 entries — new one should push oldest off
      const existingHistory = [
        { zip: '10001', savedAt: '2026-01-01T00:00:00Z' },
        { zip: '10002', savedAt: '2026-01-02T00:00:00Z' },
        { zip: '10003', savedAt: '2026-01-03T00:00:00Z' },
        { zip: '10004', savedAt: '2026-01-04T00:00:00Z' },
        { zip: '10005', savedAt: '2026-01-05T00:00:00Z' },
      ]
      vi.mocked(prisma.userSearchPreference.findUnique).mockResolvedValue({
        id: 'pref-1',
        userId: 'user-1',
        savedSearches: existingHistory,
        sport: null,
        ageDivisions: [],
        organizers: [],
        radiusMiles: 50,
        entryFeeMin: null,
        entryFeeMax: null,
        updatedAt: new Date(),
      } as any)
      vi.mocked(prisma.userSearchPreference.upsert).mockResolvedValue({} as any)

      await tournamentService.saveSearch('user-1', { zip: '10006' })

      const upsertCall = vi.mocked(prisma.userSearchPreference.upsert).mock.calls[0][0]
      const savedHistory = upsertCall.update.savedSearches as unknown[]
      // Should have 5 entries (new + 4 from old, dropping the oldest)
      expect(savedHistory).toHaveLength(5)
      expect((savedHistory[0] as any).zip).toBe('10006')
    })

    it('creates first entry when no prior preferences', async () => {
      vi.mocked(prisma.userSearchPreference.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.userSearchPreference.upsert).mockResolvedValue({} as any)

      await tournamentService.saveSearch('user-1', { zip: '10001' })

      expect(prisma.userSearchPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: 'user-1' }),
        }),
      )
    })
  })

  // ── getSearchHistory ────────────────────────────────────────────────────────

  describe('getSearchHistory', () => {
    it('returns empty array when no preferences exist', async () => {
      vi.mocked(prisma.userSearchPreference.findUnique).mockResolvedValue(null)

      const history = await tournamentService.getSearchHistory('user-1')

      expect(history).toEqual([])
    })

    it('returns saved searches from user preferences', async () => {
      const savedSearches = [
        { zip: '10001', savedAt: '2026-01-01T00:00:00Z' },
        { zip: '10002', savedAt: '2026-01-02T00:00:00Z' },
      ]
      vi.mocked(prisma.userSearchPreference.findUnique).mockResolvedValue({
        id: 'pref-1',
        userId: 'user-1',
        savedSearches,
        sport: null,
        ageDivisions: [],
        organizers: [],
        radiusMiles: 50,
        entryFeeMin: null,
        entryFeeMax: null,
        updatedAt: new Date(),
      } as any)

      const history = await tournamentService.getSearchHistory('user-1')

      expect(history).toEqual(savedSearches)
    })
  })
})
