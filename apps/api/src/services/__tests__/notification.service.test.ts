// E5 · Notifications & Alerts — Service unit tests
// Mocks: prisma, getNotificationQueue

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notificationService } from '../notification.service.js'
import { prisma } from '@diamondhub/db'

// ── Mock BullMQ queue ─────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' })

vi.mock('@diamondhub/workers', () => ({
  getNotificationQueue: vi.fn(() => ({ add: mockQueueAdd })),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1'
const TEAM_ID = 'team-1'
const EVENT_ID = 'event-1'
const GAME_ID = 'game-1'
const TOURNAMENT_ID = 'tournament-1'

const NOW = new Date('2026-06-01T12:00:00.000Z')

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── sendGameTimeChange ────────────────────────────────────────────────────

  describe('sendGameTimeChange', () => {
    it('enqueues job with correct userIds from RSVPs', async () => {
      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([
        { userId: 'user-a' } as any,
        { userId: 'user-b' } as any,
      ])

      await notificationService.sendGameTimeChange(
        GAME_ID,
        TEAM_ID,
        '10:00 AM',
        '11:00 AM',
        'Field 3',
      )

      expect(mockQueueAdd).toHaveBeenCalledOnce()
      const [jobName, jobData] = mockQueueAdd.mock.calls[0]!
      expect(jobName).toBe('game-time-change')
      expect(jobData.type).toBe('GAME_TIME_CHANGE')
      expect(jobData.userIds).toEqual(['user-a', 'user-b'])
      expect(jobData.body).toContain('10:00 AM')
      expect(jobData.body).toContain('11:00 AM')
      expect(jobData.channels).toContain('sms')
    })

    it('does nothing when no RSVPs found', async () => {
      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([])

      await notificationService.sendGameTimeChange(GAME_ID, TEAM_ID, '10:00 AM', '11:00 AM')

      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it('omits field from body when not provided', async () => {
      vi.mocked(prisma.eventRsvp.findMany).mockResolvedValue([{ userId: USER_ID } as any])

      await notificationService.sendGameTimeChange(GAME_ID, TEAM_ID, '10:00 AM', '11:00 AM')

      const [, jobData] = mockQueueAdd.mock.calls[0]!
      expect(jobData.body).not.toContain(', ')
      expect(jobData.data.field).toBeNull()
    })
  })

  // ── sendTeamBroadcast ─────────────────────────────────────────────────────

  describe('sendTeamBroadcast', () => {
    it('enqueues job with all active team members', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { userId: 'user-a' } as any,
        { userId: 'user-b' } as any,
        { userId: 'user-c' } as any,
      ])

      await notificationService.sendTeamBroadcast(TEAM_ID, 'RAIN_DELAY', 'Rain delay', 'Game delayed 30 min')

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID, status: 'ACTIVE' },
        select: { userId: true },
      })
      expect(mockQueueAdd).toHaveBeenCalledOnce()
      const [, jobData] = mockQueueAdd.mock.calls[0]!
      expect(jobData.userIds).toHaveLength(3)
      expect(jobData.type).toBe('RAIN_DELAY')
      expect(jobData.channels).toContain('push')
      expect(jobData.channels).toContain('sms')
      expect(jobData.channels).toContain('in_app')
    })
  })

  // ── scheduleRsvpReminders ─────────────────────────────────────────────────

  describe('scheduleRsvpReminders', () => {
    beforeEach(() => {
      // scheduleRsvpReminders now queries team members at enqueue time
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { userId: 'player-1' } as any,
        { userId: 'player-2' } as any,
      ])
    })

    it('enqueues 2 delayed jobs for events in the future', async () => {
      // Event is far in the future (10 days from now)
      const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()

      await notificationService.scheduleRsvpReminders(EVENT_ID, TEAM_ID, 'Practice', farFuture)

      expect(mockQueueAdd).toHaveBeenCalledTimes(2)
      const calls = mockQueueAdd.mock.calls
      const jobNames = calls.map((c) => c[0])
      expect(jobNames.some((n: string) => n.startsWith('rsvp-reminder-48h'))).toBe(true)
      expect(jobNames.some((n: string) => n.startsWith('rsvp-reminder-24h'))).toBe(true)

      // Each call should have a positive delay
      for (const call of calls) {
        expect(call[2]?.delay).toBeGreaterThan(0)
      }
    })

    it('skips past delays when event is within 24h', async () => {
      // Event starts in 12 hours — both 48h and 24h windows have passed
      const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()

      await notificationService.scheduleRsvpReminders(EVENT_ID, TEAM_ID, 'Practice', soon)

      expect(mockQueueAdd).not.toHaveBeenCalled()
    })

    it('only enqueues the 24h reminder when event is between 24h and 48h away', async () => {
      // Event starts in 36 hours — 48h window passed, 24h window is valid
      const future36h = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString()

      await notificationService.scheduleRsvpReminders(EVENT_ID, TEAM_ID, 'Game', future36h)

      expect(mockQueueAdd).toHaveBeenCalledTimes(1)
      expect(mockQueueAdd.mock.calls[0]![0]).toMatch(/^rsvp-reminder-24h/)
    })
  })

  // ── getNotifications ──────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns paginated results with unreadCount and total', async () => {
      const mockNotifs = [
        {
          id: 'notif-1',
          type: 'GAME_TIME_CHANGE',
          title: 'Game time changed',
          body: 'New time: 11:00 AM',
          data: {},
          isRead: false,
          createdAt: NOW,
        },
      ]
      vi.mocked(prisma.notification.findMany).mockResolvedValue(mockNotifs as any)
      vi.mocked(prisma.notification.count)
        .mockResolvedValueOnce(1)   // unreadCount
        .mockResolvedValueOnce(5)   // total

      const result = await notificationService.getNotifications(USER_ID, 1, 20)

      expect(result.notifications).toHaveLength(1)
      expect(result.notifications[0]!.id).toBe('notif-1')
      expect(result.notifications[0]!.createdAt).toBe(NOW.toISOString())
      expect(result.unreadCount).toBe(1)
      expect(result.total).toBe(5)

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      })
    })

    it('calculates correct offset for page 2', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([])
      vi.mocked(prisma.notification.count).mockResolvedValue(0)

      await notificationService.getNotifications(USER_ID, 2, 10)

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      )
    })
  })

  // ── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it('calls updateMany with correct filter for specific IDs', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 2 })

      await notificationService.markRead(USER_ID, ['notif-1', 'notif-2'])

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, id: { in: ['notif-1', 'notif-2'] } },
        data: { isRead: true },
      })
    })

    it('marks ALL notifications read when no IDs provided', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 10 })

      await notificationService.markRead(USER_ID)

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: { isRead: true },
      })
    })
  })

  // ── getPreferences ────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('returns DEFAULT_COACH_PREFS for a new COACH user with no stored prefs', async () => {
      vi.mocked(prisma.userNotificationPreference.findUnique).mockResolvedValue(null)

      const { DEFAULT_COACH_PREFS } = await import('@diamondhub/contracts')
      const result = await notificationService.getPreferences(USER_ID, 'COACH')

      expect(result).toEqual(DEFAULT_COACH_PREFS)
    })

    it('returns DEFAULT_PARENT_PREFS for a new PARENT user', async () => {
      vi.mocked(prisma.userNotificationPreference.findUnique).mockResolvedValue(null)

      const { DEFAULT_PARENT_PREFS } = await import('@diamondhub/contracts')
      const result = await notificationService.getPreferences(USER_ID, 'PARENT')

      expect(result).toEqual(DEFAULT_PARENT_PREFS)
    })

    it('returns DEFAULT_PLAYER_PREFS for a new PLAYER user', async () => {
      vi.mocked(prisma.userNotificationPreference.findUnique).mockResolvedValue(null)

      const { DEFAULT_PLAYER_PREFS } = await import('@diamondhub/contracts')
      const result = await notificationService.getPreferences(USER_ID, 'PLAYER')

      expect(result).toEqual(DEFAULT_PLAYER_PREFS)
    })

    it('returns stored prefs when they exist (ignores role defaults)', async () => {
      const storedPrefs = { GAME_TIME_CHANGE: { push: false, sms: true, email: true } }
      vi.mocked(prisma.userNotificationPreference.findUnique).mockResolvedValue({
        preferences: storedPrefs,
      } as any)

      const result = await notificationService.getPreferences(USER_ID, 'COACH')

      expect(result).toEqual(storedPrefs)
    })
  })

  // ── updatePreferences ─────────────────────────────────────────────────────

  describe('updatePreferences', () => {
    it('calls upsert with correct data', async () => {
      vi.mocked(prisma.userNotificationPreference.upsert).mockResolvedValue({} as any)

      const prefs = { GAME_TIME_CHANGE: { push: true, sms: false, email: false } } as any
      await notificationService.updatePreferences(USER_ID, prefs)

      expect(prisma.userNotificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        update: { preferences: prefs },
        create: { userId: USER_ID, preferences: prefs },
      })
    })
  })

  // ── registerDeviceToken ───────────────────────────────────────────────────

  describe('registerDeviceToken', () => {
    it('upserts device token with correct data', async () => {
      vi.mocked(prisma.deviceToken.upsert).mockResolvedValue({
        id: 'dt-1',
        userId: USER_ID,
        token: 'fcm-token-abc',
        platform: 'IOS',
        isActive: true,
      } as any)

      await notificationService.registerDeviceToken(USER_ID, 'fcm-token-abc', 'IOS')

      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'fcm-token-abc' },
        update: { userId: USER_ID, platform: 'IOS', isActive: true },
        create: { userId: USER_ID, token: 'fcm-token-abc', platform: 'IOS' },
      })
    })
  })

  // ── sendWeeklyDigest ──────────────────────────────────────────────────────

  describe('sendWeeklyDigest', () => {
    it('enqueues weekly digest with tournament list', async () => {
      const tournaments = [
        { name: 'Spring Classic', location: 'Dallas, TX', dates: 'Jun 14-15' },
        { name: 'Summer Open', location: 'Houston, TX', dates: 'Jun 21-22' },
      ]

      await notificationService.sendWeeklyDigest(USER_ID, tournaments)

      expect(mockQueueAdd).toHaveBeenCalledOnce()
      const [, jobData] = mockQueueAdd.mock.calls[0]!
      expect(jobData.type).toBe('NEW_TOURNAMENT')
      expect(jobData.userIds).toEqual([USER_ID])
      expect(jobData.channels).toContain('email')
      expect(jobData.body).toContain('Spring Classic')
    })

    it('does not enqueue when tournament list is empty', async () => {
      await notificationService.sendWeeklyDigest(USER_ID, [])

      expect(mockQueueAdd).not.toHaveBeenCalled()
    })
  })
})
