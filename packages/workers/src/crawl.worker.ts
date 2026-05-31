import { Worker, type Job } from 'bullmq'
import { createRedisConnection, QUEUE_NAMES, type CrawlJobData, type CrawlSource } from './queue.js'
import { logger } from './logger.js'
import { UsssaCrawler } from './crawlers/usssa.crawler.js'
import { TripleCrownCrawler } from './crawlers/triple-crown.crawler.js'
import { ExposureEventsCrawler } from './crawlers/exposure-events.crawler.js'
import { BaseballConnectedCrawler } from './crawlers/baseball-connected.crawler.js'
import type { BaseCrawler } from './crawlers/base.crawler.js'

const ALL_CRAWLERS: BaseCrawler[] = [
  new UsssaCrawler(),
  new TripleCrownCrawler(),
  new ExposureEventsCrawler(),
  new BaseballConnectedCrawler(),
]

const CRAWLER_BY_SOURCE: Record<Exclude<CrawlSource, 'ALL'>, BaseCrawler> = {
  USSSA: new UsssaCrawler(),
  TRIPLE_CROWN: new TripleCrownCrawler(),
  EXPOSURE_EVENTS: new ExposureEventsCrawler(),
  BASEBALL_CONNECTED: new BaseballConnectedCrawler(),
}

async function processCrawlJob(job: Job<CrawlJobData>) {
  const { source, triggeredBy } = job.data
  logger.info({ source, triggeredBy, jobId: job.id }, 'Crawl job started')

  const targets = source === 'ALL' ? ALL_CRAWLERS : [CRAWLER_BY_SOURCE[source]]

  const results = await Promise.allSettled(targets.map((c) => c.run()))

  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error({ err: r.reason }, 'Crawler failed')
    }
  }

  const summary = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value)

  logger.info({ summary, jobId: job.id }, 'Crawl job complete')
  return summary
}

export function startCrawlWorker() {
  const worker = new Worker<CrawlJobData>(
    QUEUE_NAMES.CRAWL,
    processCrawlJob,
    { connection: createRedisConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Crawl job failed')
  })

  return worker
}
