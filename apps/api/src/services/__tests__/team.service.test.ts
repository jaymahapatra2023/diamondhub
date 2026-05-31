import { describe, it, expect, vi, beforeEach } from 'vitest'
import { teamService } from '../team.service.js'
import { prisma } from '@diamondhub/db'

// Mock email service — fire-and-forget, we only verify it's called
vi.mock('../email.service.js', () => ({
  emailService: {
    sendTeamInviteEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

const { emailService } = await import('../email.service.js')

// ── Fixtures ────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-user-1'
const TEAM_ID = 'team-1'
const USER_ID = 'user-1'
const PLAYER_ID = 'player-1'
const MEMBER_ID = 'member-1'
const EVENT_ID = 'event-1'
const INVITE_ID = 'invite-1'

const baseTeam = {
  id: TEAM_ID,
  name: 'Thunder Hawks',
  sport: 'BASEBALL' as const,
  ageDivision: '12U',
  seasonYear: 2026,
  coachId: COACH_ID,
  inviteCode: 'ABC123',
  photoUrl: null,
  homeFieldName: 'Thunder Field',
  homeFieldCity: 'Dallas',
  isActive: true,
  orgId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const baseUser = {
  id: USER_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  emailVerified: false,
  passwordHash: null,
  phone: null,
  avatarUrl: null,
  timezone: 'America/New_York',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseMember = {
  id: MEMBER_ID,
  teamId: TEAM_ID,
  userId: COACH_ID,
  role: 'HEAD_COACH' as const,
  jerseyNumber: null,
  positions: [],
  status: 'ACTIVE' as const,
  joinedAt: new Date(),
  updatedAt: new Date(),
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('teamService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── createTeam ─────────────────────────────────────────────────────────────

  describe('createTeam', () => {
    it('creates team with 6-char uppercase hex invite code', async () => {
      vi.mocked(prisma.team.create).mockResolvedValue(baseTeam)
      vi.mocked(prisma.teamMember.create).mockResolvedValue(baseMember)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      const result = await teamService.createTeam(COACH_ID, {
        name: 'Thunder Hawks',
        sport: 'BASEBALL',
        ageDivision: '12U',
        seasonYear: 2026,
        homeFieldName: 'Thunder Field',
        homeFieldCity: 'Dallas',
      })

      expect(prisma.team.create).toHaveBeenCalledOnce()
      const createCall = vi.mocked(prisma.team.create).mock.calls[0][0]
      // Invite code: 3 bytes => 6 hex chars, uppercase
      expect(createCall.data.inviteCode).toMatch(/^[A-F0-9]{6}$/)
      expect(result.id).toBe(TEAM_ID)
    })

    it('adds coach as HEAD_COACH team member', async () => {
      vi.mocked(prisma.team.create).mockResolvedValue(baseTeam)
      vi.mocked(prisma.teamMember.create).mockResolvedValue(baseMember)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await teamService.createTeam(COACH_ID, {
        name: 'Thunder Hawks',
        sport: 'BASEBALL',
        ageDivision: '12U',
        seasonYear: 2026,
      })

      expect(prisma.teamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'HEAD_COACH', userId: COACH_ID, status: 'ACTIVE' }),
        }),
      )
    })

    it('adds scoped COACH UserRole for the coach', async () => {
      vi.mocked(prisma.team.create).mockResolvedValue(baseTeam)
      vi.mocked(prisma.teamMember.create).mockResolvedValue(baseMember)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await teamService.createTeam(COACH_ID, {
        name: 'Thunder Hawks',
        sport: 'BASEBALL',
        ageDivision: '12U',
        seasonYear: 2026,
      })

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ userId: COACH_ID, role: 'COACH', teamId: TEAM_ID }),
        }),
      )
    })
  })

  // ── getTeamsForUser ────────────────────────────────────────────────────────

  describe('getTeamsForUser', () => {
    it('returns only teams where user is an active member', async () => {
      const mockMemberships = [
        {
          ...baseMember,
          team: {
            ...baseTeam,
            _count: { members: 8 },
          },
        },
      ]
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue(mockMemberships as any)

      const result = await teamService.getTeamsForUser(COACH_ID)

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: COACH_ID, status: 'ACTIVE' },
        }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(TEAM_ID)
      expect(result[0].memberCount).toBe(8)
    })

    it('maps memberRole from the membership record', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        {
          ...baseMember,
          role: 'ASSISTANT_COACH',
          team: { ...baseTeam, _count: { members: 5 } },
        },
      ] as any)

      const result = await teamService.getTeamsForUser(COACH_ID)
      expect(result[0].memberRole).toBe('ASSISTANT_COACH')
    })
  })

  // ── getTeamById ────────────────────────────────────────────────────────────

  describe('getTeamById', () => {
    it('returns null when user is not a member', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null)

      const result = await teamService.getTeamById(TEAM_ID, 'outsider-user')

      expect(result).toBeNull()
    })

    it('returns null when membership is not ACTIVE', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
        ...baseMember,
        status: 'ARCHIVED',
      } as any)

      const result = await teamService.getTeamById(TEAM_ID, COACH_ID)

      expect(result).toBeNull()
    })

    it('returns team with member count for active member', async () => {
      vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(baseMember as any)
      vi.mocked(prisma.team.findUnique).mockResolvedValue({
        ...baseTeam,
        _count: { members: 12 },
      } as any)

      const result = await teamService.getTeamById(TEAM_ID, COACH_ID)

      expect(result).not.toBeNull()
      expect(result!.memberCount).toBe(12)
      expect(result!.memberRole).toBe('HEAD_COACH')
    })
  })

  // ── getRoster ──────────────────────────────────────────────────────────────

  describe('getRoster', () => {
    it('returns active members and excludes archived', async () => {
      const activeMembers = [
        {
          id: 'member-active',
          teamId: TEAM_ID,
          userId: USER_ID,
          role: 'PLAYER',
          jerseyNumber: 7,
          positions: ['SS'],
          status: 'ACTIVE',
          joinedAt: new Date(),
          user: { id: USER_ID, name: 'Jane Doe', email: 'jane@example.com', avatarUrl: null },
        },
      ]
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue(activeMembers as any)

      const result = await teamService.getRoster(TEAM_ID)

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: TEAM_ID, status: { not: 'ARCHIVED' } },
        }),
      )
      expect(result).toHaveLength(1)
      expect(result[0].jerseyNumber).toBe(7)
    })
  })

  // ── addPlayer ──────────────────────────────────────────────────────────────

  describe('addPlayer', () => {
    it('creates User, TeamMember, and Player records', async () => {
      vi.mocked(prisma.user.create).mockResolvedValue({ ...baseUser, id: 'new-user-1', name: 'Alice Smith' })
      vi.mocked(prisma.teamMember.create).mockResolvedValue({ ...baseMember, id: 'new-member-1', role: 'PLAYER' } as any)
      vi.mocked(prisma.player.create).mockResolvedValue({} as any)

      const result = await teamService.addPlayer(
        TEAM_ID,
        { firstName: 'Alice', lastName: 'Smith', positions: ['CF'], jerseyNumber: 14 },
        COACH_ID,
      )

      expect(prisma.user.create).toHaveBeenCalledOnce()
      expect(prisma.teamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'PLAYER', teamId: TEAM_ID }),
        }),
      )
      expect(prisma.player.create).toHaveBeenCalledOnce()
      expect(result.name).toBe('Alice Smith')
    })

    it('generates a placeholder email when no email provided', async () => {
      vi.mocked(prisma.user.create).mockResolvedValue({ ...baseUser, email: 'player-abc@placeholder.diamondhub' })
      vi.mocked(prisma.teamMember.create).mockResolvedValue(baseMember as any)
      vi.mocked(prisma.player.create).mockResolvedValue({} as any)

      await teamService.addPlayer(TEAM_ID, { firstName: 'Bob', lastName: 'Jones', positions: [] }, COACH_ID)

      const createArgs = vi.mocked(prisma.user.create).mock.calls[0][0]
      expect(createArgs.data.email).toMatch(/@placeholder\.diamondhub$/)
    })
  })

  // ── archivePlayer ──────────────────────────────────────────────────────────

  describe('archivePlayer', () => {
    it('sets status to ARCHIVED, not deletes the record', async () => {
      vi.mocked(prisma.teamMember.update).mockResolvedValue({ ...baseMember, status: 'ARCHIVED' } as any)

      await teamService.archivePlayer(TEAM_ID, MEMBER_ID)

      expect(prisma.teamMember.update).toHaveBeenCalledWith({
        where: { id: MEMBER_ID, teamId: TEAM_ID },
        data: { status: 'ARCHIVED' },
      })
      expect(prisma.teamMember.delete).not.toHaveBeenCalled?.()
    })
  })

  // ── createInvite ───────────────────────────────────────────────────────────

  describe('createInvite', () => {
    it('generates a 40-char hex token', async () => {
      vi.mocked(prisma.team.findUniqueOrThrow).mockResolvedValue(baseTeam as any)
      vi.mocked(prisma.teamInvite.create).mockResolvedValue({ id: INVITE_ID } as any)

      const result = await teamService.createInvite(TEAM_ID, COACH_ID, {
        role: 'PLAYER',
        expiresInDays: 7,
      })

      // 20 bytes => 40 hex chars
      expect(result.token).toMatch(/^[a-f0-9]{40}$/)
    })

    it('sends invite email when email is provided', async () => {
      vi.mocked(prisma.team.findUniqueOrThrow).mockResolvedValue(baseTeam as any)
      vi.mocked(prisma.teamInvite.create).mockResolvedValue({ id: INVITE_ID } as any)
      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ ...baseUser, name: 'Coach Bob' } as any)

      await teamService.createInvite(TEAM_ID, COACH_ID, {
        email: 'parent@example.com',
        role: 'PARENT',
        expiresInDays: 7,
      })

      // Allow async fire-and-forget to execute
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(emailService.sendTeamInviteEmail).toHaveBeenCalledWith(
        'parent@example.com',
        'Coach Bob',
        'Thunder Hawks',
        'PARENT',
        expect.stringContaining('/join/'),
      )
    })

    it('does not send email when no email is provided', async () => {
      vi.mocked(prisma.team.findUniqueOrThrow).mockResolvedValue(baseTeam as any)
      vi.mocked(prisma.teamInvite.create).mockResolvedValue({ id: INVITE_ID } as any)

      await teamService.createInvite(TEAM_ID, COACH_ID, {
        role: 'PLAYER',
        expiresInDays: 3,
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(emailService.sendTeamInviteEmail).not.toHaveBeenCalled()
    })
  })

  // ── acceptInvite ───────────────────────────────────────────────────────────

  describe('acceptInvite', () => {
    const validInvite = {
      id: INVITE_ID,
      teamId: TEAM_ID,
      email: null,
      role: 'PLAYER' as const,
      token: 'abc123token',
      targetPlayerId: null,
      expiresAt: new Date(Date.now() + 86400000), // tomorrow
      usedAt: null,
      createdBy: COACH_ID,
      createdAt: new Date(),
    }

    it('marks invite as used, adds member, adds UserRole', async () => {
      vi.mocked(prisma.teamInvite.findUnique).mockResolvedValue(validInvite as any)
      vi.mocked(prisma.teamMember.upsert).mockResolvedValue({
        ...baseMember,
        id: 'new-member',
        role: 'PLAYER',
      } as any)
      vi.mocked(prisma.teamInvite.update).mockResolvedValue({} as any)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      const result = await teamService.acceptInvite('abc123token', USER_ID)

      expect(prisma.teamMember.upsert).toHaveBeenCalledOnce()
      expect(prisma.teamInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      )
      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ role: 'PLAYER', teamId: TEAM_ID }),
        }),
      )
      expect(result.teamId).toBe(TEAM_ID)
    })

    it('throws INVALID_INVITE for expired token', async () => {
      vi.mocked(prisma.teamInvite.findUnique).mockResolvedValue({
        ...validInvite,
        expiresAt: new Date(Date.now() - 1000), // expired
      } as any)

      await expect(teamService.acceptInvite('expired-token', USER_ID)).rejects.toThrow('INVALID_INVITE')
    })

    it('throws INVALID_INVITE for already-used token', async () => {
      vi.mocked(prisma.teamInvite.findUnique).mockResolvedValue({
        ...validInvite,
        usedAt: new Date(), // already consumed
      } as any)

      await expect(teamService.acceptInvite('used-token', USER_ID)).rejects.toThrow('INVALID_INVITE')
    })

    it('throws INVALID_INVITE for non-existent token', async () => {
      vi.mocked(prisma.teamInvite.findUnique).mockResolvedValue(null)

      await expect(teamService.acceptInvite('no-such-token', USER_ID)).rejects.toThrow('INVALID_INVITE')
    })

    it('maps ASSISTANT_COACH invite role to COACH UserRole', async () => {
      vi.mocked(prisma.teamInvite.findUnique).mockResolvedValue({
        ...validInvite,
        role: 'ASSISTANT_COACH',
      } as any)
      vi.mocked(prisma.teamMember.upsert).mockResolvedValue({ ...baseMember, role: 'ASSISTANT_COACH' } as any)
      vi.mocked(prisma.teamInvite.update).mockResolvedValue({} as any)
      vi.mocked(prisma.userRole.upsert).mockResolvedValue({} as any)

      await teamService.acceptInvite('asst-token', USER_ID)

      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ role: 'COACH' }),
        }),
      )
    })
  })

  // ── getRsvps ───────────────────────────────────────────────────────────────

  describe('getRsvps', () => {
    it('counts YES, NO, and MAYBE correctly', async () => {
      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([
        { id: '1', status: 'YES', user: { id: 'u1', name: 'Alice', avatarUrl: null } },
        { id: '2', status: 'YES', user: { id: 'u2', name: 'Bob', avatarUrl: null } },
        { id: '3', status: 'NO', user: { id: 'u3', name: 'Carol', avatarUrl: null } },
        { id: '4', status: 'MAYBE', user: { id: 'u4', name: 'Dave', avatarUrl: null } },
        { id: '5', status: 'MAYBE', user: { id: 'u5', name: 'Eve', avatarUrl: null } },
      ] as any)

      const { counts } = await teamService.getRsvps(EVENT_ID)

      expect(counts.yes).toBe(2)
      expect(counts.no).toBe(1)
      expect(counts.maybe).toBe(2)
    })

    it('returns all RSVP records', async () => {
      const mockRsvps = [{ id: 'r1', status: 'YES', user: { id: 'u1', name: 'Alice', avatarUrl: null } }]
      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue(mockRsvps as any)

      const { rsvps } = await teamService.getRsvps(EVENT_ID)
      expect(rsvps).toHaveLength(1)
    })
  })

  // ── setRsvp ────────────────────────────────────────────────────────────────

  describe('setRsvp', () => {
    it('upserts the RSVP record', async () => {
      const mockRsvp = { id: 'rsvp-1', eventId: EVENT_ID, userId: USER_ID, status: 'YES' }
      vi.mocked(prisma.eventRsvp.upsert).mockResolvedValue(mockRsvp as any)

      const result = await teamService.setRsvp(EVENT_ID, USER_ID, { status: 'YES' })

      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId_userId: { eventId: EVENT_ID, userId: USER_ID } },
          update: expect.objectContaining({ status: 'YES' }),
        }),
      )
      expect(result.status).toBe('YES')
    })

    it('passes note through when provided', async () => {
      vi.mocked(prisma.eventRsvp.upsert).mockResolvedValue({ id: 'r1', status: 'MAYBE', note: 'Running late' } as any)

      await teamService.setRsvp(EVENT_ID, USER_ID, { status: 'MAYBE', note: 'Running late' })

      const upsertCall = vi.mocked(prisma.eventRsvp.upsert).mock.calls[0][0]
      expect(upsertCall.update.note).toBe('Running late')
    })
  })

  // ── setEmergencyContact ────────────────────────────────────────────────────

  describe('setEmergencyContact', () => {
    it('upserts emergency contact for player', async () => {
      const contactData = {
        contactName: 'Mary Smith',
        relationship: 'Mother',
        phone1: '+15551234567',
        phone2: null,
      }
      vi.mocked(prisma.emergencyContact.upsert).mockResolvedValue({
        id: 'ec-1',
        playerId: PLAYER_ID,
        ...contactData,
        updatedAt: new Date(),
      } as any)

      const result = await teamService.setEmergencyContact(PLAYER_ID, contactData)

      expect(prisma.emergencyContact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: PLAYER_ID },
          update: contactData,
          create: expect.objectContaining({ playerId: PLAYER_ID, ...contactData }),
        }),
      )
      expect(result.contactName).toBe('Mary Smith')
    })
  })

  // ── getDocumentUploadUrl ───────────────────────────────────────────────────

  describe('getDocumentUploadUrl', () => {
    it('throws INVALID_MIME_TYPE for disallowed type', async () => {
      await expect(
        teamService.getDocumentUploadUrl(PLAYER_ID, 'virus.exe', 'application/x-msdownload', 1024),
      ).rejects.toThrow('INVALID_MIME_TYPE')
    })

    it('throws FILE_TOO_LARGE for files over 5 MB', async () => {
      const overSize = 5 * 1024 * 1024 + 1
      await expect(
        teamService.getDocumentUploadUrl(PLAYER_ID, 'cert.pdf', 'application/pdf', overSize),
      ).rejects.toThrow('FILE_TOO_LARGE')
    })

    it('returns s3Key and uploadUrl for valid PDF', async () => {
      const result = await teamService.getDocumentUploadUrl(
        PLAYER_ID,
        'birth-cert.pdf',
        'application/pdf',
        512 * 1024,
      )

      expect(result.uploadUrl).toBeDefined()
      expect(result.s3Key).toMatch(new RegExp(`^documents/${PLAYER_ID}/`))
      expect(result.expiresIn).toBe(900)
    })

    it('accepts image/jpeg as valid MIME type', async () => {
      const result = await teamService.getDocumentUploadUrl(
        PLAYER_ID,
        'photo.jpg',
        'image/jpeg',
        200 * 1024,
      )
      expect(result.s3Key).toBeDefined()
    })

    it('accepts exactly 5 MB without throwing', async () => {
      const exactMax = 5 * 1024 * 1024
      const result = await teamService.getDocumentUploadUrl(
        PLAYER_ID,
        'waiver.pdf',
        'application/pdf',
        exactMax,
      )
      expect(result).toBeDefined()
    })
  })
})
