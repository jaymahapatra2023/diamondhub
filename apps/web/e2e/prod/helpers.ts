import { type Page, expect } from '@playwright/test'

export const BASE = 'https://d3i479v8ert7ze.cloudfront.net'

/** Collect real JS errors (ignore known-benign noise: Stripe/Google/WS/network). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  return errors
}

export function assertNoJsErrors(errors: string[], context: string) {
  const real = errors.filter(e =>
    !e.includes('net::ERR') &&
    !e.includes('chrome-extension') &&
    !e.includes('favicon') &&
    !e.includes('Stripe') && !e.includes('stripe') &&
    !e.includes('GSI_LOGGER') && !e.includes('client_id') &&
    !e.includes('WebSocket') && !e.includes('socket') &&
    !e.includes('401') && !e.includes('Unauthorized') &&
    !e.includes('Failed to load resource'),
  )
  expect(real, `JS errors on "${context}":\n${real.join('\n')}`).toHaveLength(0)
}

/** Navigate and wait for the SPA to settle. */
export async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200) // allow React render + queries
}
