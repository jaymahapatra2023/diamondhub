// E11 · Player Profiles & Stats — Service unit tests
// Mocks: prisma

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playerStatsService } from '../player-stats.service.js'
import { prisma } from '@diamondhub/db'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const TEAM_ID = 'team-1'
const TOURNAMENT_ID = 'tournament-1'
const NOW = new Date('2026-06-15T00:00:00.000Z')

const baseStatData = {
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

const mockGameStat = {
  id: 'stat-1',
  gameId: GAME_ID,
  playerId: PLAYER_ID,
  ...baseStatData,
  inningsPitched: 3,
  game: {
    tournament: {
      id: TOURNAMENT_ID,
      name: 'Summer Classic',
      startDate: NOW,
    },
  },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('playerStatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── upsertGameStat ────────────────────────────────────────────────────────

  describe('upsertGameStat', () => {
    it('upserts stats record for the given game and player', async () => {
      vi.mocked(prisma.playerGameStat.upsert).mockResolvedValue(mockGameStat as any)

      const result = await playerStatsService.upsertGameStat(GAME_ID, PLAYER_ID, baseStatData)

      expect(prisma.playerGameStat.upsert).toHaveBeenCalledWith({
        where: { gameId_playerId: { gameId: GAME_ID, playerId: PLAYER_ID } },
        update: { ...baseStatData },
        create: { gameId: GAME_ID, playerId: PLAYER_ID, ...baseStatData },
      })
      expect(result).toBeDefined()
    })
  })

  // ── getPlayerSeasonStats ──────────────────────────────────────────────────

  describe('getPlayerSeasonStats', () => {
    it('calculates batting average as hits divided by at-bats', async () => {
      // 2 hits in 4 at-bats = .500
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([mockGameStat] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.batting.battingAverage).toBe('.500')
    })

    it('returns .000 batting average when no at-bats recorded', async () => {
      const zeroAbStat = { ...mockGameStat, atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0 }
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([zeroAbStat] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.batting.battingAverage).toBe('.000')
    })

    it('calculates ERA as (earned runs * 9) / innings pitched', async () => {
      // 1 ER in 3 IP = (1 * 9) / 3 = 3.00
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([mockGameStat] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.pitching.era).toBe('3.00')
    })

    it('returns 0.00 ERA when no innings pitched', async () => {
      const zeroIpStat = { ...mockGameStat, inningsPitched: 0, earnedRuns: 0 }
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([zeroIpStat] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.pitching.era).toBe('0.00')
    })

    it('aggregates totals across multiple game stats', async () => {
      const stat2 = { ...mockGameStat, id: 'stat-2', atBats: 3, hits: 1, inningsPitched: 2, earnedRuns: 0 }
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([mockGameStat, stat2] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.games).toBe(2)
      // 2 + 1 hits / 4 + 3 AB = 3/7 ≈ .429
      expect(result.batting.atBats).toBe(7)
      expect(result.batting.hits).toBe(3)
      expect(result.batting.battingAverage).toBe('.429')
    })

    it('returns gameStats array with per-game breakdown', async () => {
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([mockGameStat] as any)

      const result = await playerStatsService.getPlayerSeasonStats(PLAYER_ID)

      expect(result.gameStats).toHaveLength(1)
      expect(result.gameStats[0]).toMatchObject({
        gameId: GAME_ID,
        tournamentName: 'Summer Classic',
        atBats: 4,
        hits: 2,
        rbi: 1,
      })
    })

    it('filters by season year when provided', async () => {
      vi.mocked(prisma.playerGameStat.findMany).mockResolvedValue([mockGameStat] as any)

      await playerStatsService.getPlayerSeasonStats(PLAYER_ID, 2026)

      expect(prisma.playerGameStat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            game: expect.objectContaining({
              tournament: expect.objectContaining({
                startDate: expect.objectContaining({
                  gte: new Date('2026-01-01'),
                  lte: new Date('2026-12-31'),
                }),
              }),
            }),
          }),
        }),
      )
    })
  })

  // ── getTeamRecord ─────────────────────────────────────────────────────────

  describe('getTeamRecord', () => {
    it('counts wins, losses, and ties correctly', async () => {
      const games = [
        {
          id: 'g-1',
          tournamentId: TOURNAMENT_ID,
          homeTeamId: TEAM_ID,
          awayTeamId: 'team-opp-1',
          winnerId: TEAM_ID, // win
          tournament: { name: 'Summer Classic', organizer: 'USSSA' },
        },
        {
          id: 'g-2',
          tournamentId: TOURNAMENT_ID,
          homeTeamId: 'team-opp-2',
          awayTeamId: TEAM_ID,
          winnerId: 'team-opp-2', // loss
          tournament: { name: 'Summer Classic', organizer: 'USSSA' },
        },
        {
          id: 'g-3',
          tournamentId: 'tournament-2',
          homeTeamId: TEAM_ID,
          awayTeamId: 'team-opp-3',
          winnerId: null, // tie
          tournament: { name: 'Fall Classic', organizer: 'USSSA' },
        },
      ]
      vi.mocked(prisma.game.findMany).mockResolvedValue(games as any)

      const result = await playerStatsService.getTeamRecord(TEAM_ID)

      expect(result.wins).toBe(1)
      expect(result.losses).toBe(1)
      expect(result.ties).toBe(1)
      expect(result.total).toBe(3)
      expect(result.teamId).toBe(TEAM_ID)
    })

    it('returns empty record when no final games', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([])

      const result = await playerStatsService.getTeamRecord(TEAM_ID)

      expect(result.wins).toBe(0)
      expect(result.losses).toBe(0)
      expect(result.ties).toBe(0)
      expect(result.total).toBe(0)
      expect(result.tournamentFinishes).toHaveLength(0)
    })

    it('deduplicates tournament finishes (one entry per tournament)', async () => {
      const games = [
        {
          id: 'g-1',
          tournamentId: TOURNAMENT_ID,
          homeTeamId: TEAM_ID,
          awayTeamId: 'opp-1',
          winnerId: TEAM_ID,
          tournament: { name: 'Summer Classic', organizer: 'USSSA' },
        },
        {
          id: 'g-2',
          tournamentId: TOURNAMENT_ID, // same tournament
          homeTeamId: TEAM_ID,
          awayTeamId: 'opp-2',
          winnerId: TEAM_ID,
          tournament: { name: 'Summer Classic', organizer: 'USSSA' },
        },
      ]
      vi.mocked(prisma.game.findMany).mockResolvedValue(games as any)

      const result = await playerStatsService.getTeamRecord(TEAM_ID)

      expect(result.tournamentFinishes).toHaveLength(1)
      expect(result.tournamentFinishes[0]!.tournamentName).toBe('Summer Classic')
    })
  })
})
