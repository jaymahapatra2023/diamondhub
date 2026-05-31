// E15 · Organization / Club Admin — Service unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { organizationService } from '../organization.service.js'
import { prisma } from '@diamondhub/db'

const ORG_ID = 'org-1'
const OWNER_ID = 'user-owner'
const COACH_ID = 'user-coach'
const TEAM_1 = 'team-1'
const TEAM_2 = 'team-2'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── create ─────────────────────────────────────────────────────────────────────

describe('organizationService.create', () => {
  it('creates organization with OWNER member in single call', async () => {
    const mockOrg = {
      id: ORG_ID,
      name: 'Thunder Hawks Club',
      ownerUserId: OWNER_ID,
      members: [{ userId: OWNER_ID, role: 'OWNER' }],
    }
    vi.mocked(prisma.organization.create).mockResolvedValue(mockOrg as any)

    const result = await organizationService.create(OWNER_ID, 'Thunder Hawks Club')

    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Thunder Hawks Club',
          ownerUserId: OWNER_ID,
          members: { create: { userId: OWNER_ID, role: 'OWNER' } },
        }),
      }),
    )
    expect(result.id).toBe(ORG_ID)
    expect(result.members[0]!.role).toBe('OWNER')
  })
})

// ── addCoach ───────────────────────────────────────────────────────────────────

describe('organizationService.addCoach', () => {
  it('throws USER_NOT_FOUND for unknown email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(
      organizationService.addCoach(ORG_ID, 'unknown@example.com', OWNER_ID),
    ).rejects.toThrow('USER_NOT_FOUND')

    expect(prisma.organizationMember.upsert).not.toHaveBeenCalled()
  })

  it('upserts member with COACH role when user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: COACH_ID,
      email: 'coach@example.com',
    } as any)
    vi.mocked(prisma.organizationMember.upsert).mockResolvedValue({} as any)

    await organizationService.addCoach(ORG_ID, 'coach@example.com', OWNER_ID)

    expect(prisma.organizationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: ORG_ID, userId: COACH_ID } },
        create: expect.objectContaining({ role: 'COACH' }),
        update: { role: 'COACH' },
      }),
    )
  })
})

// ── findPlayerAcrossTeams ──────────────────────────────────────────────────────

describe('organizationService.findPlayerAcrossTeams', () => {
  it('flags sameDivisionDuplicate when player on two teams in same age division', async () => {
    vi.mocked(prisma.organizationTeam.findMany).mockResolvedValue([
      { teamId: TEAM_1 },
      { teamId: TEAM_2 },
    ] as any)

    const DOB = new Date('2014-05-01')

    // Same player registered on both teams, same division "10U"
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        userId: 'player-1',
        teamId: TEAM_1,
        dateOfBirth: DOB,
        user: { name: 'Jake Smith' },
        team: { name: 'Team Alpha', ageDivision: '10U' },
      },
      {
        userId: 'player-1',
        teamId: TEAM_2,
        dateOfBirth: DOB,
        user: { name: 'Jake Smith' },
        team: { name: 'Team Beta', ageDivision: '10U' },
      },
    ] as any)

    const result = await organizationService.findPlayerAcrossTeams(ORG_ID, { name: 'Jake' })

    expect(result).toHaveLength(1)
    const jake = result[0]!
    expect(jake.isDuplicate).toBe(true)
    expect(jake.sameDivisionDuplicate).toBe(true)
    expect(jake.teams).toHaveLength(2)
  })

  it('sets isDuplicate=true but sameDivisionDuplicate=false when teams differ in division', async () => {
    vi.mocked(prisma.organizationTeam.findMany).mockResolvedValue([
      { teamId: TEAM_1 },
      { teamId: TEAM_2 },
    ] as any)

    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        userId: 'player-2',
        teamId: TEAM_1,
        user: { name: 'Emma Jones' },
        team: { name: 'Team Alpha', ageDivision: '10U' },
      },
      {
        userId: 'player-2',
        teamId: TEAM_2,
        user: { name: 'Emma Jones' },
        team: { name: 'Team Beta', ageDivision: '12U' },
      },
    ] as any)

    const result = await organizationService.findPlayerAcrossTeams(ORG_ID, {})

    expect(result[0]!.isDuplicate).toBe(true)
    expect(result[0]!.sameDivisionDuplicate).toBe(false)
  })

  it('filters by name substring (case-insensitive)', async () => {
    vi.mocked(prisma.organizationTeam.findMany).mockResolvedValue([{ teamId: TEAM_1 }] as any)
    vi.mocked(prisma.player.findMany).mockResolvedValue([
      {
        userId: 'player-3',
        teamId: TEAM_1,
        user: { name: 'Carlos Rodriguez' },
        team: { name: 'Team Alpha', ageDivision: '12U' },
      },
      {
        userId: 'player-4',
        teamId: TEAM_1,
        user: { name: 'Mike Smith' },
        team: { name: 'Team Alpha', ageDivision: '12U' },
      },
    ] as any)

    const result = await organizationService.findPlayerAcrossTeams(ORG_ID, { name: 'carlos' })

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Carlos Rodriguez')
  })
})

// ── getDashboardStats ──────────────────────────────────────────────────────────

describe('organizationService.getDashboardStats', () => {
  it('aggregates team count, member count, registration count, and total spent', async () => {
    vi.mocked(prisma.organizationTeam.findMany).mockResolvedValue([
      { teamId: TEAM_1, team: { id: TEAM_1 } },
      { teamId: TEAM_2, team: { id: TEAM_2 } },
    ] as any)
    vi.mocked(prisma.teamMember.count).mockResolvedValue(22)
    vi.mocked(prisma.tournamentRegistration.count).mockResolvedValue(8)
    vi.mocked(prisma.tournamentRegistration.aggregate).mockResolvedValue({
      _sum: { entryFeePaid: 4200 },
    } as any)

    const stats = await organizationService.getDashboardStats(ORG_ID)

    expect(stats.teamCount).toBe(2)
    expect(stats.memberCount).toBe(22)
    expect(stats.registrationCount).toBe(8)
    expect(stats.totalSpent).toBe(4200)
  })

  it('returns totalSpent=0 when no paid registrations', async () => {
    vi.mocked(prisma.organizationTeam.findMany).mockResolvedValue([
      { teamId: TEAM_1, team: { id: TEAM_1 } },
    ] as any)
    vi.mocked(prisma.teamMember.count).mockResolvedValue(5)
    vi.mocked(prisma.tournamentRegistration.count).mockResolvedValue(0)
    vi.mocked(prisma.tournamentRegistration.aggregate).mockResolvedValue({
      _sum: { entryFeePaid: null },
    } as any)

    const stats = await organizationService.getDashboardStats(ORG_ID)

    expect(stats.totalSpent).toBe(0)
  })
})
