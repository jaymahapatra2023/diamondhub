// E5 · Workers package — exports queue factory for producers (API)
// The worker process itself is started via the run.ts entry point

export { getNotificationQueue, getCrawlQueue, enqueueCrawl } from './queue.js'
export type { NotificationJobData, RsvpReminderJobData, WeeklyDigestJobData, CrawlJobData, CrawlSource } from './queue.js'
