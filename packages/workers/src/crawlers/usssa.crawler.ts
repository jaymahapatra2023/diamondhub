import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'

// USSSA Baseball event search — direct API (no scraping needed)
// Token is static: found by intercepting browser requests to /baseball/eventsearch
const API_URL = 'https://www.usssa.com/api/?action=eventSearchSimpleV11'
const BASEBALL_SPORT_ID = '11'
const SEASON_2026 = '30'
const TOKEN = 'eventSearchV4!!!Get'

const FORMAT_MAP: Record<string, CrawledTournament['format']> = {
  'Pool Play into Split Bracket Single Elim': 'POOL_BRACKET',
  'Pool Play into Double Elimination': 'POOL_BRACKET',
  'Double Elimination': 'DOUBLE_ELIM',
  'Round Robin': 'ROUND_ROBIN',
  'Single Elimination': 'SINGLE_ELIM',
  'League': 'ROUND_ROBIN',
}

function parseFormat(raw: string): CrawledTournament['format'] {
  for (const [key, val] of Object.entries(FORMAT_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return val
  }
  return 'POOL_BRACKET'
}

function parseAgeDivisions(raw: string): string[] {
  return raw.split('#').map(d => d.split('%')[0]?.trim() ?? '').filter(Boolean)
}

interface UsssaEvent {
  ID: number
  event_name: string
  start_date: string
  end_date: string
  eventType: string
  eventDivisionsAll: string
  city: string
  state: string
  zip: string
  stateABR: string
}

export class UsssaCrawler extends BaseCrawler {
  readonly sourceName = 'USSSA'

  async crawl(): Promise<CrawledTournament[]> {
    const body = new URLSearchParams({
      sportID: BASEBALL_SPORT_ID,
      seasonID: SEASON_2026,
      age: 'null',
      classID: 'null',
      stateID: 'null',
      regionID: 'null',
      zip: 'null',
      mile: 'null',
      statureID: 'null',
      startDate: 'null',
      endDate: 'null',
      director: 'null',
      parkID: 'null',
      token: TOKEN,
    })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    let data: { results?: UsssaEvent[] } | UsssaEvent[]
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://www.usssa.com/baseball/eventsearch',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
        body: body.toString(),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`USSSA API HTTP ${res.status}`)
      data = await res.json() as UsssaEvent[] | { results?: UsssaEvent[] }
    } finally {
      clearTimeout(timer)
    }

    const events: UsssaEvent[] = Array.isArray(data) ? data : (data.results ?? [])
    const now = new Date()
    const tournaments: CrawledTournament[] = []

    for (const ev of events) {
      const startDate = new Date(ev.start_date)
      const endDate = new Date(ev.end_date)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue
      if (endDate < now) continue // skip past events
      if (!ev.zip || !/^\d{5}/.test(ev.zip)) continue

      const zip = ev.zip.substring(0, 5)
      const sourceUrl = `https://www.usssa.com/baseball/event/${ev.ID}`

      tournaments.push({
        name: ev.event_name,
        organizer: 'OTHER',
        notes: 'Source: USSSA',
        sport: 'BASEBALL',
        ageDivisions: parseAgeDivisions(ev.eventDivisionsAll),
        format: parseFormat(ev.eventType),
        startDate,
        endDate,
        locationName: ev.city,
        address: ev.city,
        city: ev.city,
        state: ev.stateABR,
        zip,
        registrationUrl: sourceUrl,
        sourceUrl,
      })
    }

    return tournaments
  }
}
