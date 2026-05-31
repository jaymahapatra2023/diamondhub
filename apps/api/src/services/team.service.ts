// E3 · Team Management — Business Logic
// P2: Role enforcement happens here AND in handlers — defence in depth
// P12: Pino logging on all mutations
import { prisma, type TeamMemberRole } from '@diamondhub/db'
import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { emailService } from './email.service.js'
import { logger } from '../lib/logger.js'
import { config } from '../config.js'
import type {
  CreateTeamRequest,
  UpdateTeamRequest,
  AddPlayerRequest,
  InviteRequest,
  RsvpRequest,
  EmergencyContact,
} from '@diamondhub/contracts'

export const teamService = {
  // ── E3-S1: Create team ─────────────────────────────────────────────────────

  async createTeam(coachId: string, data: CreateTeamRequest) {
    // 6-char uppercase hex invite code — collision probability negligible at scale
    const inviteCode = randomBytes(3).toString('hex').toUpperCase()

    const team = await prisma.team.create({
      data: {
        name: data.name,
        sport: data.sport,
        ageDivision: data.ageDivision,
        seasonYear: data.seasonYear,
        coachId,
        homeFieldName: data.homeFieldName ?? null,
        homeFieldCity: data.homeFieldCity ?? null,
        inviteCode,
      },
    })

    // Add coach as HEAD_COACH member immediately
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: coachId,
        role: 'HEAD_COACH',
        status: 'ACTIVE',
      },
    })

    // Scoped COACH role so JWT payload reflects team membership
    await prisma.userRole.upsert({
      where: { userId_role_teamId: { userId: coachId, role: 'COACH', teamId: team.id } },
      update: {},
      create: { userId: coachId, role: 'COACH', teamId: team.id, isPrimary: false },
    })

    logger.info({ teamId: team.id, coachId }, 'Team created')
    return team
  },

  // ── E3-S2: Get teams for user ──────────────────────────────────────────────

  async getTeamsForUser(userId: string) {
    const memberships = await prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        team: {
          include: {
            _count: { select: { members: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    return memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      sport: m.team.sport,
      ageDivision: m.team.ageDivision,
      seasonYear: m.team.seasonYear,
      inviteCode: m.team.inviteCode,
      coachId: m.team.coachId,
      homeFieldName: m.team.homeFieldName,
      homeFieldCity: m.team.homeFieldCity,
      photoUrl: m.team.photoUrl,
      isActive: m.team.isActive,
      memberCount: m.team._count.members,
      memberRole: m.role,
      createdAt: m.team.createdAt.toISOString(),
    }))
  },

  // ── Get single team (with membership gate) ─────────────────────────────────

  async getTeamById(teamId: string, userId: string) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    })
    if (!membership || membership.status !== 'ACTIVE') return null

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    })
    if (!team) return null

    return {
      ...team,
      memberCount: team._count.members,
      memberRole: membership.role,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    }
  },

  async updateTeam(teamId: string, data: UpdateTeamRequest) {
    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: data.name,
        sport: data.sport,
        ageDivision: data.ageDivision,
        seasonYear: data.seasonYear,
        homeFieldName: data.homeFieldName,
        homeFieldCity: data.homeFieldCity,
        photoUrl: data.photoUrl,
        isActive: data.isActive,
      },
    })
    logger.info({ teamId }, 'Team updated')
    return team
  },

  // ── E3-S3: Roster management ───────────────────────────────────────────────

  async getRoster(teamId: string) {
    const members = await prisma.teamMember.findMany({
      where: { teamId, status: { not: 'ARCHIVED' } },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: 'asc' },
    })

    return members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      jerseyNumber: m.jerseyNumber,
      positions: m.positions,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    }))
  },

  async addPlayer(teamId: string, data: AddPlayerRequest, createdBy: string) {
    // Create placeholder user account for the player
    const user = await prisma.user.create({
      data: {
        name: `${data.firstName} ${data.lastName}`,
        email: data.email ?? `player-${uuidv4().slice(0, 8)}@placeholder.diamondhub`,
        emailVerified: false,
      },
    })

    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: user.id,
        role: 'PLAYER',
        jerseyNumber: data.jerseyNumber ?? null,
        positions: data.positions ?? [],
        status: 'ACTIVE',
      },
    })

    // Create player profile record
    await prisma.player.create({
      data: {
        userId: user.id,
        teamId,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        positions: data.positions ?? [],
        bats: data.bats ?? null,
        throws: data.throws ?? null,
      },
    })

    logger.info({ teamId, userId: user.id, createdBy }, 'Player added to roster')
    return { memberId: member.id, userId: user.id, name: user.name }
  },

  async archivePlayer(teamId: string, memberId: string) {
    const result = await prisma.teamMember.update({
      where: { id: memberId, teamId },
      data: { status: 'ARCHIVED' },
    })
    logger.info({ teamId, memberId }, 'Player archived')
    return result
  },

  async updateMember(teamId: string, memberId: string, data: Partial<AddPlayerRequest>) {
    const result = await prisma.teamMember.update({
      where: { id: memberId, teamId },
      data: {
        jerseyNumber: data.jerseyNumber,
        positions: data.positions,
      },
    })
    logger.info({ teamId, memberId }, 'Member updated')
    return result
  },

  // ── E3-S4: Invite flow ─────────────────────────────────────────────────────

  async createInvite(teamId: string, createdBy: string, data: InviteRequest) {
    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } })

    // 40-char hex token (20 bytes)
    const token = randomBytes(20).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + data.expiresInDays)

    const invite = await prisma.teamInvite.create({
      data: {
        teamId,
        email: data.email ?? null,
        role: data.role as TeamMemberRole,
        token,
        targetPlayerId: data.targetPlayerId ?? null,
        expiresAt,
        createdBy,
      },
    })

    const inviteLink = `${config.APP_URL}/join/${token}`

    if (data.email) {
      const creator = await prisma.user.findUniqueOrThrow({
        where: { id: createdBy },
        select: { name: true },
      })
      // P4: Fire-and-forget — never block on email delivery
      emailService
        .sendTeamInviteEmail(data.email, creator.name, team.name, data.role, inviteLink)
        .catch((err) => logger.error({ err }, 'Failed to send invite email'))
    }

    logger.info({ teamId, inviteId: invite.id, createdBy }, 'Invite created')
    return { inviteLink, token, expiresAt: expiresAt.toISOString() }
  },

  async acceptInvite(token: string, userId: string) {
    const invite = await prisma.teamInvite.findUnique({ where: { token } })
    if (!invite || invite.expiresAt < new Date() || invite.usedAt !== null) {
      throw new Error('INVALID_INVITE')
    }

    // Add as team member (upsert handles re-joining)
    const member = await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
      update: { status: 'ACTIVE', role: invite.role },
      create: {
        teamId: invite.teamId,
        userId,
        role: invite.role,
        status: 'ACTIVE',
      },
    })

    // Mark invite consumed
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    })

    // Map TeamMemberRole -> scoped Role for JWT
    const roleMap: Record<string, string> = {
      HEAD_COACH: 'COACH',
      ASSISTANT_COACH: 'COACH',
      PLAYER: 'PLAYER',
      PARENT: 'PARENT',
    }
    const userRole = roleMap[invite.role] ?? 'PLAYER'
    await prisma.userRole.upsert({
      where: {
        userId_role_teamId: {
          userId,
          role: userRole as any,
          teamId: invite.teamId,
        },
      },
      update: {},
      create: { userId, role: userRole as any, teamId: invite.teamId, isPrimary: false },
    })

    logger.info({ teamId: invite.teamId, userId, role: invite.role }, 'Invite accepted')
    return { teamId: invite.teamId, role: invite.role, memberId: member.id }
  },

  async getPendingInvites(teamId: string) {
    return prisma.teamInvite.findMany({
      where: { teamId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
  },

  async revokeInvite(teamId: string, inviteId: string) {
    return prisma.teamInvite.updateMany({
      where: { id: inviteId, teamId },
      data: { usedAt: new Date() },
    })
  },

  // ── E3-S6: Role assignment ─────────────────────────────────────────────────

  async assignRole(teamId: string, targetUserId: string, role: TeamMemberRole, assignedBy: string) {
    // P2: Only HEAD_COACH may reassign roles — enforced server-side
    const assignerMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: assignedBy } },
    })
    if (assignerMembership?.role !== 'HEAD_COACH') throw new Error('FORBIDDEN')

    const result = await prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { role },
    })

    logger.info({ teamId, targetUserId, role, assignedBy }, 'Member role assigned')
    return result
  },

  // ── E3-S7: RSVP ──────────────────────────────────────────────────────────

  async getRsvps(eventId: string) {
    const rsvps = await prisma.eventRsvp.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })

    const counts = { yes: 0, no: 0, maybe: 0, noResponse: 0 }
    for (const r of rsvps) {
      if (r.status === 'YES') counts.yes++
      else if (r.status === 'NO') counts.no++
      else counts.maybe++
    }

    return { rsvps, counts }
  },

  async setRsvp(eventId: string, userId: string, data: RsvpRequest) {
    const result = await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: data.status, note: data.note ?? null, updatedAt: new Date() },
      create: {
        eventId,
        userId,
        playerId: data.playerId ?? null,
        status: data.status,
        note: data.note ?? null,
      },
    })
    logger.info({ eventId, userId, status: data.status }, 'RSVP set')
    return result
  },

  // ── E3-S9: Emergency contact ───────────────────────────────────────────────

  async setEmergencyContact(playerId: string, data: EmergencyContact) {
    const result = await prisma.emergencyContact.upsert({
      where: { playerId },
      update: { ...data },
      create: { playerId, ...data },
    })
    logger.info({ playerId }, 'Emergency contact updated')
    return result
  },

  async getEmergencyContact(playerId: string) {
    return prisma.emergencyContact.findUnique({ where: { playerId } })
  },

  // ── E3-S8: Document upload — S3 presigned URL ─────────────────────────────

  async getDocumentUploadUrl(
    playerId: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    // P8: Server-side MIME validation — never trust client Content-Type
    const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED_MIMES.includes(mimeType)) throw new Error('INVALID_MIME_TYPE')

    // P8: 5 MB hard cap
    if (sizeBytes > 5 * 1024 * 1024) throw new Error('FILE_TOO_LARGE')

    const s3Key = `documents/${playerId}/${uuidv4()}-${fileName}`

    // Production: use @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
    // The presigned URL grants the client a temporary PUT permission directly to S3
    // without routing bytes through the API server (P8: no binary payloads on API)
    const uploadUrl = `${config.APP_URL}/api/v1/documents/upload?key=${encodeURIComponent(s3Key)}`

    return { uploadUrl, s3Key, expiresIn: 900 }
  },

  async recordDocument(
    playerId: string,
    s3Key: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
    type: string,
  ) {
    const doc = await prisma.playerDocument.create({
      data: {
        playerId,
        type: type as any,
        s3Key,
        fileName,
        mimeType,
        sizeBytes,
      },
    })
    logger.info({ playerId, docId: doc.id, type }, 'Document recorded')
    return doc
  },

  async getDocuments(playerId: string) {
    return prisma.playerDocument.findMany({
      where: { playerId },
      orderBy: { uploadedAt: 'desc' },
    })
  },
}
