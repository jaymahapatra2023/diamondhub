import { chromium, type Page } from 'playwright-core'
import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'
import { logger } from '../logger.js'

// Exposure Events — youth baseball tournament platform, 600+ events
// The page returns paginated JSON when the browser's XHR requests it
// Structure: { Results: [...], Page: N, PageSize: 50, Total: N }
const BASE_URL = 'https://baseball.exposureevents.com/youth-baseball-events'

interface EEEvent {
  Id: number
  Name: string
  OrganizationName: string
  Gender: number
  StartDate: string
  EndDate: string
  City: string
  StateRegion: string
  StateRegionAbbr: string
  PostalCode: string
  Latitude: number
  Longitude: number
  EventType?: string
}

interface EEResponse {
  Results: EEEvent[]
  Page: number
  PageSize: number
  Total: number
}

async function fetchPage(page: Page, pageNum: number): Promise<EEResponse | null> {
  let captured: EEResponse | null = null
  const capturePromise = new Promise<void>(resolve => {
    const handler = async (res: any) => {
      const url: string = res.url()
      const ct: string = res.headers()['content-type'] ?? ''
      if (url.includes('exposureevents.com/youth-baseball-events') && ct.includes('json')) {
        try {
          const text = await res.text()
          captured = JSON.parse(text)
        } catch {}
        page.off('response', handler)
        resolve()
      }
    }
    page.on('response', handler)
    setTimeout(resolve, 12000) // timeout fallback
  })

  const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?Page=${pageNum}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await capturePromise
  return captured
}

export class ExposureEventsCrawler extends BaseCrawler {
  readonly sourceName = 'EXPOSURE_EVENTS'

  async crawl(): Promise<CrawledTournament[]> {
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    })
    const page = await ctx.newPage()

    try {
      const now = new Date()
      const tournaments: CrawledTournament[] = []

      // Fetch first page to discover total
      const firstPage = await fetchPage(page, 1)
      if (!firstPage) {
        logger.warn('ExposureEvents: no JSON captured on page 1')
        return []
      }

      const totalPages = Math.ceil(firstPage.Total / firstPage.PageSize)
      logger.info({ total: firstPage.Total, pages: totalPages }, 'ExposureEvents: discovered pages')

      const allEvents: EEEvent[] = [...firstPage.Results]

      // Fetch remaining pages
      for (let p = 2; p <= totalPages; p++) {
        const result = await fetchPage(page, p)
        if (result?.Results) allEvents.push(...result.Results)
        logger.info({ page: p, totalPages, collected: allEvents.length }, 'ExposureEvents: fetched page')
      }

      for (const ev of allEvents) {
        const startDate = new Date(ev.StartDate)
        const endDate = new Date(ev.EndDate)
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue
        if (endDate < now) continue
        if (!ev.PostalCode || !/^\d{5}/.test(ev.PostalCode)) continue

        const zip = ev.PostalCode.substring(0, 5)
        const sourceUrl = `https://baseball.exposureevents.com/youth-baseball-events/${ev.Id}`

        // Gender 0=male/baseball, 1=female/softball, 2=coed
        const sport: CrawledTournament['sport'] =
          ev.Gender === 1 ? 'SOFTBALL' : ev.Gender === 2 ? 'BOTH' : 'BASEBALL'

        tournaments.push({
          name: ev.Name,
          organizer: 'OTHER',
          sport,
          ageDivisions: [],
          format: 'POOL_BRACKET',
          startDate,
          endDate,
          locationName: ev.City,
          address: ev.City,
          city: ev.City,
          state: ev.StateRegionAbbr,
          zip,
          lat: ev.Latitude,
          lng: ev.Longitude,
          registrationUrl: sourceUrl,
          sourceUrl,
          notes: `Source: Exposure Events / ${ev.OrganizationName}`,
        })
      }

      return tournaments
    } finally {
      await browser.close()
    }
  }
}
