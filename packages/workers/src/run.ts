import { startNotificationWorker } from './notification.worker.js'
import { startCrawlWorker } from './crawl.worker.js'
import { scheduleDailyCrawl } from './queue.js'
import { logger } from './logger.js'

const notificationWorker = startNotificationWorker()
const crawlWorker = startCrawlWorker()

await scheduleDailyCrawl()

logger.info('Workers started')

async function shutdown() {
  logger.info('SIGINT received — shutting down workers')
  await Promise.all([notificationWorker.close(), crawlWorker.close()])
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
