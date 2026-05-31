/**
 * Worker-scoped authenticated page fixtures.
 *
 * Refresh tokens are single-use (rotated on every /refresh). A static
 * storageState file therefore dies after the first test consumes it.
 * Instead we log in ONCE per worker per role and keep a SINGLE live
 * browser context — the rotating refresh cookie stays valid in that
 * context's cookie jar across all navigations.
 */
import { test as base, type Page, type BrowserContext } from '@playwright/test'

export const BASE = 'https://d3i479v8ert7ze.cloudfront.net'

const CREDS = {
  coach:  { email: 'coach.mike@diamondhub.test',  password: 'Coach1234!' },
  parent: { email: 'parent.dave@diamondhub.test', password: 'Parent1234!' },
  player: { email: 'player.jake@diamondhub.test', password: 'Player1234!' },
}

type Role = keyof typeof CREDS

async function loginContext(browser: any, role: Role): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const c = CREDS[role]
  await page.goto(`${BASE}/login`)
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="email"]').fill(c.email)
  await page.locator('input[type="password"]').fill(c.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  return { ctx, page }
}

export const test = base.extend<{
  coachPage: Page
  parentPage: Page
  playerPage: Page
}>({
  coachPage: [async ({ browser }, use) => {
    const { ctx, page } = await loginContext(browser, 'coach')
    await use(page)
    await ctx.close()
  }, { scope: 'worker' }],

  parentPage: [async ({ browser }, use) => {
    const { ctx, page } = await loginContext(browser, 'parent')
    await use(page)
    await ctx.close()
  }, { scope: 'worker' }],

  playerPage: [async ({ browser }, use) => {
    const { ctx, page } = await loginContext(browser, 'player')
    await use(page)
    await ctx.close()
  }, { scope: 'worker' }],
})

export const expect = test.expect

/** Real JS errors only — filter known-benign third-party noise. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
  return errors
}

export function assertNoJsErrors(errors: string[], context: string) {
  const real = errors.filter(e =>
    !e.includes('net::ERR') && !e.includes('chrome-extension') && !e.includes('favicon') &&
    !e.includes('Stripe') && !e.includes('stripe') &&
    !e.includes('GSI_LOGGER') && !e.includes('client_id') &&
    !e.includes('WebSocket') && !e.includes('socket') &&
    !e.includes('401') && !e.includes('Unauthorized') &&
    !e.includes('Failed to load resource'),
  )
  expect(real, `JS errors on "${context}":\n${real.join('\n')}`).toHaveLength(0)
}

export async function visit(page: Page, path: string) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
}
