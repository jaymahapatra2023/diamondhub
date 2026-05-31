import { createRequire } from 'module'
import { prisma } from '@diamondhub/db'
import { logger } from '../logger.js'
import type { CrawledTournament, CrawlResult } from './types.js'

const _require = createRequire(import.meta.url)

interface ZipData { latitude: number; longitude: number }

function geocodeZip(zip: string): { lat: number; lng: number } | null {
  const raw = _require('us-zips') as { default?: Record<string, ZipData> } & Record<string, ZipData>
  const db: Record<string, ZipData> = raw.default ?? raw
  const entry = db[zip]
  return entry ? { lat: entry.latitude, lng: entry.longitude } : null
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DiamondHub-Crawler/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

export abstract class BaseCrawler {
  abstract readonly sourceName: string

  abstract crawl(): Promise<CrawledTournament[]>

  protected async fetchHtml(url: string, timeoutMs = 15_000): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
      return res.text()
    } finally {
      clearTimeout(timer)
    }
  }

  async upsert(tournaments: CrawledTournament[]): Promise<CrawlResult> {
    const result: CrawlResult = { source: this.sourceName, created: 0, updated: 0, skipped: 0, errors: 0 }
    const now = new Date()

    for (const t of tournaments) {
      try {
        let geo: { lat: number; lng: number } | null = null

        if (t.lat !== undefined && t.lng !== undefined) {
          geo = { lat: t.lat, lng: t.lng }
        } else if (t.zip) {
          geo = geocodeZip(t.zip)
        }

        if (!geo) {
          logger.warn({ zip: t.zip, name: t.name }, 'Crawl: no coords, skipping')
          result.skipped++
          continue
        }

        const zip = t.zip ?? '00000'

        const existing = await prisma.tournament.findFirst({
          where: { sourceUrl: t.sourceUrl },
          select: { id: true },
        })

        const data = {
          name: t.name,
          organizer: t.organizer as any,
          sport: t.sport as any,
          ageDivisions: t.ageDivisions,
          format: t.format as any,
          startDate: t.startDate,
          endDate: t.endDate,
          registrationDeadline: t.registrationDeadline ?? null,
          locationName: t.locationName,
          address: t.address,
          city: t.city,
          state: t.state,
          zip,
          lat: geo.lat,
          lng: geo.lng,
          entryFee: t.entryFee ?? 0,
          maxTeams: t.maxTeams ?? null,
          registrationUrl: t.registrationUrl ?? null,
          sourceUrl: t.sourceUrl,
          notes: t.notes ?? null,
          dataSource: 'SCRAPED' as any,
          scrapedAt: now,
          isPublished: true,
          status: t.startDate > now ? 'UPCOMING' : 'ONGOING' as any,
        }

        if (existing) {
          await prisma.tournament.update({ where: { id: existing.id }, data })
          result.updated++
        } else {
          await prisma.tournament.create({ data })
          result.created++
        }
      } catch (err) {
        logger.error({ err, name: t.name, source: this.sourceName }, 'Crawl: upsert error')
        result.errors++
      }
    }

    return result
  }

  async run(): Promise<CrawlResult> {
    logger.info({ source: this.sourceName }, 'Crawl started')
    const tournaments = await this.crawl()
    logger.info({ source: this.sourceName, found: tournaments.length }, 'Crawl fetched')
    const result = await this.upsert(tournaments)
    logger.info(result, 'Crawl complete')
    return result
  }
}
