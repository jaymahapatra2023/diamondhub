// E8 · Conflict Detection — Service Unit Tests

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { conflictService } from '../conflict.service.js'
import { prisma } from '@diamondhub/db'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-coach-1'
const TEAM_ID = 'team-1'
const OTHER_TEAM_ID = 'team-2'
const EVENT_ID = 'event-1'
const OTHER_EVENT_ID = 'event-2'
const CONFLICT_ID = 'conflict-1'

const NOW = new Date('2026-06-01T10:00:00.000Z')
const START = new Date('2026-06-01T09:00:00.000Z')
const END = new Date('2026-06-01T11:00:00.000Z')

// An overlapping event: 09:30 - 10:30 (overlaps with 09:00-11:00)
const overlappingEvent = {
  id: OTHER_EVENT_ID,
  title: 'Other Practice',
  teamId: TEAM_ID,
  startTime: new Date('2026-06-01T09:30:00.000Z'),
  endTime: new Date('2026-06-01T10:30:00.000Z'),
}

// A non-overlapping event: 11:30 - 12:30 (does not overlap)
const nonOverlappingEvent = {
  id: 'event-3',
  title: 'Afternoon Practice',
  teamId: TEAM_ID,
  startTime: new Date('2026-06-01T11:30:00.000Z'),
  endTime: new Date('2026-06-01T12:30:00.000Z'),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('conflictService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── checkEventConflicts ────────────────────────────────────────────────────

  describe('checkEventConflicts', () => {
    it('returns no conflicts when no overlapping events exist', async () => {
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])

      const result = await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END)

      expect(result.hasConflict).toBe(false)
      expect(result.conflicts).toHaveLength(0)
    })

    it('detects overlapping event on same team', async () => {
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([overlappingEvent] as any)
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])

      const result = await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END)

      expect(result.hasConflict).toBe(true)
      expect(result.conflicts).toHaveLength(1)
      const conflict = result.conflicts[0]!
      expect(conflict.type).toBe('COACH')
      expect(conflict.conflictingEventId).toBe(OTHER_EVENT_ID)
      expect(conflict.conflictingEventTitle).toBe('Other Practice')
      expect(conflict.overlapMinutes).toBe(60) // 09:30-10:30 overlap with 09:00-11:00 = 60 min
    })

    it('detects coach conflict across teams', async () => {
      // No same-team conflicts
      vi.mocked(prisma.scheduleEvent.findMany)
        .mockResolvedValueOnce([]) // same team query
        .mockResolvedValueOnce([overlappingEvent] as any) // other team query

      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { teamId: OTHER_TEAM_ID },
      ] as any)

      const result = await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END)

      expect(result.hasConflict).toBe(true)
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]!.type).toBe('COACH')
    })

    it('excludes the event being edited (excludeEventId)', async () => {
      // Simulate: scheduleEvent.findMany query includes NOT condition for excludeEventId
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])

      const result = await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END, EVENT_ID)

      // Verify the exclusion was passed to the query
      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: EVENT_ID },
          }),
        }),
      )
      expect(result.hasConflict).toBe(false)
    })

    it('does not pass id filter when excludeEventId is undefined', async () => {
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])

      await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END)

      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: undefined,
          }),
        }),
      )
    })

    it('calculates overlapMinutes correctly for partial overlap', async () => {
      const partialOverlap = {
        id: 'event-4',
        title: 'Partial Overlap',
        teamId: TEAM_ID,
        startTime: new Date('2026-06-01T10:30:00.000Z'), // 30 min overlap
        endTime: new Date('2026-06-01T12:00:00.000Z'),
      }
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([partialOverlap] as any)
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])

      const result = await conflictService.checkEventConflicts(TEAM_ID, USER_ID, START, END)

      expect(result.conflicts[0]!.overlapMinutes).toBe(30)
    })
  })

  // ── checkRsvpConflict ──────────────────────────────────────────────────────

  describe('checkRsvpConflict', () => {
    it('returns conflicts when YES RSVPs overlap', async () => {
      vi.mocked(prisma.scheduleEvent.findUnique).mockResolvedValue({
        startTime: START,
        endTime: END,
        teamId: TEAM_ID,
      } as any)

      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([
        {
          event: {
            id: OTHER_EVENT_ID,
            title: 'Team 2 Practice',
            startTime: new Date('2026-06-01T09:30:00.000Z'),
            team: { name: 'Thunder Hawks B' },
          },
        },
      ] as any)

      const result = await conflictService.checkRsvpConflict(USER_ID, EVENT_ID)

      expect(result.hasConflict).toBe(true)
      expect(result.conflictingEvents).toHaveLength(1)
      expect(result.conflictingEvents[0]!.id).toBe(OTHER_EVENT_ID)
      expect(result.conflictingEvents[0]!.teamName).toBe('Thunder Hawks B')
    })

    it('returns no conflict for non-overlapping events', async () => {
      vi.mocked(prisma.scheduleEvent.findUnique).mockResolvedValue({
        startTime: START,
        endTime: END,
        teamId: TEAM_ID,
      } as any)

      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([])

      const result = await conflictService.checkRsvpConflict(USER_ID, EVENT_ID)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingEvents).toHaveLength(0)
    })

    it('returns no conflict when event does not exist', async () => {
      vi.mocked(prisma.scheduleEvent.findUnique).mockResolvedValue(null)

      const result = await conflictService.checkRsvpConflict(USER_ID, EVENT_ID)

      expect(result.hasConflict).toBe(false)
      expect(result.conflictingEvents).toHaveLength(0)
      expect(prisma.eventRsvp.findMany).not.toHaveBeenCalled()
    })
  })

  // ── resolveConflict ────────────────────────────────────────────────────────

  describe('resolveConflict', () => {
    it('updates record with resolvedAt and resolvedBy', async () => {
      const resolved = {
        id: CONFLICT_ID,
        userId: USER_ID,
        resolvedAt: NOW,
        resolvedBy: USER_ID,
      }
      vi.mocked(prisma.conflictRecord.update).mockResolvedValue(resolved as any)

      const result = await conflictService.resolveConflict(CONFLICT_ID, USER_ID)

      expect(prisma.conflictRecord.update).toHaveBeenCalledWith({
        where: { id: CONFLICT_ID, userId: USER_ID },
        data: {
          resolvedAt: expect.any(Date),
          resolvedBy: USER_ID,
        },
      })
      expect(result.resolvedBy).toBe(USER_ID)
    })
  })

  // ── getConflictsForUser ────────────────────────────────────────────────────

  describe('getConflictsForUser', () => {
    it('queries unresolved conflicts ordered by detectedAt desc', async () => {
      vi.mocked(prisma.conflictRecord.findMany).mockResolvedValue([])

      await conflictService.getConflictsForUser(USER_ID)

      expect(prisma.conflictRecord.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, resolvedAt: null },
        orderBy: { detectedAt: 'desc' },
        take: 50,
      })
    })
  })
})
