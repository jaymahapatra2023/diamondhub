// E5 · Notification Worker — BullMQ consumer for the notifications queue
// P4: ALL dispatch happens here, never in API handlers
// P12: Pino logging: job type, job_id, duration, success/fail, retry count

import { Worker, type Job } from 'bullmq'
import { prisma } from '@diamondhub/db'
import { createRedisConnection, QUEUE_NAMES, type NotificationJobData } from './queue.js'
import { logger } from './logger.js'
import { fcmService } from './services/fcm.service.js'
import { smsService } from './services/sms.service.js'
import { emailNotificationService } from './services/email-notification.service.js'

export function startNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job: Job<NotificationJobData>) => {
      const start = Date.now()
      logger.info(
        { jobId: job.id, type: job.data.type, userCount: job.data.userIds.length },
        'Processing notification job',
      )

      const { type, title, body, data, channels } = job.data
      const channelsToUse = channels ?? ['push', 'in_app']

      // For RSVP_REMINDER with filterNonResponders flag, query actual non-responders
      let userIds = job.data.userIds
      if (job.data.type === 'RSVP_REMINDER' && job.data.data?.filterNonResponders && job.data.data?.eventId) {
        const respondedUsers = await prisma.eventRsvp.findMany({
          where: { eventId: job.data.data.eventId, status: { in: ['YES', 'NO', 'MAYBE'] } },
          select: { userId: true },
        })
        const respondedIds = new Set(respondedUsers.map((r: { userId: string }) => r.userId))
        userIds = job.data.userIds.filter((id: string) => !respondedIds.has(id))
        if (userIds.length === 0) {
          logger.info({ jobId: job.id, eventId: job.data.data.eventId }, 'RSVP reminder: all members responded, skipping')
          return
        }
      }

      for (const userId of userIds) {
        try {
          // Get user's notification preferences
          const prefs = await prisma.userNotificationPreference.findUnique({ where: { userId } })
          const userPrefs = prefs?.preferences as Record<
            string,
            { push: boolean; sms: boolean; email: boolean }
          > | null

          const typePref = userPrefs?.[type] ?? { push: true, sms: false, email: false }

          const channelsSent: string[] = []

          // In-app notification (always store)
          if (channelsToUse.includes('in_app')) {
            await prisma.notification.create({
              data: {
                userId,
                type,
                title,
                body,
                data: data as any,
                channelsSent: [],
              },
            })
            channelsSent.push('in_app')
          }

          // Push notification
          if (channelsToUse.includes('push') && typePref.push) {
            const tokens = await prisma.deviceToken.findMany({
              where: { userId, isActive: true },
              select: { token: true, platform: true },
            })
            if (tokens.length > 0) {
              await fcmService.sendToTokens(
                tokens.map((t) => t.token),
                title,
                body,
                data,
              )
              channelsSent.push('push')
            }
          }

          // SMS
          if (channelsToUse.includes('sms') && typePref.sms) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { phone: true },
            })
            if (user?.phone) {
              await smsService.send(user.phone, `${title}: ${body}`)
              channelsSent.push('sms')
            }
          }

          // Email
          if (channelsToUse.includes('email') && typePref.email) {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { email: true, name: true },
            })
            if (user) {
              await emailNotificationService.send(user.email, user.name, title, body, type)
              channelsSent.push('email')
            }
          }

          logger.info(
            { jobId: job.id, userId, channelsSent },
            'Notification dispatched to user',
          )
        } catch (err) {
          logger.error({ err, userId, jobId: job.id }, 'Failed to send notification to user')
          // Don't throw — process remaining users
        }
      }

      const duration = Date.now() - start
      logger.info(
        { jobId: job.id, type, duration, retryCount: job.attemptsMade },
        'Notification job completed',
      )
    },
    { connection: createRedisConnection(), concurrency: 5 },
  )

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err, attempts: job?.attemptsMade },
      'Notification job failed',
    )
  })

  return worker
}
