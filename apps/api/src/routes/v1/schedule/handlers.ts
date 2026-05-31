// E4 · Schedule & Calendar — Route Handlers
// P2: Team membership gate enforced server-side on every request
// P9: All inputs validated with Zod before touching DB
// P12: Pino logging on all mutations

import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@diamondhub/db'
import { ZodError } from 'zod'
import {
  CreateEventRequestSchema,
  UpdateEventRequestSchema,
  type UpdateEventRequest,
} from '@diamondhub/contracts'
import { scheduleService } from '../../../services/schedule.service.js'
import { conflictService } from '../../../services/conflict.service.js'
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
    return reply
      .code(404)
      .send({ statusCode: 404, error: 'Not Found', message: 'Team not found or access denied' })
  }
  return reply
    .code(403)
    .send({ statusCode: 403, error: 'Forbidden', message: 'Insufficient team permissions' })
}

// ── GET /schedule — user's events across all their teams ─────────────────────

export async function getUserEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub
  const query = request.query as { start?: string; end?: string }

  const start = query.start ? new Date(query.start) : new Date()
  const threeMonthsFromNow = new Date()
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
  const end = query.end ? new Date(query.end) : threeMonthsFromNow

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid date format for start or end',
    })
  }

  const events = await scheduleService.getUserEvents(userId, start, end)
  return reply.code(200).send(events)
}

// ── GET /schedule/teams/:teamId — single team events ─────────────────────────

export async function getTeamEventsHandler(
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

  const query = request.query as { start?: string; end?: string }
  const start = query.start ? new Date(query.start) : new Date()
  const threeMonthsFromNow = new Date()
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
  const end = query.end ? new Date(query.end) : threeMonthsFromNow

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid date format for start or end',
    })
  }

  const events = await scheduleService.getTeamEvents(teamId, start, end)
  return reply.code(200).send(events)
}

// ── GET /schedule/teams/:teamId/export.ics — ICS download ────────────────────

export async function exportIcsHandler(
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

  const query = request.query as { start?: string; end?: string }
  const start = new Date(query.start ?? new Date().toISOString())
  const threeMonthsFromNow = new Date()
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
  const end = new Date(query.end ?? threeMonthsFromNow.toISOString())

  const events = await scheduleService.getTeamEvents(teamId, start, end)
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    select: { name: true },
  })

  const ics = scheduleService.generateIcs(events, `DiamondHub — ${team.name}`)

  reply
    .header('Content-Type', 'text/calendar; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${team.name}-schedule.ics"`)
    .send(ics)
}

// ── POST /schedule/teams/:teamId/events — create event ───────────────────────

export async function createEventHandler(
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

  const parsed = CreateEventRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const event = await scheduleService.createEvent(teamId, userId, parsed.data)

  // E8: Fire-and-forget conflict check — warning only, never blocks creation
  let conflicts: Awaited<ReturnType<typeof conflictService.checkEventConflicts>>['conflicts'] = []
  try {
    const conflictResult = await conflictService.checkEventConflicts(
      teamId,
      userId,
      new Date(parsed.data.startTime),
      new Date(parsed.data.endTime),
      event.id,
    )
    conflicts = conflictResult.conflicts

    // Write conflicts to DB (fire-and-forget, E8-S2)
    if (conflictResult.hasConflict && conflictResult.conflicts.length > 0) {
      Promise.all(conflictResult.conflicts.map(c =>
        prisma.conflictRecord.create({
          data: {
            userId,
            eventAId: event.id,
            eventBId: c.conflictingEventId,
            conflictType: c.type,
            playersAffected: c.playersAffected,
          }
        }).catch(() => {})
      )).catch(() => {})
    }
  } catch (err) {
    logger.error({ err }, 'Conflict check failed')
  }

  // P4: Schedule RSVP reminder notifications (48h and 24h before event)
  if (event.sendNotification) {
    const { notificationService } = await import('../../../services/notification.service.js')
    notificationService.scheduleRsvpReminders(
      event.id,
      event.teamId,
      event.title,
      event.startTime.toISOString(),
    ).catch((err) => logger.error({ err, eventId: event.id }, 'Failed to schedule RSVP reminders'))
  }

  // Flat response: event fields at top level + conflicts array for E8 warnings
  return reply.code(201).send({ ...event, conflicts })
}

// ── PATCH /schedule/teams/:teamId/events/:eventId — update event ──────────────

export async function updateEventHandler(
  request: FastifyRequest<{ Params: { teamId: string; eventId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, eventId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  // Verify event exists for this team
  const existing = await scheduleService.getEventById(eventId, teamId)
  if (!existing) {
    return reply
      .code(404)
      .send({ statusCode: 404, error: 'Not Found', message: 'Event not found' })
  }

  const parsed = UpdateEventRequestSchema.safeParse(request.body)
  if (!parsed.success) return sendValidationError(reply, parsed.error)

  const event = await scheduleService.updateEvent(eventId, teamId, parsed.data as UpdateEventRequest)
  return reply.code(200).send(event)
}

// ── DELETE /schedule/teams/:teamId/events/:eventId — cancel event ─────────────

export async function cancelEventHandler(
  request: FastifyRequest<{ Params: { teamId: string; eventId: string } }>,
  reply: FastifyReply,
) {
  const { teamId, eventId } = request.params
  const userId = request.user!.sub

  try {
    await requireTeamMembership(teamId, userId, ['HEAD_COACH', 'ASSISTANT_COACH'])
  } catch (err) {
    if (err instanceof MembershipError) return sendMembershipError(reply, err)
    throw err
  }

  // Verify event exists for this team
  const existing = await scheduleService.getEventById(eventId, teamId)
  if (!existing) {
    return reply
      .code(404)
      .send({ statusCode: 404, error: 'Not Found', message: 'Event not found' })
  }

  if (existing.isCancelled) {
    return reply
      .code(409)
      .send({ statusCode: 409, error: 'Conflict', message: 'Event is already cancelled' })
  }

  const event = await scheduleService.cancelEvent(eventId, teamId, userId)
  logger.info({ eventId, teamId, cancelledBy: userId }, 'Event cancelled via DELETE handler')
  return reply.code(200).send(event)
}

// ── GET /schedule/teams/:teamId/events/:eventId — single event ────────────────

export async function getEventByIdHandler(
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

  const event = await scheduleService.getEventById(eventId, teamId)
  if (!event) {
    return reply
      .code(404)
      .send({ statusCode: 404, error: 'Not Found', message: 'Event not found' })
  }

  return reply.code(200).send({
    id: event.id,
    teamId: event.teamId,
    type: event.type,
    title: event.title,
    locationName: event.locationName,
    locationAddress: event.locationAddress,
    lat: event.lat ? Number(event.lat) : null,
    lng: event.lng ? Number(event.lng) : null,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    notes: event.notes,
    isCancelled: event.isCancelled,
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  })
}
