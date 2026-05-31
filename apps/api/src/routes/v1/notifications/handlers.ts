// E5 · Notifications & Alerts — Route Handlers
// P2: Coach-only guard on broadcast endpoint
// P4: All sends go through notificationService (Bull queue) — no sync dispatch
// P9: Zod validation on all inputs from @diamondhub/contracts

import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError, z } from 'zod'
import {
  MarkReadRequestSchema,
  NotificationPreferencesSchema,
  BroadcastAlertRequestSchema,
} from '@diamondhub/contracts'
import { notificationService } from '../../../services/notification.service.js'
import { logger } from '../../../lib/logger.js'

// ── Input schemas ─────────────────────────────────────────────────────────────

const DeviceTokenRegisterSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
})

const DeviceTokenUnregisterSchema = z.object({
  token: z.string().min(10),
})

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

// ── GET /notifications ────────────────────────────────────────────────────────

export async function getNotificationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub

  const pageParsed = PaginationSchema.safeParse(request.query)
  if (!pageParsed.success) return sendValidationError(reply, pageParsed.error)

  const { page, limit } = pageParsed.data
  const result = await notificationService.getNotifications(userId, page, limit)
  return reply.code(200).send(result)
}

// ── PATCH /notifications/read ─────────────────────────────────────────────────

export async function markReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub

  const parsed = MarkReadRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  await notificationService.markRead(userId, parsed.data.notificationIds)
  return reply.code(200).send({ success: true })
}

// ── GET /notifications/preferences ───────────────────────────────────────────

export async function getPrefsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = request.user!
  // Use the primary role for default prefs lookup
  const primaryRole = user.roles[0]?.role ?? 'PLAYER'

  const prefs = await notificationService.getPreferences(user.sub, primaryRole)
  return reply.code(200).send(prefs)
}

// ── PUT /notifications/preferences ───────────────────────────────────────────

export async function updatePrefsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub

  const parsed = NotificationPreferencesSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  await notificationService.updatePreferences(userId, parsed.data)
  logger.info({ userId }, 'Notification preferences updated')
  return reply.code(200).send({ success: true })
}

// ── POST /notifications/device-tokens ────────────────────────────────────────

export async function registerTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.sub

  const parsed = DeviceTokenRegisterSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  await notificationService.registerDeviceToken(userId, parsed.data.token, parsed.data.platform)
  logger.info({ userId, platform: parsed.data.platform }, 'Device token registered')
  return reply.code(201).send({ success: true })
}

// ── DELETE /notifications/device-tokens ──────────────────────────────────────

export async function unregisterTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = DeviceTokenUnregisterSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  await notificationService.unregisterDeviceToken(parsed.data.token)
  return reply.code(200).send({ success: true })
}

// ── POST /notifications/broadcast ────────────────────────────────────────────

export async function broadcastHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // P2: Only coaches may trigger team-wide broadcast alerts
  const user = request.user!
  const isCoach = user.roles.some((r) => r.role === 'COACH')
  if (!isCoach) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only coaches can send broadcast alerts',
    })
  }

  const parsed = BroadcastAlertRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const { teamId, type, message } = parsed.data

  // Verify coach is a member of the team they're broadcasting to
  const { prisma } = await import('@diamondhub/db')
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.sub } },
  })
  if (!membership || membership.status !== 'ACTIVE') {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You are not an active member of this team',
    })
  }
  if (!['HEAD_COACH', 'ASSISTANT_COACH'].includes(membership.role)) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Only team coaches can send broadcast alerts',
    })
  }

  const titleMap: Record<string, string> = {
    RAIN_DELAY: 'Rain delay',
    GAME_CANCELLED: 'Game cancelled',
    FIELDS_CLOSED: 'Fields closed',
    ALL_CLEAR: 'All clear',
    WEATHER_ALERT: 'Weather alert',
  }

  await notificationService.sendTeamBroadcast(
    teamId,
    type,
    titleMap[type] ?? type,
    message,
  )

  logger.info({ teamId, type, broadcastBy: user.sub }, 'Team broadcast triggered')
  return reply.code(200).send({ success: true })
}
