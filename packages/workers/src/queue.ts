// E5 · Notifications & Alerts — BullMQ queue definitions
// Shared between API (producer) and workers (consumer)
// P4: ALL notification dispatch goes through Bull queue — zero synchronous dispatch

import { Queue, type ConnectionOptions } from 'bullmq'

export function createRedisConnection(): ConnectionOptions {
  return {
    host: new URL(process.env['REDIS_URL'] ?? 'redis://localhost:6379').hostname,
    port: Number(new URL(process.env['REDIS_URL'] ?? 'redis://localhost:6379').port) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
}

export interface NotificationJobData {
  type: string
  userIds: string[]           // target user IDs
  title: string
  body: string
  data: Record<string, unknown>
  teamId?: string
  channels?: ('push' | 'sms' | 'email' | 'in_app')[]
}

export interface RsvpReminderJobData {
  eventId: string
  teamId: string
  eventTitle: string
  eventStartTime: string
  hoursBeforeEvent: number
}

export interface WeeklyDigestJobData {
  userId: string
  timezone: string
}

export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  RSVP_REMINDERS: 'rsvp-reminders',
  WEEKLY_DIGEST: 'weekly-digest',
  CRAWL: 'crawl',
} as const

export type CrawlSource = 'USSSA' | 'TRIPLE_CROWN' | 'EXPOSURE_EVENTS' | 'BASEBALL_CONNECTED' | 'ALL'

export interface CrawlJobData {
  source: CrawlSource
  triggeredBy?: string
}

let _notificationQueue: Queue | null = null
let _crawlQueue: Queue | null = null

export function getNotificationQueue() {
  if (!_notificationQueue) {
    _notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    })
  }
  return _notificationQueue
}

export function getCrawlQueue() {
  if (!_crawlQueue) {
    _crawlQueue = new Queue<CrawlJobData>(QUEUE_NAMES.CRAWL, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    })
  }
  return _crawlQueue
}

export async function scheduleDailyCrawl() {
  const queue = getCrawlQueue()
  await queue.upsertJobScheduler(
    'daily-crawl-all',
    { pattern: '0 3 * * *' }, // 3 AM daily
    { name: 'crawl', data: { source: 'ALL' } },
  )
}

export async function enqueueCrawl(source: CrawlSource, triggeredBy?: string) {
  return getCrawlQueue().add('crawl', { source, triggeredBy })
}
