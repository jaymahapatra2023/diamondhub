import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'
import { logger } from '../logger.js'

// BaseballConnected — aggregator of 400+ organizers, all 50 states
// NOTE: tournament rows contain city+state but NO zip code or lat/lng
// Without geocoords, entries cannot be stored (schema requires lat/lng).
// This crawler is a placeholder — implement zip lookup via geocoding API
// or by visiting individual organizer pages when that investment is warranted.
// Current value: USSSA + ExposureEvents already cover the majority of events.
export class BaseballConnectedCrawler extends BaseCrawler {
  readonly sourceName = 'BASEBALL_CONNECTED'

  async crawl(): Promise<CrawledTournament[]> {
    logger.info('BaseballConnected: skipped — no ZIP/coords available in listing (placeholder)')
    return []
  }
}
