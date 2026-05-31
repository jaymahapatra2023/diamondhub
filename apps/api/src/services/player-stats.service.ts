import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'

export const playerStatsService = {

  // E11-S1: Enter/update game stats per player
  async upsertGameStat(gameId: string, playerId: string, data: {
    atBats: number; hits: number; doubles: number; triples: number;
    homeRuns: number; rbi: number; walks: number; strikeouts: number;
    inningsPitched: number; earnedRuns: number; pitchingWin?: boolean | null
  }) {
    const stat = await prisma.playerGameStat.upsert({
      where: { gameId_playerId: { gameId, playerId } },
      update: { ...data },
      create: { gameId, playerId, ...data },
    })
    logger.info({ gameId, playerId }, 'Player stat upserted')
    return stat
  },

  // Get stats for a game
  async getGameStats(gameId: string) {
    return prisma.playerGameStat.findMany({
      where: { gameId },
      include: {
        player: {
          include: { user: { select: { name: true } } },
        },
      },
    })
  },

  // E11-S2: Season stats for a player (auto-calculate BA, ERA)
  async getPlayerSeasonStats(playerId: string, seasonYear?: number) {
    const filter: any = { playerId }
    if (seasonYear) {
      filter.game = {
        tournament: {
          startDate: {
            gte: new Date(`${seasonYear}-01-01`),
            lte: new Date(`${seasonYear}-12-31`),
          },
        },
      }
    }

    const stats = await prisma.playerGameStat.findMany({
      where: filter,
      include: {
        game: {
          include: {
            tournament: { select: { id: true, name: true, startDate: true } },
          },
        },
      },
    })

    // Aggregate totals
    const totals = stats.reduce(
      (acc, s) => ({
        games: acc.games + 1,
        atBats: acc.atBats + s.atBats,
        hits: acc.hits + s.hits,
        doubles: acc.doubles + s.doubles,
        triples: acc.triples + s.triples,
        homeRuns: acc.homeRuns + s.homeRuns,
        rbi: acc.rbi + s.rbi,
        walks: acc.walks + s.walks,
        strikeouts: acc.strikeouts + s.strikeouts,
        inningsPitched: acc.inningsPitched + Number(s.inningsPitched),
        earnedRuns: acc.earnedRuns + s.earnedRuns,
      }),
      { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 0, strikeouts: 0, inningsPitched: 0, earnedRuns: 0 }
    )

    // Baseball convention: .333 not 0.333 — strip leading zero
    const fmtAvg = (n: number, d: number) => d > 0 ? (n / d).toFixed(3).replace('0.', '.') : '.000'
    const battingAvg = fmtAvg(totals.hits, totals.atBats)
    const era = totals.inningsPitched > 0
      ? ((totals.earnedRuns * 9) / totals.inningsPitched).toFixed(2)
      : '0.00'

    return {
      playerId,
      games: totals.games,
      batting: {
        ...totals,
        battingAverage: battingAvg,
        sluggingPct: fmtAvg(
          (totals.hits - totals.doubles - totals.triples - totals.homeRuns) + totals.doubles * 2 + totals.triples * 3 + totals.homeRuns * 4,
          totals.atBats,
        ),
      },
      pitching: {
        inningsPitched: totals.inningsPitched.toFixed(1),
        earnedRuns: totals.earnedRuns,
        era,
      },
      gameStats: stats.map(s => ({
        gameId: s.gameId,
        tournamentName: s.game.tournament.name,
        date: s.game.tournament.startDate.toISOString(),
        atBats: s.atBats,
        hits: s.hits,
        rbi: s.rbi,
        inningsPitched: Number(s.inningsPitched),
      })),
    }
  },

  // E11-S3: Team record
  async getTeamRecord(teamId: string, seasonYear?: number) {
    const filter: any = {
      status: 'FINAL',
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    }
    if (seasonYear) {
      filter.tournament = {
        startDate: {
          gte: new Date(`${seasonYear}-01-01`),
          lte: new Date(`${seasonYear}-12-31`),
        },
      }
    }

    const games = await prisma.game.findMany({
      where: filter,
      include: { tournament: { select: { name: true, organizer: true } } },
    })

    let wins = 0, losses = 0, ties = 0
    const tournamentFinishes: Array<{ tournamentName: string; result: string }> = []
    const seen = new Set<string>()

    for (const game of games) {
      if (game.winnerId === teamId) wins++
      else if (game.winnerId === null) ties++
      else losses++

      if (!seen.has(game.tournamentId)) {
        seen.add(game.tournamentId)
        tournamentFinishes.push({
          tournamentName: game.tournament.name,
          result: 'Participated', // Would be enriched with bracket position in full implementation
        })
      }
    }

    return { teamId, wins, losses, ties, total: wins + losses + ties, tournamentFinishes }
  },
}
