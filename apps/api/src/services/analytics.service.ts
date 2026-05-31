// E14 · Coach Analytics — Service layer
import { prisma } from '@diamondhub/db'

export const analyticsService = {
  // E14-S1: Season cost tracker
  async getSeasonCosts(teamId: string) {
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { teamId, paymentStatus: 'PAID' },
      include: { tournament: { select: { name: true, startDate: true } } },
    })
    const total = registrations.reduce((sum, r) => sum + Number(r.entryFeePaid), 0)
    const rosterSize = await prisma.teamMember.count({
      where: { teamId, status: 'ACTIVE', role: 'PLAYER' },
    })
    return {
      totalSpent: total,
      perPlayerCost: rosterSize > 0 ? +(total / rosterSize).toFixed(2) : 0,
      registrations: registrations.map((r) => ({
        tournamentName: r.tournament.name,
        date: r.tournament.startDate.toISOString(),
        amount: Number(r.entryFeePaid),
      })),
    }
  },

  // E14-S2: Attendance rate per player
  async getAttendanceRates(teamId: string) {
    const members = await prisma.teamMember.findMany({
      where: { teamId, status: 'ACTIVE', role: 'PLAYER' },
      include: { user: { select: { name: true } } },
    })
    const events = await prisma.scheduleEvent.findMany({
      where: { teamId, isCancelled: false },
      select: { id: true },
    })
    const totalEvents = events.length
    if (totalEvents === 0) return []

    return Promise.all(
      members.map(async (member) => {
        const attended = await prisma.eventRsvp.count({
          where: {
            userId: member.userId,
            status: 'YES',
            eventId: { in: events.map((e) => e.id) },
          },
        })
        return {
          userId: member.userId,
          name: member.user.name,
          attended,
          total: totalEvents,
          rate: +((attended / totalEvents) * 100).toFixed(1),
          belowThreshold: attended / totalEvents < 0.7,
        }
      }),
    )
  },

  // E14-S3: Tournament win rate by organizer
  async getTournamentWinRates(teamId: string) {
    const games = await prisma.game.findMany({
      where: {
        status: 'FINAL',
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: { tournament: { select: { organizer: true } } },
    })

    const byOrganizer = new Map<string, { wins: number; total: number }>()
    for (const game of games) {
      const org = game.tournament.organizer
      const entry = byOrganizer.get(org) ?? { wins: 0, total: 0 }
      entry.total++
      if (game.winnerId === teamId) entry.wins++
      byOrganizer.set(org, entry)
    }

    return Array.from(byOrganizer.entries()).map(([organizer, data]) => ({
      organizer,
      wins: data.wins,
      total: data.total,
      winRate: +((data.wins / data.total) * 100).toFixed(1),
    }))
  },
}
