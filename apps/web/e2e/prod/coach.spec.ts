import { test, expect, trackErrors, assertNoJsErrors, visit } from './fixtures'

test.describe.configure({ mode: 'serial' })

test.describe('Coach — Core Pages', () => {
  test('home renders without JS errors', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/')
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible()
    assertNoJsErrors(errors, 'coach home')
  })

  test('profile renders + shows COACH role', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/profile')
    await expect(page.locator('text=/COACH|Coach/').first()).toBeVisible({ timeout: 8000 })
    assertNoJsErrors(errors, 'coach profile')
  })

  test('teams page shows seeded team', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/teams')
    await expect(page.locator('text=Thunder Hawks').first()).toBeVisible({ timeout: 10000 })
    assertNoJsErrors(errors, 'coach teams')
  })

  test('team detail loads', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/teams')
    const card = page.locator('button:has-text("Thunder Hawks"), a:has-text("Thunder Hawks")').first()
    await card.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1200)
    assertNoJsErrors(errors, 'team detail')
  })

  test('schedule renders', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/schedule')
    assertNoJsErrors(errors, 'coach schedule')
  })

  test('messages renders', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/messages')
    assertNoJsErrors(errors, 'coach messages')
  })

  test('analytics renders', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/analytics')
    assertNoJsErrors(errors, 'coach analytics')
  })

  test('bookmarks renders', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/bookmarks')
    assertNoJsErrors(errors, 'coach bookmarks')
  })

  test('notifications page renders', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/notifications')
    assertNoJsErrors(errors, 'coach notifications')
  })

  test('notification bell visible + opens', async ({ coachPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/')
    const bell = page.locator('button[aria-label*="otification" i]')
    await expect(bell).toBeVisible({ timeout: 8000 })
    await bell.click()
    await page.waitForTimeout(800)
    assertNoJsErrors(errors, 'notification bell')
  })
})
