import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gameService, GameError } from '../game.service.js'
import { prisma } from '@diamondhub/db'

const TOURNAMENT_ID = 'tourney-1'
const GAME_ID = 'game-1'
const HOME_TEAM_ID = 'home-1'
const AWAY_TEAM_ID = 'away-1'

const baseGame = {
  id: GAME_ID,
  tournamentId: TOURNAMENT_ID,
  homeTeamId: HOME_TEAM_ID,
  awayTeamId: AWAY_TEAM_ID,
  field: 'Field 1',
  round: 'Pool A',
  pool: 'A',
  gameNumber: 1,
  scheduledTime: new Date('2026-07-04T09:00:00Z'),
  actualStartTime: null,
  scoreHome: 0,
  scoreAway: 0,
  inning: 1,
  half: 'TOP',
  status: 'SCHEDULED',
  winnerId: null,
  inningsDetail: [],
  scorekeeperId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseTeam = { id: HOME_TEAM_ID, name: 'Thunder Hawks' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gameService', () => {
  describe('updateScore', () => {
    it('updates score and sets status to LIVE on first score update', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValue(baseGame as any)
      vi.mocked(prisma.game.update).mockResolvedValue({
        ...baseGame,
        scoreHome: 2,
        scoreAway: 1,
        status: 'LIVE',
        homeTeam: baseTeam,
        awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
      } as any)

      const result = await gameService.updateScore(GAME_ID, HOME_TEAM_ID, {
        inning: 1,
        half: 'TOP',
        scoreHome: 2,
        scoreAway: 1,
      })

      expect(prisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GAME_ID },
          data: expect.objectContaining({ scoreHome: 2, scoreAway: 1 }),
        }),
      )
      expect(result.scoreHome).toBe(2)
    })

    it('sets winnerId when status is FINAL and home team wins', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValue({ ...baseGame, status: 'LIVE' } as any)
      vi.mocked(prisma.game.update).mockResolvedValue({
        ...baseGame,
        scoreHome: 5,
        scoreAway: 2,
        status: 'FINAL',
        winnerId: HOME_TEAM_ID,
        homeTeam: baseTeam,
        awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
      } as any)

      await gameService.updateScore(GAME_ID, HOME_TEAM_ID, {
        inning: 7,
        half: 'BOTTOM',
        scoreHome: 5,
        scoreAway: 2,
        status: 'FINAL',
      })

      expect(prisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ winnerId: HOME_TEAM_ID }),
        }),
      )
    })

    it('throws FORBIDDEN (403) when team is not home or away', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValue(baseGame as any)

      await expect(
        gameService.updateScore(GAME_ID, 'unrelated-team', {
          inning: 1, half: 'TOP', scoreHome: 0, scoreAway: 1,
        }),
      ).rejects.toThrow(GameError)

      const err = await gameService
        .updateScore(GAME_ID, 'unrelated-team', { inning: 1, half: 'TOP', scoreHome: 0, scoreAway: 1 })
        .catch((e: GameError) => e)
      expect((err as GameError).statusCode).toBe(403)
    })

    it('throws NOT_FOUND (404) when game does not exist', async () => {
      vi.mocked(prisma.game.findUnique).mockResolvedValue(null)

      const err = await gameService
        .updateScore('bad-id', HOME_TEAM_ID, { inning: 1, half: 'TOP', scoreHome: 0, scoreAway: 0 })
        .catch((e: GameError) => e)
      expect((err as GameError).statusCode).toBe(404)
    })
  })

  describe('getBracket', () => {
    it('marks isUserTeam for home or away team match', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([
        {
          ...baseGame,
          homeTeam: { id: HOME_TEAM_ID, name: 'Thunder Hawks' },
          awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
        },
      ] as any)

      const bracket = await gameService.getBracket(TOURNAMENT_ID, HOME_TEAM_ID)
      expect(bracket[0]?.isUserTeam).toBe(true)
    })

    it('sets isUserTeam false when userTeamId not provided', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([
        {
          ...baseGame,
          homeTeam: { id: HOME_TEAM_ID, name: 'Thunder Hawks' },
          awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
        },
      ] as any)

      const bracket = await gameService.getBracket(TOURNAMENT_ID, undefined)
      expect(bracket[0]?.isUserTeam).toBe(false)
    })
  })

  describe('getStandings', () => {
    it('calculates W/L/T and run differential correctly', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([
        {
          ...baseGame,
          status: 'FINAL',
          scoreHome: 5, scoreAway: 2,
          winnerId: HOME_TEAM_ID,
          homeTeam: { id: HOME_TEAM_ID, name: 'Thunder Hawks' },
          awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
        },
      ] as any)

      const standings = await gameService.getStandings(TOURNAMENT_ID)
      const home = standings.find(s => s.teamId === HOME_TEAM_ID)!
      const away = standings.find(s => s.teamId === AWAY_TEAM_ID)!

      expect(home.wins).toBe(1)
      expect(home.losses).toBe(0)
      expect(home.runsScored).toBe(5)
      expect(home.runDifferential).toBe(3)

      expect(away.wins).toBe(0)
      expect(away.losses).toBe(1)
      expect(away.runDifferential).toBe(-3)
    })
  })

  describe('getTeamGameHistory', () => {
    it('returns W result when team won', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([
        {
          ...baseGame,
          status: 'FINAL',
          scoreHome: 4, scoreAway: 1,
          winnerId: HOME_TEAM_ID,
          homeTeam: { id: HOME_TEAM_ID, name: 'Thunder Hawks' },
          awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
          tournament: { id: TOURNAMENT_ID, name: 'Summer Classic', organizer: 'USSSA' },
        },
      ] as any)

      const history = await gameService.getTeamGameHistory(HOME_TEAM_ID)
      expect(history[0]?.result).toBe('W')
      expect(history[0]?.teamScore).toBe(4)
      expect(history[0]?.opponentScore).toBe(1)
      expect(history[0]?.opponentName).toBe('River Sharks')
    })

    it('returns L result when away team and lost', async () => {
      vi.mocked(prisma.game.findMany).mockResolvedValue([
        {
          ...baseGame,
          status: 'FINAL',
          scoreHome: 5, scoreAway: 2,
          winnerId: HOME_TEAM_ID,
          homeTeam: { id: HOME_TEAM_ID, name: 'Thunder Hawks' },
          awayTeam: { id: AWAY_TEAM_ID, name: 'River Sharks' },
          tournament: { id: TOURNAMENT_ID, name: 'Summer Classic', organizer: 'USSSA' },
        },
      ] as any)

      const history = await gameService.getTeamGameHistory(AWAY_TEAM_ID)
      expect(history[0]?.result).toBe('L')
      expect(history[0]?.teamScore).toBe(2) // away team's score
    })
  })

  describe('assignScorekeeper', () => {
    it('updates game scorekeeperId', async () => {
      vi.mocked(prisma.game.update).mockResolvedValue({ ...baseGame, scorekeeperId: 'user-1' } as any)
      await gameService.assignScorekeeper(GAME_ID, 'user-1')
      expect(prisma.game.update).toHaveBeenCalledWith({
        where: { id: GAME_ID },
        data: { scorekeeperId: 'user-1' },
      })
    })
  })
})
