import { chromium } from 'playwright-core'
import { BaseCrawler } from './base.crawler.js'
import type { CrawledTournament } from './types.js'
import { logger } from '../logger.js'

const LISTING_URL = 'https://www.triplecrownbaseball.com/find-an-event'

const STATE_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
}

// TC Baseball venues — hardcoded since us-zips has no city data
// Covers all states listed on triplecrownbaseball.com/find-an-event
const CITY_ZIP: Record<string, string> = {
  // Arizona
  'gilbert:az': '85233', 'scottsdale:az': '85250', 'phoenix:az': '85001', 'tempe:az': '85281', 'chandler:az': '85225',
  'glendale:az': '85301', 'peoria:az': '85382', 'surprise:az': '85374', 'goodyear:az': '85338',
  // California
  'los angeles:ca': '90001', 'san diego:ca': '92101', 'fresno:ca': '93701', 'bakersfield:ca': '93301',
  'sacramento:ca': '95814', 'anaheim:ca': '92801', 'riverside:ca': '92501', 'so cal:ca': '90001',
  // Colorado
  'denver:co': '80201', 'colorado springs:co': '80901', 'aurora:co': '80010', 'lakewood:co': '80226',
  'vail:co': '81657', 'avon:co': '81620', 'aspen:co': '81611', 'gypsum:co': '81637',
  'roaring fork:co': '81620', 'wenatchee valley:wa': '98801',
  // Missouri
  'kansas city:mo': '64101', 'st. louis:mo': '63101', 'st louis:mo': '63101',
  // Nebraska
  'omaha:ne': '68101', 'lincoln:ne': '68501', 'papillion:ne': '68046',
  // Nevada
  'las vegas:nv': '89101', 'henderson:nv': '89002', 'north las vegas:nv': '89030',
  // New Mexico
  'albuquerque:nm': '87101', 'rio rancho:nm': '87124',
  // North Carolina
  'raleigh:nc': '27601', 'charlotte:nc': '28201', 'durham:nc': '27701', 'cary:nc': '27518',
  'greensboro:nc': '27401', 'winston-salem:nc': '27101', 'wilmington:nc': '28401',
  // South Carolina
  'myrtle beach:sc': '29572', 'columbia:sc': '29201', 'charleston:sc': '29401',
  // Tennessee
  'nashville:tn': '37201', 'memphis:tn': '38101', 'knoxville:tn': '37901',
  // Texas
  'round rock:tx': '78665', 'dallas:tx': '75201', 'houston:tx': '77001', 'austin:tx': '78701',
  'fort worth:tx': '76101', 'san antonio:tx': '78201', 'frisco:tx': '75034', 'allen:tx': '75002',
  'mckinney:tx': '75069', 'plano:tx': '75023', 'arlington:tx': '76001', 'irving:tx': '75038',
  'dallas metroplex:tx': '75201', 'dfw:tx': '75201', 'north texas:tx': '75201',
  'cedar hill:tx': '75104', 'mansfield:tx': '76063',
  // Utah
  'salt lake city:ut': '84101', 'provo:ut': '84601', 'st. george:ut': '84770', 'st george:ut': '84770',
  'logan:ut': '84321', 'ogden:ut': '84401',
  // Virginia
  'richmond:va': '23218', 'virginia beach:va': '23450', 'norfolk:va': '23501',
  'yorktown:va': '23690', 'williamsburg:va': '23185', 'newport news:va': '23601', 'hampton:va': '23661',
  'chesapeake:va': '23320', 'suffolk:va': '23434',
  // Washington
  'spokane:wa': '99201', 'seattle:wa': '98101', 'wenatchee:wa': '98801', 'yakima:wa': '98901',
}

function lookupZip(city: string, state: string): string {
  if (!city || !state) return ''
  const st = state.toLowerCase().trim()
  // Try progressively shorter prefixes of city name
  const candidates = [
    city.toLowerCase().trim(),
    city.toLowerCase().split(/\s*[-–,/]\s*/)[0]?.trim() ?? '',
    city.toLowerCase().split(/\s+/)[0] ?? '',
  ]
  for (const c of candidates) {
    const z = CITY_ZIP[`${c}:${st}`]
    if (z) return z
  }
  return ''
}

function parseDateRange(raw: string): { startDate: Date; endDate: Date } | null {
  // Formats: "Feb 27-Mar 1, 2026" | "Jun 6-8, 2026" | "Jul 4, 2026"
  const clean = raw.trim()
  const yearMatch = clean.match(/(\d{4})/)
  const year = yearMatch ? yearMatch[1]! : new Date().getFullYear().toString()

  // "Month DD-DD, YYYY" (same month)
  const sameMonth = clean.match(/^(\w+)\s+(\d+)-(\d+),?\s*\d{4}$/)
  if (sameMonth) {
    const [, month, d1, d2] = sameMonth
    return {
      startDate: new Date(`${month!} ${d1!}, ${year}`),
      endDate: new Date(`${month!} ${d2!}, ${year}`),
    }
  }

  // "Month DD-Month DD, YYYY"
  const crossMonth = clean.match(/^(\w+)\s+(\d+)-(\w+)\s+(\d+),?\s*\d{4}$/)
  if (crossMonth) {
    const [, m1, d1, m2, d2] = crossMonth
    return {
      startDate: new Date(`${m1!} ${d1!}, ${year}`),
      endDate: new Date(`${m2!} ${d2!}, ${year}`),
    }
  }

  // Single day
  const single = clean.match(/^(\w+)\s+(\d+),?\s*\d{4}$/)
  if (single) {
    const d = new Date(`${single[1]!} ${single[2]!}, ${year}`)
    return { startDate: d, endDate: d }
  }

  return null
}

function parseEntryFee(raw: string): number {
  const match = raw.match(/\$(\d+)/)
  return match ? parseInt(match[1]!, 10) : 0
}

async function scrapeEventDetail(page: any, url: string): Promise<Partial<CrawledTournament> | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)

    const text: string = await page.evaluate('document.body?.innerText ?? ""' as any)
    const h1: string = await page.evaluate('document.querySelector("h1,h2")?.innerText?.trim() ?? ""' as any)

    const NAV = new Set(['HOME','FIND AN EVENT','TC ADVANTAGE','RULES','MEDIA','TC SERIES','ABOUT US','LOG IN'])
    const fallbackName = text.split('\n').find(l => l.trim() && !NAV.has(l.trim())) ?? ''
    const name = (h1 || fallbackName).replace(/\s*-\s*CANCELLED.*$/i, '').trim()

    const datesMatch = text.match(/Dates?:\s*([^\n]+)/i)
    const datesRaw = datesMatch?.[1]?.trim() ?? ''

    const priceMatch = text.match(/Price:\s*([^\n]+)/i)
    const priceRaw = priceMatch?.[1]?.trim() ?? ''

    const divMatch = text.match(/Division:\s*([^\n]+)/i)
    const divRaw = divMatch?.[1]?.trim() ?? ''

    const locationMatch = text.match(/Location:\s*([^\n]+)/i)
    const locationRaw = locationMatch?.[1]?.trim() ?? ''

    // Skip cancelled
    if (/CANCELLED/i.test(text.substring(0, 200)) && !name) return null

    const dates = parseDateRange(datesRaw)
    if (!dates) return null

    // Parse location: "Dallas Metroplex" / "Yorktown, VA" / "Williamsburg, Yorktown... - Virginia"
    // Extract first city from complex multi-city strings
    const firstCity = locationRaw.split(/[,/\-–]+/)[0]?.trim() ?? locationRaw
    let city = firstCity
    let state = ''
    const cityStateMatch = locationRaw.match(/\b([A-Z]{2})\b$/)
    if (cityStateMatch) {
      state = cityStateMatch[1]!
    } else {
      // Try to infer state from location text
      for (const [name, abbr] of Object.entries(STATE_ABBR)) {
        if (locationRaw.toLowerCase().includes(name)) { state = abbr; break }
      }
      // Also check common region terms
      if (!state) {
        if (/texas|dallas|houston|austin/i.test(locationRaw)) state = 'TX'
        else if (/colorado|denver|vail|aspen/i.test(locationRaw)) state = 'CO'
        else if (/nebraska|omaha/i.test(locationRaw)) state = 'NE'
        else if (/arizona|phoenix|scottsdale/i.test(locationRaw)) state = 'AZ'
        else if (/carolina|raleigh|charlotte/i.test(locationRaw)) state = /north/i.test(locationRaw) ? 'NC' : 'SC'
        else if (/virginia|richmond/i.test(locationRaw)) state = 'VA'
        else if (/nevada|las vegas/i.test(locationRaw)) state = 'NV'
        else if (/utah|salt lake/i.test(locationRaw)) state = 'UT'
        else if (/tennessee|nashville/i.test(locationRaw)) state = 'TN'
        else if (/missouri|kansas city/i.test(locationRaw)) state = 'MO'
        else if (/washington|spokane/i.test(locationRaw)) state = 'WA'
        else if (/california|los angeles|san diego/i.test(locationRaw)) state = 'CA'
        else if (/new mexico|albuquerque/i.test(locationRaw)) state = 'NM'
        else if (/myrtle beach/i.test(locationRaw)) state = 'SC'
      }
    }

    if (!state) return null

    const zip = lookupZip(city, state)
    if (!zip) return null

    const ageDivisions = divRaw
      ? divRaw.split(/[–\-,/]/).map(d => d.trim()).filter(d => /\du/i.test(d))
      : []

    return {
      name,
      ...dates,
      locationName: locationRaw || city,
      address: locationRaw || city,
      city,
      state,
      zip,
      entryFee: parseEntryFee(priceRaw),
      ageDivisions,
    }
  } catch (err: any) {
    logger.warn({ url, err: err.message }, 'TC: failed to scrape event detail')
    return null
  }
}

export class TripleCrownCrawler extends BaseCrawler {
  readonly sourceName = 'TRIPLE_CROWN'

  async crawl(): Promise<CrawledTournament[]> {
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    })
    const page = await ctx.newPage()

    try {
      await page.goto(LISTING_URL, { waitUntil: 'load', timeout: 20000 })
      await page.waitForTimeout(2000)

      const eventLinks: string[] = await page.evaluate(
        `[...document.querySelectorAll('a')].map(a=>a.href).filter(h=>h.includes('/events/')&&!h.includes('#')).filter((h,i,a)=>a.indexOf(h)===i)` as any
      )

      logger.info({ count: eventLinks.length }, 'TC: found event links')

      const now = new Date()
      const tournaments: CrawledTournament[] = []

      for (const url of eventLinks) {
        const detail = await scrapeEventDetail(page, url)
        if (!detail || !detail.name || !detail.startDate || !detail.endDate) continue
        if (detail.endDate! < now) continue

        tournaments.push({
          name: detail.name,
          organizer: 'TRIPLE_CROWN',
          sport: 'BASEBALL',
          ageDivisions: detail.ageDivisions ?? [],
          format: 'POOL_BRACKET',
          startDate: detail.startDate!,
          endDate: detail.endDate!,
          locationName: detail.locationName ?? detail.city ?? '',
          address: detail.address ?? '',
          city: detail.city ?? '',
          state: detail.state ?? '',
          zip: detail.zip ?? '',
          entryFee: detail.entryFee ?? 0,
          registrationUrl: url,
          sourceUrl: url,
        })
      }

      return tournaments
    } finally {
      await browser.close()
    }
  }
}
