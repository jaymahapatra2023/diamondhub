// E15 · Organization / Club Admin — Service layer
import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'

export const organizationService = {
  // E15-S1: Create organization
  async create(ownerUserId: string, name: string) {
    const org = await prisma.organization.create({
      data: {
        name,
        ownerUserId,
        members: { create: { userId: ownerUserId, role: 'OWNER' } },
      },
      include: { members: true },
    })
    logger.info({ orgId: org.id, ownerUserId }, 'Organization created')
    return org
  },

  // Get organization for a user
  async getForUser(userId: string) {
    return prisma.organization.findFirst({
      where: { members: { some: { userId } } },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        teams: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                sport: true,
                ageDivision: true,
              },
            },
          },
        },
      },
    })
  },

  // Add coach to org
  async addCoach(orgId: string, coachEmail: string, addedBy: string) {
    const user = await prisma.user.findUnique({ where: { email: coachEmail } })
    if (!user) throw new Error('USER_NOT_FOUND')
    await prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      update: { role: 'COACH' },
      create: { orgId, userId: user.id, role: 'COACH' },
    })
    logger.info({ orgId, userId: user.id, addedBy }, 'Coach added to org')
  },

  // Link team to org
  async linkTeam(orgId: string, teamId: string) {
    await prisma.organizationTeam.upsert({
      where: { orgId_teamId: { orgId, teamId } },
      update: {},
      create: { orgId, teamId },
    })
  },

  // E15-S2: Cross-team player lookup
  async findPlayerAcrossTeams(
    orgId: string,
    query: { name?: string; dateOfBirth?: string },
  ) {
    const teams = await prisma.organizationTeam.findMany({
      where: { orgId },
      select: { teamId: true },
    })
    const teamIds = teams.map((t) => t.teamId)

    const players = await prisma.player.findMany({
      where: {
        teamId: { in: teamIds },
        ...(query.dateOfBirth && { dateOfBirth: new Date(query.dateOfBirth) }),
      },
      include: {
        user: { select: { name: true } },
        team: { select: { name: true, ageDivision: true } },
      },
    })

    const nameFilter = query.name?.toLowerCase()
    const filtered = nameFilter
      ? players.filter((p) => p.user.name.toLowerCase().includes(nameFilter))
      : players

    // Group by userId to detect duplicates
    const byUser = new Map<string, typeof players>()
    for (const p of filtered) {
      const existing = byUser.get(p.userId) ?? []
      existing.push(p)
      byUser.set(p.userId, existing)
    }

    return Array.from(byUser.values()).map((playerEntries) => ({
      userId: playerEntries[0]!.userId,
      name: playerEntries[0]!.user.name,
      teams: playerEntries.map((p) => ({
        teamId: p.teamId,
        teamName: p.team.name,
        ageDivision: p.team.ageDivision,
      })),
      isDuplicate: playerEntries.length > 1,
      sameDivisionDuplicate:
        playerEntries.length > 1 &&
        playerEntries.some((a, i) =>
          playerEntries.some(
            (b, j) => i !== j && a.team.ageDivision === b.team.ageDivision,
          ),
        ),
    }))
  },

  // Org dashboard stats
  async getDashboardStats(orgId: string) {
    const teams = await prisma.organizationTeam.findMany({
      where: { orgId },
      include: { team: { select: { id: true } } },
    })
    const teamIds = teams.map((t) => t.teamId)
    const [memberCount, registrationCount, totalSpent] = await Promise.all([
      prisma.teamMember.count({ where: { teamId: { in: teamIds }, status: 'ACTIVE' } }),
      prisma.tournamentRegistration.count({
        where: { teamId: { in: teamIds }, status: 'CONFIRMED' },
      }),
      prisma.tournamentRegistration.aggregate({
        where: { teamId: { in: teamIds }, paymentStatus: 'PAID' },
        _sum: { entryFeePaid: true },
      }),
    ])
    return {
      teamCount: teams.length,
      memberCount,
      registrationCount,
      totalSpent: Number(totalSpent._sum.entryFeePaid ?? 0),
    }
  },
}
