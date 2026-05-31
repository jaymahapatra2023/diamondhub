// E4 · Schedule & Calendar — Service Layer
// P12: Pino logging on all mutations
// P4: Notifications enqueued via Bull queue (E5) — never inline
// P9: Types from @diamondhub/contracts

import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'
import type { CreateEventRequest, UpdateEventRequest } from '@diamondhub/contracts'

export const scheduleService = {

  // E4-S1: Get events for a team within date range
  async getTeamEvents(teamId: string, start: Date, end: Date) {
    const events = await prisma.scheduleEvent.findMany({
      where: {
        teamId,
        startTime: { gte: start },
        endTime: { lte: end },
        // Include cancelled events (shown as struck-through per E4-S3 AC)
      },
      include: {
        _count: { select: { rsvps: true } },
        rsvps: {
          select: { status: true, userId: true },
        },
      },
      orderBy: { startTime: 'asc' },
    })

    return events.map((e) => ({
      id: e.id,
      teamId: e.teamId,
      type: e.type,
      title: e.title,
      locationName: e.locationName,
      locationAddress: e.locationAddress,
      lat: e.lat ? Number(e.lat) : null,
      lng: e.lng ? Number(e.lng) : null,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      notes: e.notes,
      isCancelled: e.isCancelled,
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
      rsvpCounts: {
        yes: e.rsvps.filter((r) => r.status === 'YES').length,
        no: e.rsvps.filter((r) => r.status === 'NO').length,
        maybe: e.rsvps.filter((r) => r.status === 'MAYBE').length,
        noResponse: 0, // calculated per-request relative to team size
      },
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  },

  // Get events for ALL teams a user is on (multi-team calendar view)
  async getUserEvents(userId: string, start: Date, end: Date) {
    // Get all teams user is an active member of
    const memberships = await prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { teamId: true, role: true },
    })
    const teamIds = memberships.map((m) => m.teamId)

    const events = await prisma.scheduleEvent.findMany({
      where: {
        teamId: { in: teamIds },
        startTime: { gte: start },
        endTime: { lte: end },
      },
      include: {
        team: { select: { id: true, name: true, sport: true } },
        rsvps: { where: { userId }, select: { status: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    return events.map((e) => ({
      id: e.id,
      teamId: e.teamId,
      teamName: e.team.name,
      teamSport: e.team.sport,
      type: e.type,
      title: e.title,
      locationName: e.locationName,
      locationAddress: e.locationAddress,
      lat: e.lat ? Number(e.lat) : null,
      lng: e.lng ? Number(e.lng) : null,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      notes: e.notes,
      isCancelled: e.isCancelled,
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
      userRsvp: e.rsvps[0]?.status ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  },

  // E4-S2: Create event
  async createEvent(teamId: string, createdBy: string, data: CreateEventRequest) {
    const event = await prisma.scheduleEvent.create({
      data: {
        teamId,
        type: data.type,
        title: data.title,
        locationName: data.locationName ?? null,
        locationAddress: data.locationAddress ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        notes: data.notes ?? null,
        sendNotification: data.sendNotification,
        createdBy,
      },
    })
    logger.info({ eventId: event.id, teamId, createdBy }, 'Schedule event created')

    // P4: Enqueue event creation notification via Bull queue
    if (event.sendNotification) {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: event.teamId, status: 'ACTIVE' },
        select: { userId: true },
      })
      const userIds = teamMembers.map(m => m.userId)
      if (userIds.length > 0) {
        const { getNotificationQueue } = await import('@diamondhub/workers')
        await getNotificationQueue().add('event-created', {
          type: 'TEAM_ANNOUNCEMENT',
          userIds,
          title: `New event: ${event.title}`,
          body: `${event.type.toLowerCase()} on ${new Date(event.startTime).toLocaleDateString()}`,
          data: { eventId: event.id, teamId: event.teamId, type: event.type },
          channels: ['push', 'in_app'],
        })
      }
    }

    return event
  },

  // E4-S3: Edit event
  async updateEvent(eventId: string, teamId: string, data: UpdateEventRequest) {
    // Build update payload only with fields that are present to satisfy exactOptionalPropertyTypes
    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData['title'] = data.title
    if (data.type !== undefined) updateData['type'] = data.type
    if (data.locationName !== undefined) updateData['locationName'] = data.locationName
    if (data.locationAddress !== undefined) updateData['locationAddress'] = data.locationAddress
    if (data.lat !== undefined) updateData['lat'] = data.lat
    if (data.lng !== undefined) updateData['lng'] = data.lng
    if (data.startTime !== undefined) updateData['startTime'] = new Date(data.startTime)
    if (data.endTime !== undefined) updateData['endTime'] = new Date(data.endTime)
    if (data.notes !== undefined) updateData['notes'] = data.notes
    if (data.sendNotification !== undefined) updateData['sendNotification'] = data.sendNotification

    const event = await prisma.scheduleEvent.update({
      where: { id: eventId, teamId },
      data: updateData,
    })
    logger.info({ eventId, teamId }, 'Schedule event updated')
    return event
  },

  // E4-S3: Cancel event (soft delete — shows as struck-through)
  async cancelEvent(eventId: string, teamId: string, cancelledBy: string) {
    const event = await prisma.scheduleEvent.update({
      where: { id: eventId, teamId },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelledBy,
      },
    })
    logger.info({ eventId, teamId, cancelledBy }, 'Schedule event cancelled')

    // P4: Enqueue cancellation notification
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: event.teamId, status: 'ACTIVE' },
      select: { userId: true },
    })
    const userIds = teamMembers.map(m => m.userId)
    if (userIds.length > 0) {
      const { getNotificationQueue } = await import('@diamondhub/workers')
      await getNotificationQueue().add('event-cancelled', {
        type: 'GAME_CANCELLED',
        userIds,
        title: `Event cancelled: ${event.title}`,
        body: `The ${event.type.toLowerCase()} on ${new Date(event.startTime).toLocaleDateString()} has been cancelled.`,
        data: { eventId: event.id, teamId: event.teamId },
        channels: ['push', 'sms', 'in_app'],
      })
    }

    return event
  },

  async getEventById(eventId: string, teamId: string) {
    return prisma.scheduleEvent.findUnique({
      where: { id: eventId, teamId },
    })
  },

  // E4-S4: Generate ICS file content (RFC 5545)
  generateIcs(
    events: Array<{
      id: string
      title: string
      startTime: string
      endTime: string
      locationAddress?: string | null
      locationName?: string | null
      notes?: string | null
      isCancelled: boolean
    }>,
    calendarName: string,
  ): string {
    const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const escapeIcs = (s: string) => s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')

    const vevents = events
      .map((e) => {
        const lines = [
          'BEGIN:VEVENT',
          `UID:${e.id}@diamondhub.app`,
          `DTSTAMP:${icsDate(new Date().toISOString())}Z`,
          `DTSTART:${icsDate(e.startTime)}`,
          `DTEND:${icsDate(e.endTime)}`,
          `SUMMARY:${escapeIcs(e.title)}`,
        ]
        if (e.locationAddress) lines.push(`LOCATION:${escapeIcs(e.locationAddress)}`)
        if (e.notes) lines.push(`DESCRIPTION:${escapeIcs(e.notes)}`)
        if (e.isCancelled) lines.push('STATUS:CANCELLED')
        lines.push('END:VEVENT')
        return lines.join('\r\n')
      })
      .join('\r\n')

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DiamondHub//DiamondHub//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcs(calendarName)}`,
      'X-WR-TIMEZONE:America/New_York',
      vevents,
      'END:VCALENDAR',
    ].join('\r\n')
  },
}
