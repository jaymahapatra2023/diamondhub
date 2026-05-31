// E5 · Notifications & Alerts — Service Layer
// P4: API handler → DB write → notificationQueue.add(job) → return 200
// P9: Types from @diamondhub/contracts
// P12: Pino logging on all mutations

import { prisma } from '@diamondhub/db'
import { getNotificationQueue } from '@diamondhub/workers'
import { logger } from '../lib/logger.js'
import type { NotificationPreferences } from '@diamondhub/contracts'
import {
  DEFAULT_COACH_PREFS,
  DEFAULT_PARENT_PREFS,
  DEFAULT_PLAYER_PREFS,
} from '@diamondhub/contracts'

export const notificationService = {

  // E5-S3: Game time change — sends to all team members who RSVPd YES or MAYBE
  async sendGameTimeChange(
    gameId: string,
    teamId: string,
    oldTime: string,
    newTime: string,
    field?: string,
  ) {
    const rsvps = await prisma.eventRsvp.findMany({
      where: { eventId: gameId, status: { in: ['YES', 'MAYBE'] } },
      select: { userId: true },
    })
    const userIds = rsvps.map((r) => r.userId)
    if (userIds.length === 0) return

    const timeStr = field ? `${newTime}, ${field}` : newTime
    await getNotificationQueue().add('game-time-change', {
      type: 'GAME_TIME_CHANGE',
      userIds,
      title: 'Game time changed',
      body: `Game time changed: ${oldTime} → ${timeStr}`,
      data: { gameId, teamId, oldTime, newTime, field: field ?? null },
      channels: ['push', 'sms', 'in_app'],
    })
    logger.info({ gameId, teamId, userCount: userIds.length }, 'Game time change notification queued')
  },

  // E5-S4: Weather/delay/cancellation broadcast — ALL team members
  async sendTeamBroadcast(teamId: string, type: string, title: string, body: string) {
    const members = await prisma.teamMember.findMany({
      where: { teamId, status: 'ACTIVE' },
      select: { userId: true },
    })
    const userIds = members.map((m) => m.userId)

    await getNotificationQueue().add(type, {
      type,
      userIds,
      title,
      body,
      data: { teamId },
      channels: ['push', 'sms', 'in_app'],
    })
    logger.info({ teamId, type, userCount: userIds.length }, 'Team broadcast queued')
  },

  // E5-S5: Bracket update
  async sendBracketUpdate(
    tournamentId: string,
    teamId: string,
    nextGame: { time: string; field: string; opponent: string },
  ) {
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId, teamId, status: 'CONFIRMED' },
    })
    if (registrations.length === 0) return

    const members = await prisma.teamMember.findMany({
      where: { teamId, status: 'ACTIVE' },
      select: { userId: true },
    })
    const userIds = members.map((m) => m.userId)

    await getNotificationQueue().add('bracket-update', {
      type: 'BRACKET_UPDATE',
      userIds,
      title: 'Next game set',
      body: `vs. ${nextGame.opponent}, ${nextGame.time}, ${nextGame.field}`,
      data: { tournamentId, teamId, ...nextGame },
      channels: ['push', 'in_app'],
    })
    logger.info({ tournamentId, teamId, userCount: userIds.length }, 'Bracket update queued')
  },

  // E5-S6: RSVP reminder (enqueued when event is created, delayed by 48h/24h)
  async scheduleRsvpReminders(
    eventId: string,
    teamId: string,
    eventTitle: string,
    eventStartTime: string,
  ) {
    const startMs = new Date(eventStartTime).getTime()
    const now = Date.now()

    // Get current team members to snapshot who to remind
    const members = await prisma.teamMember.findMany({
      where: { teamId, status: 'ACTIVE', role: { in: ['PLAYER', 'PARENT'] } },
      select: { userId: true },
    })
    const allMemberIds = members.map(m => m.userId)
    if (allMemberIds.length === 0) return

    for (const hoursBeforeEvent of [48, 24]) {
      const delay = startMs - now - hoursBeforeEvent * 60 * 60 * 1000
      if (delay <= 0) continue

      // At execution time, worker should query non-responders.
      // Pass allMemberIds + eventId; worker will filter to non-responders.
      await getNotificationQueue().add(`rsvp-reminder-${hoursBeforeEvent}h-${eventId}`, {
        type: 'RSVP_REMINDER',
        userIds: allMemberIds, // Worker filters to non-responders at execution
        title: 'RSVP reminder',
        body: `Have you set your availability for "${eventTitle}"?`,
        data: { eventId, teamId, eventTitle, eventStartTime, hoursBeforeEvent, filterNonResponders: true },
        channels: ['push', 'in_app'],
      }, { delay, deduplication: { id: `rsvp-${eventId}-${hoursBeforeEvent}h` } })
      logger.info({ eventId, teamId, hoursBeforeEvent, delay }, 'RSVP reminder queued')
    }
  },

  // E5-S7: Weekly digest (per coach)
  async sendWeeklyDigest(
    userId: string,
    tournaments: Array<{ name: string; location: string; dates: string }>,
  ) {
    if (tournaments.length === 0) return
    const list = tournaments
      .slice(0, 5)
      .map((t) => `• ${t.name} — ${t.location}, ${t.dates}`)
      .join('\n')
    await getNotificationQueue().add('weekly-digest', {
      type: 'NEW_TOURNAMENT',
      userIds: [userId],
      title: 'New tournaments near you',
      body: `${tournaments.length} new tournament${tournaments.length > 1 ? 's' : ''} near you this week:\n${list}`,
      data: { tournaments, userId },
      channels: ['email', 'in_app'],
    })
    logger.info({ userId, tournamentCount: tournaments.length }, 'Weekly digest queued')
  },

  // E5-S2: Get in-app notifications for a user (paginated)
  async getNotifications(userId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit
    const [notifications, unreadCount, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.count({ where: { userId } }),
    ])
    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      total,
    }
  },

  async markRead(userId: string, notificationIds?: string[]) {
    if (notificationIds) {
      await prisma.notification.updateMany({
        where: { userId, id: { in: notificationIds } },
        data: { isRead: true },
      })
    } else {
      await prisma.notification.updateMany({
        where: { userId },
        data: { isRead: true },
      })
    }
  },

  // E5-S8: Notification preferences
  async getPreferences(userId: string, userRole: string) {
    const prefs = await prisma.userNotificationPreference.findUnique({ where: { userId } })
    if (prefs) return prefs.preferences

    // Return defaults based on role
    if (userRole === 'COACH') return DEFAULT_COACH_PREFS
    if (userRole === 'PARENT') return DEFAULT_PARENT_PREFS
    return DEFAULT_PLAYER_PREFS
  },

  async updatePreferences(userId: string, preferences: NotificationPreferences) {
    return prisma.userNotificationPreference.upsert({
      where: { userId },
      update: { preferences: preferences as any },
      create: { userId, preferences: preferences as any },
    })
  },

  // E5-S1: Device token registration
  async registerDeviceToken(userId: string, token: string, platform: string) {
    return prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform: platform as any, isActive: true },
      create: { userId, token, platform: platform as any },
    })
  },

  async unregisterDeviceToken(token: string) {
    await prisma.deviceToken.updateMany({ where: { token }, data: { isActive: false } })
  },
}
