import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleService } from '../schedule.service.js'
import { prisma } from '@diamondhub/db'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-1'
const EVENT_ID = 'event-1'
const USER_ID = 'user-1'
const COACH_ID = 'coach-1'

const NOW = new Date('2026-06-01T10:00:00.000Z')
const IN_RANGE_START = new Date('2026-06-01T09:00:00.000Z')
const IN_RANGE_END = new Date('2026-06-01T11:00:00.000Z')

const baseEvent = {
  id: EVENT_ID,
  teamId: TEAM_ID,
  tournamentRegistrationId: null,
  type: 'PRACTICE' as const,
  title: 'Morning Practice',
  locationName: 'Thunder Field',
  locationAddress: '123 Main St, Dallas TX',
  lat: null,
  lng: null,
  startTime: IN_RANGE_START,
  endTime: IN_RANGE_END,
  notes: null,
  isCancelled: false,
  cancelledAt: null,
  cancelledBy: null,
  sendNotification: true,
  createdBy: COACH_ID,
  createdAt: NOW,
  updatedAt: NOW,
}

const baseEventWithRsvps = {
  ...baseEvent,
  _count: { rsvps: 2 },
  rsvps: [
    { status: 'YES' as const, userId: 'user-a' },
    { status: 'NO' as const, userId: 'user-b' },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scheduleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── getTeamEvents ──────────────────────────────────────────────────────────

  describe('getTeamEvents', () => {
    it('returns events in date range ordered by startTime', async () => {
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([baseEventWithRsvps] as any)

      const result = await scheduleService.getTeamEvents(
        TEAM_ID,
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      )

      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: TEAM_ID,
            startTime: { gte: expect.any(Date) },
            endTime: { lte: expect.any(Date) },
          }),
          orderBy: { startTime: 'asc' },
        }),
      )
      expect(result).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const first = result[0]!
      expect(first.id).toBe(EVENT_ID)
      expect(first.startTime).toBe(IN_RANGE_START.toISOString())
      expect(first.endTime).toBe(IN_RANGE_END.toISOString())
    })

    it('includes cancelled events in results', async () => {
      const cancelledEvent = {
        ...baseEventWithRsvps,
        isCancelled: true,
        cancelledAt: NOW,
        cancelledBy: COACH_ID,
      }
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([cancelledEvent] as any)

      const result = await scheduleService.getTeamEvents(
        TEAM_ID,
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      )

      expect(result).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const first = result[0]!
      expect(first.isCancelled).toBe(true)
      expect(first.cancelledAt).toBe(NOW.toISOString())
    })

    it('maps rsvpCounts correctly from rsvps array', async () => {
      const eventWithMultipleRsvps = {
        ...baseEvent,
        _count: { rsvps: 4 },
        rsvps: [
          { status: 'YES' as const, userId: 'u1' },
          { status: 'YES' as const, userId: 'u2' },
          { status: 'NO' as const, userId: 'u3' },
          { status: 'MAYBE' as const, userId: 'u4' },
        ],
      }
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([eventWithMultipleRsvps] as any)

      const result = await scheduleService.getTeamEvents(TEAM_ID, new Date(), new Date())

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result[0]!.rsvpCounts).toEqual({ yes: 2, no: 1, maybe: 1, noResponse: 0 })
    })

    it('returns empty array when no events found', async () => {
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])

      const result = await scheduleService.getTeamEvents(TEAM_ID, new Date(), new Date())

      expect(result).toEqual([])
    })
  })

  // ── getUserEvents ──────────────────────────────────────────────────────────

  describe('getUserEvents', () => {
    it('queries events for all user teams', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { teamId: 'team-1', role: 'HEAD_COACH' as const },
        { teamId: 'team-2', role: 'PLAYER' as const },
      ] as any)

      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])

      await scheduleService.getUserEvents(USER_ID, new Date(), new Date())

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, status: 'ACTIVE' },
        select: { teamId: true, role: true },
      })

      expect(prisma.scheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: { in: ['team-1', 'team-2'] },
          }),
        }),
      )
    })

    it('attaches userRsvp from the user own RSVP record', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { teamId: TEAM_ID, role: 'PLAYER' as const },
      ] as any)

      const eventWithUserRsvp = {
        ...baseEvent,
        team: { id: TEAM_ID, name: 'Thunder Hawks', sport: 'BASEBALL' as const },
        rsvps: [{ status: 'YES' as const }],
      }
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([eventWithUserRsvp] as any)

      const result = await scheduleService.getUserEvents(USER_ID, new Date(), new Date())

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result[0]!.userRsvp).toBe('YES')
    })

    it('sets userRsvp to null when user has not responded', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { teamId: TEAM_ID, role: 'PLAYER' as const },
      ] as any)

      const eventNoRsvp = {
        ...baseEvent,
        team: { id: TEAM_ID, name: 'Thunder Hawks', sport: 'BASEBALL' as const },
        rsvps: [],
      }
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([eventNoRsvp] as any)

      const result = await scheduleService.getUserEvents(USER_ID, new Date(), new Date())

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result[0]!.userRsvp).toBeNull()
    })

    it('returns empty array when user has no team memberships', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([])
      vi.mocked(prisma.scheduleEvent.findMany).mockResolvedValue([])

      const result = await scheduleService.getUserEvents(USER_ID, new Date(), new Date())

      expect(result).toEqual([])
    })
  })

  // ── createEvent ────────────────────────────────────────────────────────────

  describe('createEvent', () => {
    it('creates event with correct data mapping', async () => {
      vi.mocked(prisma.scheduleEvent.create).mockResolvedValue(baseEvent as any)

      const data = {
        title: 'Morning Practice',
        type: 'PRACTICE' as const,
        startTime: IN_RANGE_START.toISOString(),
        endTime: IN_RANGE_END.toISOString(),
        sendNotification: true,
      }

      const result = await scheduleService.createEvent(TEAM_ID, COACH_ID, data)

      expect(prisma.scheduleEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamId: TEAM_ID,
          type: 'PRACTICE',
          title: 'Morning Practice',
          createdBy: COACH_ID,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          sendNotification: true,
          locationName: null,
          locationAddress: null,
          lat: null,
          lng: null,
          notes: null,
        }),
      })
      expect(result).toEqual(baseEvent)
    })

    it('maps optional fields correctly when provided', async () => {
      vi.mocked(prisma.scheduleEvent.create).mockResolvedValue(baseEvent as any)

      const data = {
        title: 'Game vs Eagles',
        type: 'GAME' as const,
        startTime: IN_RANGE_START.toISOString(),
        endTime: IN_RANGE_END.toISOString(),
        locationName: 'Eagle Stadium',
        locationAddress: '456 Park Ave',
        lat: 32.7767,
        lng: -96.797,
        notes: 'Bring extra balls',
        sendNotification: true,
      }

      await scheduleService.createEvent(TEAM_ID, COACH_ID, data)

      expect(prisma.scheduleEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locationName: 'Eagle Stadium',
          locationAddress: '456 Park Ave',
          lat: 32.7767,
          lng: -96.797,
          notes: 'Bring extra balls',
        }),
      })
    })
  })

  // ── updateEvent ────────────────────────────────────────────────────────────

  describe('updateEvent', () => {
    it('calls prisma.scheduleEvent.update with correct where clause', async () => {
      vi.mocked(prisma.scheduleEvent.update).mockResolvedValue(baseEvent as any)

      await scheduleService.updateEvent(EVENT_ID, TEAM_ID, { title: 'Updated Title' })

      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EVENT_ID, teamId: TEAM_ID },
        }),
      )
    })

    it('maps updated fields correctly', async () => {
      vi.mocked(prisma.scheduleEvent.update).mockResolvedValue(baseEvent as any)

      const updates = {
        title: 'Updated Practice',
        notes: 'New notes',
        startTime: IN_RANGE_START.toISOString(),
        endTime: IN_RANGE_END.toISOString(),
      }

      await scheduleService.updateEvent(EVENT_ID, TEAM_ID, updates)

      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Updated Practice',
            notes: 'New notes',
            startTime: new Date(updates.startTime),
            endTime: new Date(updates.endTime),
          }),
        }),
      )
    })

    it('does not overwrite startTime/endTime when not provided', async () => {
      vi.mocked(prisma.scheduleEvent.update).mockResolvedValue(baseEvent as any)

      await scheduleService.updateEvent(EVENT_ID, TEAM_ID, { title: 'Only title' })

      const callArg = vi.mocked(prisma.scheduleEvent.update).mock.calls[0]?.[0] as any
      expect(callArg.data.startTime).toBeUndefined()
      expect(callArg.data.endTime).toBeUndefined()
    })
  })

  // ── cancelEvent ────────────────────────────────────────────────────────────

  describe('cancelEvent', () => {
    it('sets isCancelled=true, cancelledAt, and cancelledBy', async () => {
      const cancelledEvent = {
        ...baseEvent,
        isCancelled: true,
        cancelledAt: NOW,
        cancelledBy: COACH_ID,
      }
      vi.mocked(prisma.scheduleEvent.update).mockResolvedValue(cancelledEvent as any)

      const result = await scheduleService.cancelEvent(EVENT_ID, TEAM_ID, COACH_ID)

      expect(prisma.scheduleEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID, teamId: TEAM_ID },
        data: expect.objectContaining({
          isCancelled: true,
          cancelledAt: expect.any(Date),
          cancelledBy: COACH_ID,
        }),
      })
      expect(result.isCancelled).toBe(true)
      expect(result.cancelledBy).toBe(COACH_ID)
    })
  })

  // ── generateIcs ────────────────────────────────────────────────────────────

  describe('generateIcs', () => {
    const sampleEvent = {
      id: EVENT_ID,
      title: 'Morning Practice',
      startTime: '2026-06-01T09:00:00.000Z',
      endTime: '2026-06-01T11:00:00.000Z',
      locationAddress: '123 Main St' as string | null,
      locationName: 'Thunder Field' as string | null,
      notes: null as string | null,
      isCancelled: false,
    }

    const sampleEvents = [sampleEvent]

    it('contains BEGIN:VCALENDAR and END:VCALENDAR', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).toContain('BEGIN:VCALENDAR')
      expect(ics).toContain('END:VCALENDAR')
    })

    it('contains VEVENT with correct UID format', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).toContain('BEGIN:VEVENT')
      expect(ics).toContain('END:VEVENT')
      expect(ics).toContain(`UID:${EVENT_ID}@diamondhub.app`)
    })

    it('contains correct SUMMARY and LOCATION', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).toContain('SUMMARY:Morning Practice')
      expect(ics).toContain('LOCATION:123 Main St')
    })

    it('marks cancelled events with STATUS:CANCELLED', () => {
      const cancelledEvents = [{ ...sampleEvent, isCancelled: true }]
      const ics = scheduleService.generateIcs(cancelledEvents, 'Thunder Hawks')
      expect(ics).toContain('STATUS:CANCELLED')
    })

    it('does NOT include STATUS:CANCELLED for active events', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).not.toContain('STATUS:CANCELLED')
    })

    it('escapes special characters in title', () => {
      const eventsWithSpecialChars = [
        { ...sampleEvent, title: 'Game vs Eagles; Home,Away\\Backslash' },
      ]
      const ics = scheduleService.generateIcs(eventsWithSpecialChars, 'Thunder Hawks')
      expect(ics).toContain('SUMMARY:Game vs Eagles\\; Home\\,Away\\\\Backslash')
    })

    it('escapes special characters in description/notes', () => {
      const eventsWithNotes = [
        {
          ...sampleEvent,
          notes: 'Bring: water, snacks; check availability' as string | null,
        },
      ]
      const ics = scheduleService.generateIcs(eventsWithNotes, 'Thunder Hawks')
      expect(ics).toContain('DESCRIPTION:Bring: water\\, snacks\\; check availability')
    })

    it('does not include DESCRIPTION line when notes is null', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).not.toContain('DESCRIPTION:')
    })

    it('includes calendar name in X-WR-CALNAME', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).toContain('X-WR-CALNAME:Thunder Hawks')
    })

    it('uses CRLF line endings as per RFC 5545', () => {
      const ics = scheduleService.generateIcs(sampleEvents, 'Thunder Hawks')
      expect(ics).toContain('\r\n')
    })

    it('generates empty calendar body when no events', () => {
      const ics = scheduleService.generateIcs([], 'Empty Calendar')
      expect(ics).toContain('BEGIN:VCALENDAR')
      expect(ics).toContain('END:VCALENDAR')
      expect(ics).not.toContain('BEGIN:VEVENT')
    })
  })
})
