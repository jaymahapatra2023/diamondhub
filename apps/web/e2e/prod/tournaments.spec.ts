import { test, expect, trackErrors, assertNoJsErrors, visit } from './fixtures'

test.describe.configure({ mode: 'serial' })

/** Fill the search box and wait for the debounced query to resolve. */
async function searchZip(page: any, zip: string) {
  await visit(page, '/tournaments')
  await page.locator('input').first().fill(zip)
  await page.waitForTimeout(4000)
}

test.describe('Tournament Discovery', () => {
  test('page renders without JS error', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/tournaments')
    assertNoJsErrors(errors, 'tournaments')
  })

  test('empty state prompts for location', async ({ coachPage: page }) => {
    await visit(page, '/tournaments')
    await expect(page.locator('text=/ZIP|zip|location|where|Near Me/i').first())
      .toBeVisible({ timeout: 8000 })
  })

  test('ZIP search returns cards', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await searchZip(page, '27310')
    // Card shows a distance badge like "38 mi"; assert at least one renders
    await expect(page.getByText(/\d+\s*mi\b/).first()).toBeVisible({ timeout: 8000 })
    assertNoJsErrors(errors, 'ZIP search')
  })

  test('sort by date / entryFee / distance', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await searchZip(page, '27310')
    const sortSelect = page.locator('select').first()
    if (await sortSelect.count() > 0) {
      for (const opt of ['entryFee', 'distance', 'date']) {
        await sortSelect.selectOption(opt).catch(() => {})
        await page.waitForTimeout(1500)
      }
    }
    assertNoJsErrors(errors, 'sort')
  })

  test('sort order toggle', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await searchZip(page, '27310')
    const toggle = page.locator('button[aria-label*="scending" i]').first()
    if (await toggle.count() > 0) { await toggle.click(); await page.waitForTimeout(1500) }
    assertNoJsErrors(errors, 'sort toggle')
  })

  test('card shows source badge (External/DiamondHub)', async ({ coachPage: page }) => {
    await searchZip(page, '27310')
    await expect(page.locator('text=/External|DiamondHub/').first()).toBeVisible({ timeout: 8000 })
  })

  test('scraped card is external link w/ noopener', async ({ coachPage: page }) => {
    await searchZip(page, '27310')
    const ext = page.locator('a[target="_blank"]').first()
    if (await ext.count() > 0) {
      expect(await ext.getAttribute('href')).toMatch(/^https?:\/\//)
      expect(await ext.getAttribute('rel') ?? '').toContain('noopener')
    }
  })

  test('filters panel opens/closes', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/tournaments')
    const btn = page.locator('button:has-text("Filter"), button[aria-label*="ilter" i]').first()
    if (await btn.count() > 0) {
      await btn.click(); await page.waitForTimeout(600)
      const close = page.locator('button:has-text("Done"), button:has-text("Apply"), button[aria-label*="lose" i]').first()
      if (await close.count() > 0) await close.click().catch(() => {})
    }
    assertNoJsErrors(errors, 'filters')
  })

  test('bookmark flow does not crash', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await searchZip(page, '27310')
    const bm = page.locator('button[aria-label*="ookmark" i]').first()
    if (await bm.count() > 0) {
      await bm.click(); await page.waitForTimeout(1200)
      await visit(page, '/bookmarks')
      const unbm = page.locator('button[aria-label*="ookmark" i]').first()
      if (await unbm.count() > 0) await unbm.click().catch(() => {})
    }
    assertNoJsErrors(errors, 'bookmark flow')
  })
})
