// E10 · Communication & Messaging — Route Handlers
// P2: All routes require authentication
// P4: Socket.io emits happen AFTER DB write

import type { FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodError } from 'zod'
import { messageService } from '../../../services/message.service.js'
import { prisma } from '@diamondhub/db'

// ── Input schemas ─────────────────────────────────────────────────────────────

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const SendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
})

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(10000),
})

const PinAnnouncementSchema = z.object({
  pin: z.boolean(),
})

// ── Error helpers ─────────────────────────────────────────────────────────────

function sendValidationError(reply: FastifyReply, err: ZodError) {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    details: err.flatten().fieldErrors,
  })
}

// ── Helper: verify team membership ───────────────────────────────────────────

async function requireTeamMembership(
  teamId: string,
  userId: string,
  reply: FastifyReply,
): Promise<{ role: string; status: string } | null> {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true, status: true },
  })
  if (!membership || membership.status !== 'ACTIVE') {
    reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You are not an active member of this team',
    })
    return null
  }
  return membership
}

// ── GET /api/v1/messages/inbox ────────────────────────────────────────────────

export async function getInboxHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub
  const threads = await messageService.getInbox(userId)
  return reply.code(200).send(threads)
}

// ── GET /api/v1/messages/teams/:teamId ───────────────────────────────────────

export async function getTeamMessagesHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  const pageParsed = PaginationSchema.safeParse(request.query)
  if (!pageParsed.success) return sendValidationError(reply, pageParsed.error)

  const { page, limit } = pageParsed.data
  const messages = await messageService.getTeamMessages(teamId, page, limit)
  return reply.code(200).send(messages)
}

// ── POST /api/v1/messages/teams/:teamId ──────────────────────────────────────

export async function sendTeamMessageHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  const parsed = SendMessageSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const message = await messageService.sendMessage(
    teamId,
    userId,
    parsed.data.body,
    'TEAM',
    undefined,
    parsed.data.attachmentUrl,
  )
  return reply.code(201).send(message)
}

// ── GET /api/v1/messages/teams/:teamId/dm/:recipientId ───────────────────────

export async function getDmMessagesHandler(
  request: FastifyRequest<{ Params: { teamId: string; recipientId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, recipientId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  const pageParsed = PaginationSchema.safeParse(request.query)
  if (!pageParsed.success) return sendValidationError(reply, pageParsed.error)

  const { page, limit } = pageParsed.data
  const messages = await messageService.getDmMessages(teamId, userId, recipientId, page, limit)
  return reply.code(200).send(messages)
}

// ── POST /api/v1/messages/teams/:teamId/dm/:recipientId ──────────────────────

export async function sendDmHandler(
  request: FastifyRequest<{ Params: { teamId: string; recipientId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, recipientId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  const parsed = SendMessageSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const message = await messageService.sendMessage(
    teamId,
    userId,
    parsed.data.body,
    'DIRECT',
    recipientId,
    parsed.data.attachmentUrl,
  )
  return reply.code(201).send(message)
}

// ── DELETE /api/v1/messages/:messageId ───────────────────────────────────────

export async function deleteMessageHandler(
  request: FastifyRequest<{ Params: { messageId: string } }>,
  reply: FastifyReply,
) {
  const { messageId } = request.params
  const userId = request.user!.sub

  // Determine if user is a coach (check if they are a coach on any active team)
  const coachMembership = await prisma.teamMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
    },
  })
  const isCoach = coachMembership !== null

  try {
    await messageService.deleteMessage(messageId, userId, isCoach)
    return reply.code(200).send({ success: true })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Message not found' })
      }
      if (err.message === 'FORBIDDEN') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You cannot delete this message' })
      }
    }
    throw err
  }
}

// ── POST /api/v1/messages/:messageId/read ────────────────────────────────────

export async function markReadHandler(
  request: FastifyRequest<{ Params: { messageId: string } }>,
  reply: FastifyReply,
) {
  const { messageId } = request.params
  const userId = request.user!.sub

  await messageService.markRead(messageId, userId)
  return reply.code(200).send({ success: true })
}

// ── GET /api/v1/messages/teams/:teamId/announcements ─────────────────────────

export async function getAnnouncementsHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  const announcements = await messageService.getAnnouncements(teamId)
  return reply.code(200).send(announcements)
}

// ── POST /api/v1/messages/teams/:teamId/announcements ────────────────────────

export async function createAnnouncementHandler(
  request: FastifyRequest<{ Params: { teamId: string } }>,
  reply: FastifyReply,
) {
  const { teamId } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  if (!['HEAD_COACH', 'ASSISTANT_COACH'].includes(membership.role)) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only coaches can create announcements',
    })
  }

  const parsed = CreateAnnouncementSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const ann = await messageService.createAnnouncement(teamId, userId, parsed.data.title, parsed.data.body)
  return reply.code(201).send(ann)
}

// ── PATCH /api/v1/messages/teams/:teamId/announcements/:id/pin ───────────────

export async function pinAnnouncementHandler(
  request: FastifyRequest<{ Params: { teamId: string; id: string } }>,
  reply: FastifyReply,
) {
  const { teamId, id } = request.params
  const userId = request.user!.sub

  const membership = await requireTeamMembership(teamId, userId, reply)
  if (!membership) return

  if (!['HEAD_COACH', 'ASSISTANT_COACH'].includes(membership.role)) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only coaches can pin announcements',
    })
  }

  const parsed = PinAnnouncementSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const ann = await messageService.pinAnnouncement(id, teamId, parsed.data.pin)
  return reply.code(200).send(ann)
}
