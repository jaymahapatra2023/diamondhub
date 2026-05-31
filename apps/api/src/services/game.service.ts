// E9 · Live Scoring & Brackets — Service
// P3: WebSocket primary delivery, REST polling fallback (30s)
// P4: Socket.io emits happen AFTER DB write (in route handler)

import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'
import type { UpdateScoreRequest } from '@diamondhub/contracts'

export const gameService = {

  // E9-S1: Update score — stores in DB, Socket.io emits after return
  async updateScore(gameId: string, teamId: string, data: UpdateScoreRequest) {
    const game = await prisma.game.findUnique({ where: { id: gameId } })
    if (!game) throw new GameError('NOT_FOUND', 404)

    // Verify team is home or away
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) {
      throw new GameError('FORBIDDEN', 403)
    }

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: {
        scoreHome: data.scoreHome,
        scoreAway: data.scoreAway,
        inning: data.inning,
        half: data.half,
        status: data.status ?? (game.status === 'SCHEDULED' ? 'LIVE' : game.status),
        inningsDetail: data.inningsDetail as any ?? game.inningsDetail,
        ...(data.status === 'FINAL' && {
          winnerId: data.scoreHome > data.scoreAway ? game.homeTeamId : game.awayTeamId,
        }),
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    })

    logger.info({ gameId, scoreHome: data.scoreHome, scoreAway: data.scoreAway }, 'Score updated')
    return updated
  },

  // E9-S2: Get games for a tournament
  async getTournamentGames(tournamentId: string) {
    return prisma.game.findMany({
      where: { tournamentId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: [{ round: 'asc' }, { pool: 'asc' }, { scheduledTime: 'asc' }],
    })
  },

  // E9-S2: Get single game
  async getGame(gameId: string) {
    return prisma.game.findUnique({
      where: { id: gameId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        tournament: { select: { id: true, name: true, organizer: true } },
      },
    })
  },

  // Create a game (tournament organizer/admin)
  async createGame(data: {
    tournamentId: string
    homeTeamId: string
    awayTeamId: string
    field?: string
    round?: string
    pool?: string
    gameNumber?: number
    scheduledTime: Date
  }) {
    return prisma.game.create({ data })
  },

  // E9-S3: Get bracket (all games grouped by round)
  async getBracket(tournamentId: string, userTeamId?: string) {
    const games = await prisma.game.findMany({
      where: { tournamentId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: [{ round: 'asc' }, { gameNumber: 'asc' }, { scheduledTime: 'asc' }],
    })

    return games.map(g => ({
      id: g.id,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeTeamName: g.homeTeam.name,
      awayTeamName: g.awayTeam.name,
      field: g.field,
      round: g.round,
      pool: g.pool,
      gameNumber: g.gameNumber,
      scheduledTime: g.scheduledTime.toISOString(),
      actualStartTime: g.actualStartTime?.toISOString() ?? null,
      scoreHome: g.scoreHome,
      scoreAway: g.scoreAway,
      inning: g.inning,
      half: g.half,
      status: g.status,
      winnerId: g.winnerId,
      inningsDetail: g.inningsDetail,
      isUserTeam: userTeamId ? (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId) : false,
      updatedAt: g.updatedAt.toISOString(),
    }))
  },

  // E9-S4: Pool play standings
  async getStandings(tournamentId: string, pool?: string) {
    const games = await prisma.game.findMany({
      where: {
        tournamentId,
        status: 'FINAL',
        ...(pool && { pool }),
      },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    })

    const standings = new Map<string, {
      teamId: string; teamName: string; wins: number; losses: number; ties: number;
      runsScored: number; runsAllowed: number; pool: string | null
    }>()

    for (const game of games) {
      for (const [teamId, teamName, runsFor, runsAgainst] of [
        [game.homeTeamId, game.homeTeam.name, game.scoreHome, game.scoreAway],
        [game.awayTeamId, game.awayTeam.name, game.scoreAway, game.scoreHome],
      ] as [string, string, number, number][]) {
        const entry = standings.get(teamId) ?? {
          teamId, teamName, wins: 0, losses: 0, ties: 0, runsScored: 0, runsAllowed: 0, pool: game.pool,
        }
        entry.runsScored += runsFor
        entry.runsAllowed += runsAgainst
        if (game.winnerId === teamId) entry.wins++
        else if (game.winnerId === null) entry.ties++
        else entry.losses++
        standings.set(teamId, entry)
      }
    }

    return Array.from(standings.values())
      .map(s => ({
        ...s,
        runDifferential: s.runsScored - s.runsAllowed,
        isUserTeam: false,
      }))
      .sort((a, b) => b.wins - a.wins || b.runDifferential - a.runDifferential)
  },

  // E9-S5: Game history for a team
  async getTeamGameHistory(teamId: string) {
    const games = await prisma.game.findMany({
      where: {
        status: 'FINAL',
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        tournament: { select: { id: true, name: true, organizer: true } },
      },
      orderBy: { scheduledTime: 'desc' },
    })

    return games.map(g => {
      const isHome = g.homeTeamId === teamId
      const teamScore = isHome ? g.scoreHome : g.scoreAway
      const opponentScore = isHome ? g.scoreAway : g.scoreHome
      const opponentName = isHome ? g.awayTeam.name : g.homeTeam.name
      const result = g.winnerId === teamId ? 'W' : g.winnerId === null ? 'T' : 'L'
      return {
        gameId: g.id,
        tournamentId: g.tournamentId,
        tournamentName: g.tournament.name,
        organizer: g.tournament.organizer,
        scheduledTime: g.scheduledTime.toISOString(),
        opponentName,
        teamScore,
        opponentScore,
        result,
        field: g.field,
      }
    })
  },

  // Assign scorekeeper
  async assignScorekeeper(gameId: string, scorekeeperId: string) {
    return prisma.game.update({
      where: { id: gameId },
      data: { scorekeeperId },
    })
  },
}

export class GameError extends Error {
  constructor(public code: string, public statusCode: number) {
    super(code)
    this.name = 'GameError'
  }
}
