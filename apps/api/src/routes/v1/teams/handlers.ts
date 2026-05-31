// E3 · Team Management — Route Handlers
// P2: Membership gate enforced server-side on every request — never trust client
// P9: All inputs validated with Zod before touching DB
// P12: Pino logging on all mutations

import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@diamondhub/db'
import { z, ZodError } from 'zod'
import {
  CreateTeamRequestSchema,
  UpdateTeamRequestSchema,
  AddPlayerRequestSchema,
  UpdatePlayerRequestSchema,
  InviteRequestSchema,
  RsvpRequestSchema,
  EmergencyContactSchema,
  TeamMemberRoleSchema,
  DocumentTypeSchema,
} from '@diamondhub/contracts'
import { teamService } from '../../../services/team.service.js'
import { logger } from '../../../lib/logger.js'

// ── Membership guard ──────────────────────────────────────────────────────────

class MembershipError extends Error {
  constructor(public code: string) {
    super(code)
    this.name = 'MembershipError'
  }
}

async function requireTeamMembership(teamId: string, userId: string, allowedRoles?: string[]) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  })
  if (!membership || membership.status !== 'ACTIVE') {
    throw new MembershipError('NOT_MEMBER')
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new MembershipError('FORBIDDEN')
  }
  return membership
}

// ── Error response helpers ────────────────────────────────────────────────────

function sendValidationError(reply: FastifyReply, err: ZodError) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    details: err.flatten().fieldErrors,
  })
}

function sendMembershipError(reply: FastifyReply, err: MembershipError) {
  if (err.code === 'NOT_MEMBER') {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Team not found or access denied' })
  }
  return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Insufficient team permissions' })
}

// ── GET /teams — list user's teams ───────────────────────────────────────────

export async function listTeamsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub
  const teams = await teamService.getTeamsForUser(userId)
  return reply.code(200).send(teams)
}

// ── POST /teams — create team ─────────────────────────────────────────────────

export async function createTeamHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateTeamRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const coachId = request.user!.sub
  const team = await teamService.createTeam(coachId, parsed.data)
  return reply.code(201).send(team)
}

// ── GET /teams/:teamId — get single team ──────────────────────────────────────

export async function getTeamHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const team = await teamService.getTeamById(teamId, userId)
  if (!team) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Team not found or access denied' })
  }
  return reply.code(200).send(team)
}

// ── PATCH /teams/:teamId — update team ────────────────────────────────────────

export async function updateTeamHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = UpdateTeamRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const team = await teamService.updateTeam(teamId, parsed.data)
  return reply.code(200).send(team)
}

// ── GET /teams/:teamId/roster ─────────────────────────────────────────────────

export async function getRosterHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId)
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const roster = await teamService.getRoster(teamId)
  return reply.code(200).send(roster)
}

// ── POST /teams/:teamId/roster — add player ───────────────────────────────────

export async function addPlayerHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = AddPlayerRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const result = await teamService.addPlayer(teamId, parsed.data, userId)
  return reply.code(201).send(result)
}

// ── PATCH /teams/:teamId/roster/:memberId — update member ─────────────────────

export async function updateMemberHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = UpdatePlayerRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const result = await teamService.updateMember(teamId, memberId, parsed.data)
  return reply.code(200).send(result)
}

// ── DELETE /teams/:teamId/roster/:memberId — archive player ───────────────────

export async function archivePlayerHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const result = await teamService.archivePlayer(teamId, memberId)
  return reply.code(200).send(result)
}

// ── POST /teams/:teamId/invites — create invite ───────────────────────────────

export async function createInviteHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = InviteRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const result = await teamService.createInvite(teamId, userId, parsed.data)
  return reply.code(201).send(result)
}

// ── GET /teams/:teamId/invites — pending invites ──────────────────────────────

export async function getPendingInvitesHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const invites = await teamService.getPendingInvites(teamId)
  return reply.code(200).send(invites)
}

// ── DELETE /teams/:teamId/invites/:inviteId — revoke invite ───────────────────

export async function revokeInviteHandler(
  request: FastifyRequest<{ Params: { teamId: string; inviteId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, inviteId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const result = await teamService.revokeInvite(teamId, inviteId)
  return reply.code(200).send(result)
}

// ── POST /join/:token — accept invite ─────────────────────────────────────────
// No teamId param — the token carries team context. Gate is token validity alone.

export async function acceptInviteHandler(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply,
) {
  const { token } = request.params
  const userId = request.user!.sub

  try {
    const result = await teamService.acceptInvite(token, userId)
    return reply.code(200).send(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_INVITE') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invite link is invalid, expired, or already used',
      })
    }
    logger.error({ err, userId }, 'acceptInvite error')
    throw err
  }
}

// ── GET /teams/:teamId/roster/:memberId/emergency-contact ─────────────────────

export async function getEmergencyContactHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  // P2: PARENT/PLAYER cannot read emergency contacts
  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  // Look up the player id from the member record
  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    include: {
      user: {
        include: { playersOwned: { where: { teamId }, take: 1 } },
      },
    },
  })
  if (!member) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }
  const player = member.user.playersOwned[0]
  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player profile not found' })
  }

  const contact = await teamService.getEmergencyContact(player.id)
  if (!contact) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No emergency contact on file' })
  }
  return reply.code(200).send(contact)
}

// ── PUT /teams/:teamId/roster/:memberId/emergency-contact ─────────────────────

export async function setEmergencyContactHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = EmergencyContactSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    include: {
      user: {
        include: { playersOwned: { where: { teamId }, take: 1 } },
      },
    },
  })
  if (!member) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }
  const player = member.user.playersOwned[0]
  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player profile not found' })
  }

  const contact = await teamService.setEmergencyContact(player.id, parsed.data)
  return reply.code(200).send(contact)
}

// ── POST /teams/:teamId/roster/:memberId/documents/upload-url ─────────────────

const DocumentUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
})

export async function getDocumentUploadUrlHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = DocumentUploadSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    include: { user: { include: { playersOwned: { where: { teamId }, take: 1 } } } },
  })
  if (!member) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }
  const player = member.user.playersOwned[0]
  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player profile not found' })
  }

  try {
    const result = await teamService.getDocumentUploadUrl(
      player.id,
      parsed.data.fileName,
      parsed.data.mimeType,
      parsed.data.sizeBytes,
    )
    return reply.code(200).send(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_MIME_TYPE') {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Unsupported file type' })
    }
    if (err instanceof Error && err.message === 'FILE_TOO_LARGE') {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'File exceeds 5 MB limit' })
    }
    throw err
  }
}

// ── POST /teams/:teamId/roster/:memberId/documents — record document ───────────

const RecordDocumentSchema = z.object({
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  type: DocumentTypeSchema,
})

export async function recordDocumentHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = RecordDocumentSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    include: { user: { include: { playersOwned: { where: { teamId }, take: 1 } } } },
  })
  if (!member) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }
  const player = member.user.playersOwned[0]
  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player profile not found' })
  }

  const { s3Key, fileName, mimeType, sizeBytes, type } = parsed.data
  const doc = await teamService.recordDocument(player.id, s3Key, fileName, mimeType, sizeBytes, type)
  return reply.code(201).send(doc)
}

// ── GET /teams/:teamId/roster/:memberId/documents ─────────────────────────────

export async function getDocumentsHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    include: { user: { include: { playersOwned: { where: { teamId }, take: 1 } } } },
  })
  if (!member) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }
  const player = member.user.playersOwned[0]
  if (!player) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Player profile not found' })
  }

  const docs = await teamService.getDocuments(player.id)
  return reply.code(200).send(docs)
}

// ── POST /teams/:teamId/events/:eventId/rsvp — set RSVP ──────────────────────

export async function setRsvpHandler(
  request: FastifyRequest<{ Params: { teamId: string; eventId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, eventId } = request.params
  const userId = request.user!.sub

  // Any active team member may RSVP
  try {
    await requireTeamMembership(teamId, userId)
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = RsvpRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const result = await teamService.setRsvp(eventId, userId, parsed.data)
  return reply.code(200).send(result)
}

// ── GET /teams/:teamId/events/:eventId/rsvp — get RSVPs ──────────────────────

export async function getRsvpsHandler(
  request: FastifyRequest<{ Params: { teamId: string; eventId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, eventId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId)
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const result = await teamService.getRsvps(eventId)
  return reply.code(200).send(result)
}

// ── POST /teams/:teamId/link-requests — parent requests player link (E3-S5) ───

export async function createLinkRequestHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' })
  const { teamId } = request.params
  const body = request.body as { playerUserId?: string }
  if (!body.playerUserId) {
    return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'playerUserId required' })
  }

  // Verify caller is a PARENT member of this team
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: request.user.sub } }
  })
  if (!membership || membership.role !== 'PARENT') {
    return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only parents can request player linking' })
  }

  const link = await prisma.parentPlayerLink.upsert({
    where: { parentUserId_playerUserId_teamId: { parentUserId: request.user.sub, playerUserId: body.playerUserId, teamId } },
    update: { status: 'PENDING' },
    create: { parentUserId: request.user.sub, playerUserId: body.playerUserId, teamId, status: 'PENDING' }
  })
  return reply.code(201).send(link)
}

// ── GET /teams/:teamId/link-requests — coach sees pending requests (E3-S5) ────

export async function getLinkRequestsHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' })
  const { teamId } = request.params

  try {
    await requireTeamMembership(teamId, request.user.sub, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const links = await prisma.parentPlayerLink.findMany({
    where: { teamId, status: 'PENDING' },
    include: {
      parent: { select: { id: true, name: true, email: true } },
      player: { select: { id: true, name: true } }
    }
  })
  return reply.code(200).send(links)
}

// ── PATCH /teams/:teamId/link-requests/:linkId — coach approves/rejects (E3-S5)

export async function updateLinkRequestHandler(
  request: FastifyRequest<{ Params: { teamId: string; linkId: string } }>,
  reply: FastifyReply,
) {
  if (!request.user) return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' })
  const { teamId, linkId } = request.params
  const body = request.body as { status: 'APPROVED' | 'REJECTED' }

  try {
    await requireTeamMembership(teamId, request.user.sub, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const link = await prisma.parentPlayerLink.update({
    where: { id: linkId },
    data: { status: body.status, approvedAt: body.status === 'APPROVED' ? new Date() : null, approvedBy: request.user.sub }
  })
  return reply.code(200).send(link)
}

// ── PATCH /teams/:teamId/roster/:memberId/role — assign role ──────────────────

const AssignRoleSchema = z.object({ role: TeamMemberRoleSchema })

export async function assignRoleHandler(
  request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, memberId } = request.params
  const userId = request.user!.sub

  // P2: Only HEAD_COACH may assign roles — enforced in service too (defence in depth)
  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  const parsed = AssignRoleSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  // Resolve target userId from memberId
  const targetMember = await prisma.teamMember.findFirst({ where: { id: memberId, teamId } })
  if (!targetMember) {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Member not found' })
  }

  try {
    const result = await teamService.assignRole(
      teamId,
      targetMember.userId,
      parsed.data.role,
      userId,
    )
    return reply.code(200).send(result)
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only the head coach can assign roles' })
    }
    throw err
  }
}
