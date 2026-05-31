import { test, expect } from '@playwright/test'

const BASE = 'https://d3i479v8ert7ze.cloudfront.net'
test.use({ storageState: { cookies: [], origins: [] } })

test('public /browse shows brand header + page header', async ({ page }) => {
  await page.goto(`${BASE}/browse`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/tmp/dh-shots/browse.png' })
  await expect(page.getByText('DiamondHub').first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/Find Tournaments/i).first()).toBeVisible()
  await expect(page.getByText(/Sign In/i).first()).toBeVisible()
})
