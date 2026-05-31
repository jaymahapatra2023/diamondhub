import { test, expect, trackErrors, assertNoJsErrors, visit } from './fixtures'

test.describe.configure({ mode: 'serial' })

test.describe('Parent role', () => {
  test('home renders', async ({ parentPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/')
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible()
    assertNoJsErrors(errors, 'parent home')
  })
  test('profile renders', async ({ parentPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/profile')
    assertNoJsErrors(errors, 'parent profile')
  })
  test('schedule renders', async ({ parentPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/schedule')
    assertNoJsErrors(errors, 'parent schedule')
  })
  test('tournaments renders', async ({ parentPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/tournaments')
    assertNoJsErrors(errors, 'parent tournaments')
  })
})

test.describe('Player role', () => {
  test('home renders', async ({ playerPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/')
    await expect(page.locator('nav, [role="navigation"]')).toBeVisible()
    assertNoJsErrors(errors, 'player home')
  })
  test('profile renders', async ({ playerPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/profile')
    assertNoJsErrors(errors, 'player profile')
  })
  test('stats renders', async ({ playerPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/stats')
    assertNoJsErrors(errors, 'player stats')
  })
  test('schedule renders', async ({ playerPage: page }) => {
    const errors = trackErrors(page)
    await visit(page, '/schedule')
    assertNoJsErrors(errors, 'player schedule')
  })
})
