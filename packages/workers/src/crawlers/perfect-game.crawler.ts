import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'

// Perfect Game tournament search — https://www.perfectgame.org/Tournaments/Search.aspx
// Selectors target PG's ASP.NET-rendered tournament grid. Validate against live HTML if layout changes.
const LISTING_URL = 'https://www.perfectgame.org/Tournaments/Search.aspx?Sport=1'

function parseDate(raw: string): Date | null {
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d
}

function parseZip(location: string): string {
  const match = location.match(/\b(\d{5})\b/)
  return match?.[1] ?? ''
}

function parseState(location: string): string {
  const match = location.match(/,\s*([A-Z]{2})\b/)
  return match?.[1] ?? ''
}

function parseCity(location: string): string {
  const parts = location.split(',')
  return parts[0]?.trim() ?? ''
}

export class PerfectGameCrawler extends BaseCrawler {
  readonly sourceName = 'PERFECT_GAME'

  async crawl(): Promise<CrawledTournament[]> {
    const html = await this.fetchHtml(LISTING_URL)
    const $ = cheerio.load(html)
    const tournaments: CrawledTournament[] = []

    // PG renders tournaments in a table with class "PGTable" or rows with class "EventRow"
    // Each row: name | dates | location | age | entry fee | reg link
    $('table.PGTable tr.EventRow, tr[class*="Event"]').each((_i, el) => {
      const cells = $(el).find('td')
      if (cells.length < 4) return

      const name = $(cells[0]).text().trim()
      const dateText = $(cells[1]).text().trim()
      const location = $(cells[2]).text().trim()
      const ageDiv = $(cells[3]).text().trim()
      const feeText = $(cells[4])?.text().trim() ?? ''
      const regHref = $(cells[5])?.find('a').attr('href') ?? $(cells[0]).find('a').attr('href') ?? ''

      const dateParts = dateText.split(/[-–]/)
      const startDate = parseDate(dateParts[0] ?? '')
      const endDate = parseDate(dateParts[1] ?? dateParts[0] ?? '')
      if (!startDate || !endDate || !name) return

      const entryFee = parseFloat(feeText.replace(/[^0-9.]/g, '')) || 0
      const zip = parseZip(location)
      if (!zip) return

      const sourceUrl = regHref.startsWith('http')
        ? regHref
        : `https://www.perfectgame.org${regHref}`

      tournaments.push({
        name,
        organizer: 'PERFECT_GAME',
        sport: 'BASEBALL',
        ageDivisions: ageDiv ? [ageDiv] : [],
        format: 'POOL_BRACKET',
        startDate,
        endDate,
        locationName: location.split(',')[0]?.trim() ?? location,
        address: location,
        city: parseCity(location),
        state: parseState(location),
        zip,
        entryFee,
        registrationUrl: sourceUrl,
        sourceUrl,
      })
    })

    return tournaments
  }
}
