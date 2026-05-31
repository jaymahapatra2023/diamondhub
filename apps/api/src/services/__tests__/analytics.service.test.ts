// E14 · Coach Analytics — Service unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyticsService } from '../analytics.service.js'
import { prisma } from '@diamondhub/db'

const TEAM_ID = 'team-1'
const USER_1 = 'user-1'
const USER_2 = 'user-2'
const EVENT_1 = 'event-1'
const EVENT_2 = 'event-2'
const GAME_1 = 'game-1'
const GAME_2 = 'game-2'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getSeasonCosts ─────────────────────────────────────────────────────────────

describe('analyticsService.getSeasonCosts', () => {
  it('sums paid registration amounts and calculates per-player cost', async () => {
    vi.mocked(prisma.tournamentRegistration.findMany).mockResolvedValue([
      {
        entryFeePaid: 250,
        tournament: { name: 'Summer Classic', startDate: new Date('2026-06-01') },
      },
      {
        entryFeePaid: 300,
        tournament: { name: 'Fall Invitational', startDate: new Date('2026-09-15') },
      },
    ] as any)
    vi.mocked(prisma.teamMember.count).mockResolvedValue(5)

    const result = await analyticsService.getSeasonCosts(TEAM_ID)

    expect(result.totalSpent).toBe(550)
    expect(result.perPlayerCost).toBe(110)
    expect(result.registrations).toHaveLength(2)
    expect(result.registrations[0]!.tournamentName).toBe('Summer Classic')
    expect(result.registrations[0]!.amount).toBe(250)
  })

  it('returns 0 perPlayerCost when no active players on roster', async () => {
    vi.mocked(prisma.tournamentRegistration.findMany).mockResolvedValue([
      {
        entryFeePaid: 400,
        tournament: { name: 'Spring Cup', startDate: new Date('2026-04-01') },
      },
    ] as any)
    vi.mocked(prisma.teamMember.count).mockResolvedValue(0)

    const result = await analyticsService.getSeasonCosts(TEAM_ID)

    expect(result.totalSpent).toBe(400)
    expect(result.perPlayerCost).toBe(0)
  })

  it('returns zero totals and empty registrations when no paid registrations', async () => {
    vi.mocked(prisma.tournamentRegistration.findMany).mockResolvedValue([])
    vi.mocked(prisma.teamMember.count).mockResolvedValue(10)

    const result = await analyticsService.getSeasonCosts(TEAM_ID)

    expect(result.totalSpent).toBe(0)
    expect(result.perPlayerCost).toBe(0)
    expect(result.registrations).toHaveLength(0)
  })
})

// ── getAttendanceRates ─────────────────────────────────────────────────────────

describe('analyticsService.getAttendanceRates', () => {
  it('calculates attendance rate as attended/total', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { userId: USER_1, user: { name: 'Alice' } },
      { userId: USER_2, user: { name: 'Bob' } },
    ] as any)
    vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([
      { id: EVENT_1 },
      { id: EVENT_2 },
    ] as any)
    // Alice attended 2/2, Bob attended 1/2
    vi.mocked(prisma.eventRsvp.count)
      .mockResolvedValueOnce(2) // Alice
      .mockResolvedValueOnce(1) // Bob

    const result = await analyticsService.getAttendanceRates(TEAM_ID)

    expect(result).toHaveLength(2)
    const alice = result.find((r) => r.userId === USER_1)!
    const bob = result.find((r) => r.userId === USER_2)!

    expect(alice.attended).toBe(2)
    expect(alice.total).toBe(2)
    expect(alice.rate).toBe(100)
    expect(alice.belowThreshold).toBe(false)

    expect(bob.attended).toBe(1)
    expect(bob.total).toBe(2)
    expect(bob.rate).toBe(50)
    expect(bob.belowThreshold).toBe(true)
  })

  it('flags belowThreshold true when attendance < 70%', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { userId: USER_1, user: { name: 'Charlie' } },
    ] as any)
    vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([
      { id: EVENT_1 }, { id: EVENT_2 }, { id: 'event-3' }, { id: 'event-4' }, { id: 'event-5' },
      { id: 'event-6' }, { id: 'event-7' }, { id: 'event-8' }, { id: 'event-9' }, { id: 'event-10' },
    ] as any)
    // 6/10 = 60% < 70%
    vi.mocked(prisma.eventRsvp.count).mockResolvedValueOnce(6)

    const [record] = await analyticsService.getAttendanceRates(TEAM_ID)
    expect(record!.rate).toBe(60)
    expect(record!.belowThreshold).toBe(true)
  })

  it('returns empty array when no events', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { userId: USER_1, user: { name: 'Alice' } },
    ] as any)
    vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])

    const result = await analyticsService.getAttendanceRates(TEAM_ID)
    expect(result).toHaveLength(0)
  })
})

// ── getTournamentWinRates ──────────────────────────────────────────────────────

describe('analyticsService.getTournamentWinRates', () => {
  it('groups games by organizer and calculates win rate', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValue([
      {
        id: GAME_1,
        homeTeamId: TEAM_ID,
        awayTeamId: 'opp-1',
        winnerId: TEAM_ID, // win
        tournament: { organizer: 'USSSA' },
      },
      {
        id: GAME_2,
        homeTeamId: TEAM_ID,
        awayTeamId: 'opp-2',
        winnerId: 'opp-2', // loss
        tournament: { organizer: 'USSSA' },
      },
      {
        id: 'game-3',
        homeTeamId: 'opp-3',
        awayTeamId: TEAM_ID,
        winnerId: TEAM_ID, // win
        tournament: { organizer: 'PGF' },
      },
    ] as any)

    const result = await analyticsService.getTournamentWinRates(TEAM_ID)

    const usssa = result.find((r) => r.organizer === 'USSSA')!
    const pgf = result.find((r) => r.organizer === 'PGF')!

    expect(usssa.wins).toBe(1)
    expect(usssa.total).toBe(2)
    expect(usssa.winRate).toBe(50)

    expect(pgf.wins).toBe(1)
    expect(pgf.total).toBe(1)
    expect(pgf.winRate).toBe(100)
  })

  it('returns empty array when no completed games', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValue([])

    const result = await analyticsService.getTournamentWinRates(TEAM_ID)
    expect(result).toHaveLength(0)
  })

  it('counts zero wins when team lost all games', async () => {
    vi.mocked(prisma.game.findMany).mockResolvedValue([
      {
        id: GAME_1,
        homeTeamId: TEAM_ID,
        awayTeamId: 'opp-1',
        winnerId: 'opp-1',
        tournament: { organizer: 'Perfect Game' },
      },
      {
        id: GAME_2,
        homeTeamId: TEAM_ID,
        awayTeamId: 'opp-2',
        winnerId: 'opp-2',
        tournament: { organizer: 'Perfect Game' },
      },
    ] as any)

    const [record] = await analyticsService.getTournamentWinRates(TEAM_ID)
    expect(record!.wins).toBe(0)
    expect(record!.total).toBe(2)
    expect(record!.winRate).toBe(0)
  })
})
