// E8 · Conflict Detection — Service
// Warning-only: never blocks create/update actions
// Runs synchronously on event create/edit (fast — pure DB query)

import { prisma } from '@diamondhub/db'
import { logger } from '../lib/logger.js'

interface ConflictResult {
  hasConflict: boolean
  conflicts: Array<{
    type: 'PLAYER' | 'COACH'
    conflictingEventId: string
    conflictingEventTitle: string
    conflictingEventStart: string
    conflictingEventEnd: string
    playersAffected: string[]
    overlapMinutes: number
  }>
}

export const conflictService = {

  // E8-S1: Check if a new/updated event conflicts with existing events
  async checkEventConflicts(
    teamId: string,
    userId: string,  // the coach checking
    startTime: Date,
    endTime: Date,
    excludeEventId?: string,
  ): Promise<ConflictResult> {
    // Get all events that overlap in time for this team's members
    const overlappingEvents = await prisma.scheduleEvent.findMany({
      where: {
        id: excludeEventId ? { not: excludeEventId } : undefined,
        teamId,
        isCancelled: false,
        // Overlap condition: existing.start < new.end AND existing.end > new.start
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true, title: true, startTime: true, endTime: true, teamId: true },
    })

    if (overlappingEvents.length === 0) {
      // Still check across teams
    }

    const conflicts: ConflictResult['conflicts'] = []

    for (const existing of overlappingEvents) {
      const overlapStart = Math.max(startTime.getTime(), existing.startTime.getTime())
      const overlapEnd = Math.min(endTime.getTime(), existing.endTime.getTime())
      const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000)

      conflicts.push({
        type: 'COACH',
        conflictingEventId: existing.id,
        conflictingEventTitle: existing.title,
        conflictingEventStart: existing.startTime.toISOString(),
        conflictingEventEnd: existing.endTime.toISOString(),
        playersAffected: [],
        overlapMinutes,
      })
    }

    // Also check across teams for the same coach
    const coachOtherTeams = await prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE', role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] }, teamId: { not: teamId } },
      select: { teamId: true },
    })

    for (const { teamId: otherTeamId } of coachOtherTeams) {
      const otherOverlaps = await prisma.scheduleEvent.findMany({
        where: {
          teamId: otherTeamId,
          isCancelled: false,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      })

      for (const existing of otherOverlaps) {
        const overlapStart = Math.max(startTime.getTime(), existing.startTime.getTime())
        const overlapEnd = Math.min(endTime.getTime(), existing.endTime.getTime())
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000)

        conflicts.push({
          type: 'COACH',
          conflictingEventId: existing.id,
          conflictingEventTitle: existing.title,
          conflictingEventStart: existing.startTime.toISOString(),
          conflictingEventEnd: existing.endTime.toISOString(),
          playersAffected: [],
          overlapMinutes,
        })
      }
    }

    // Log conflicts for dashboard queries
    if (conflicts.length > 0) {
      logger.info({ userId, teamId, conflictCount: conflicts.length }, 'Conflicts detected')
    }

    return { hasConflict: conflicts.length > 0, conflicts }
  },

  // E8-S2: Get conflicts for coach dashboard
  async getConflictsForUser(userId: string) {
    return prisma.conflictRecord.findMany({
      where: { userId, resolvedAt: null },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    })
  },

  // E8-S3: RSVP conflict check — warn parent when RSVPing to overlapping event
  async checkRsvpConflict(userId: string, eventId: string): Promise<{
    hasConflict: boolean
    conflictingEvents: Array<{ id: string; title: string; startTime: string; teamName: string }>
  }> {
    const event = await prisma.scheduleEvent.findUnique({
      where: { id: eventId },
      select: { startTime: true, endTime: true, teamId: true },
    })
    if (!event) return { hasConflict: false, conflictingEvents: [] }

    // Find all YES RSVPs for this user that overlap
    const confirmedRsvps = await prisma.eventRsvp.findMany({
      where: {
        userId,
        status: 'YES',
        eventId: { not: eventId },
        event: {
          isCancelled: false,
          startTime: { lt: event.endTime },
          endTime: { gt: event.startTime },
        },
      },
      include: {
        event: {
          select: { id: true, title: true, startTime: true, team: { select: { name: true } } },
        },
      },
    })

    const conflictingEvents = confirmedRsvps.map(r => ({
      id: r.event.id,
      title: r.event.title,
      startTime: r.event.startTime.toISOString(),
      teamName: r.event.team.name,
    }))

    return { hasConflict: conflictingEvents.length > 0, conflictingEvents }
  },

  // Mark conflict resolved
  async resolveConflict(conflictId: string, userId: string) {
    return prisma.conflictRecord.update({
      where: { id: conflictId, userId },
      data: { resolvedAt: new Date(), resolvedBy: userId },
    })
  },
}
