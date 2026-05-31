import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'

// USA Baseball events — https://web.usabaseball.com/events
// Selectors target their event card grid. Validate against live HTML if layout changes.
const LISTING_URL = 'https://web.usabaseball.com/events'

function parseDate(raw: string): Date | null {
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d
}

function parseZip(text: string): string {
  const match = text.match(/\b(\d{5})\b/)
  return match?.[1] ?? ''
}

function parseState(text: string): string {
  const match = text.match(/,\s*([A-Z]{2})\b/)
  return match?.[1] ?? ''
}

function parseCity(text: string): string {
  return text.split(',')[0]?.trim() ?? ''
}

export class UsaBaseballCrawler extends BaseCrawler {
  readonly sourceName = 'USA_BASEBALL'

  async crawl(): Promise<CrawledTournament[]> {
    const html = await this.fetchHtml(LISTING_URL)
    const $ = cheerio.load(html)
    const tournaments: CrawledTournament[] = []

    // USA Baseball renders event cards — adjust selectors to match live HTML
    $('article.event-card, .event-item, [class*="EventCard"], [class*="event-card"]').each((_i, el) => {
      const name = $(el).find('[class*="title"], h2, h3').first().text().trim()
      const dateText = $(el).find('[class*="date"], time').first().text().trim()
      const location = $(el).find('[class*="location"], [class*="venue"]').first().text().trim()
      const href = $(el).find('a').first().attr('href') ?? ''

      const dateParts = dateText.split(/[-–to]+/)
      const startDate = parseDate(dateParts[0] ?? '')
      const endDate = parseDate(dateParts[1] ?? dateParts[0] ?? '')
      if (!startDate || !endDate || !name) return

      const zip = parseZip(location)
      if (!zip) return

      const sourceUrl = href.startsWith('http')
        ? href
        : `https://web.usabaseball.com${href}`

      tournaments.push({
        name,
        organizer: 'USA_BASEBALL',
        sport: 'BASEBALL',
        ageDivisions: [],
        format: 'POOL_BRACKET',
        startDate,
        endDate,
        locationName: parseCity(location) || location,
        address: location,
        city: parseCity(location),
        state: parseState(location),
        zip,
        registrationUrl: sourceUrl,
        sourceUrl,
      })
    })

    return tournaments
  }
}
