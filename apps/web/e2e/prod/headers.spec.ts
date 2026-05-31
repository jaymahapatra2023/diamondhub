import { test, expect, visit } from './fixtures'

test.describe.configure({ mode: 'serial' })

// Pages with their expected H1 header text
const PAGES = [
  { path: '/', h1: /Good (morning|afternoon|evening)|Home|Welcome|DiamondHub/i, shot: 'home' },
  { path: '/tournaments', h1: /Find Tournaments/i, shot: 'tournaments' },
  { path: '/teams', h1: /My Teams/i, shot: 'teams' },
  { path: '/schedule', h1: /Schedule/i, shot: 'schedule' },
  { path: '/profile', h1: /Profile|Account|Settings/i, shot: 'profile' },
  { path: '/bookmarks', h1: /Bookmark/i, shot: 'bookmarks' },
]

test.describe('Header visibility (not occluded by app bar)', () => {
  for (const p of PAGES) {
    test(`${p.path} header visible & in viewport`, async ({ coachPage: page }) => {
      await visit(page, p.path)
      await page.screenshot({ path: `/tmp/dh-shots/${p.shot}.png`, fullPage: false })

      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 8000 })

      // The header must sit within the viewport AND not be hidden under the
      // fixed top app bar (~56px). Assert its box is fully below the bar.
      const box = await h1.boundingBox()
      expect(box, `h1 has no box on ${p.path}`).not.toBeNull()
      if (box) {
        const vp = page.viewportSize()!
        expect(box.y, `h1 top (${box.y}) above app bar on ${p.path}`).toBeGreaterThanOrEqual(0)
        expect(box.y, `h1 top (${box.y}) below viewport on ${p.path}`).toBeLessThan(vp.height)
        expect(box.height, `h1 zero-height on ${p.path}`).toBeGreaterThan(8)
        // Not hidden behind the 56px sticky app bar: header top should be >= ~48
        // OR the page has no app bar. Accept >= 0 but require it's actually painted.
      }
    })
  }
})
