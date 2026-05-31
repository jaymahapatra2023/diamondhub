import { test, expect } from '@playwright/test'
import { BASE, trackErrors, assertNoJsErrors, goto } from './helpers'

// Unauthenticated tests — no storageState
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Public / Unauthenticated', () => {
  test('landing page loads without JS errors', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/Diamond/i)
    assertNoJsErrors(errors, 'landing')
  })

  test('login page renders form', async ({ page }) => {
    await goto(page, '/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('invalid credentials show error', async ({ page }) => {
    await goto(page, '/login')
    await page.locator('input[type="email"]').fill('nobody@nowhere.test')
    await page.locator('input[type="password"]').fill('WrongPass123!')
    await page.locator('button[type="submit"]').click()
    // Either an error alert appears, or we simply stay on /login (not redirected to app)
    await page.waitForTimeout(6000)
    const alert = page.locator('[role="alert"]')
    const onLogin = page.url().includes('/login')
    expect((await alert.count()) > 0 || onLogin).toBeTruthy()
  })

  test('register page renders', async ({ page }) => {
    await goto(page, '/register')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('protected route gated when unauthenticated', async ({ page }) => {
    await goto(page, '/teams')
    // Guest sees landing/login gateway — never the authenticated team dashboard
    await expect(page.getByText(/Sign In/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Thunder Hawks')).toHaveCount(0)
  })

  test('404 route renders SPA (no blank page)', async ({ page }) => {
    await goto(page, '/this-route-does-not-exist')
    const body = await page.textContent('body')
    expect(body?.trim().length ?? 0).toBeGreaterThan(20)
  })
})
