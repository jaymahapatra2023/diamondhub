// E2E tests for E1 Auth flows — P1: all tests run at mobile viewport too
import { test, expect, type Page } from '@playwright/test'

// Helpers
async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

async function fillRegister(page: Page, name: string, email: string, password: string) {
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders login form with all required elements', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByText(/forgot password/i)).toBeVisible()
    await expect(page.getByText(/create one/i)).toBeVisible()
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid email/i).first()).toBeVisible()
  })

  test('shows validation error for invalid email', async ({ page }) => {
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid email/i).first()).toBeVisible()
  })

  test('navigates to /register on "Create one" click', async ({ page }) => {
    await page.getByText(/create one/i).click()
    await expect(page).toHaveURL('/register')
  })

  test('navigates to /forgot-password on link click', async ({ page }) => {
    await page.getByText(/forgot password/i).click()
    await expect(page).toHaveURL('/forgot-password')
  })

  test('password show/hide toggle works', async ({ page }) => {
    const passwordInput = page.getByLabel('Password')
    await passwordInput.fill('MyPassword1')

    // Initially hidden
    await expect(passwordInput).toHaveAttribute('type', 'password')

    // Click show
    await page.getByRole('button', { name: /show password/i }).click()
    await expect(passwordInput).toHaveAttribute('type', 'text')

    // Click hide
    await page.getByRole('button', { name: /hide password/i }).click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })
})

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('renders all registration fields', async ({ page }) => {
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
  })

  test('shows password validation errors', async ({ page }) => {
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible()
  })

  test('shows number requirement validation', async ({ page }) => {
    await page.getByLabel('Password').fill('noNumberHere')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/at least one number/i)).toBeVisible()
  })
})

test.describe('Forgot Password Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password')
  })

  test('renders email input', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible()
  })

  test('validates email format', async ({ page }) => {
    await page.getByLabel('Email').fill('bad-email')
    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByText(/invalid email/i)).toBeVisible()
  })
})

test.describe('Protected Routes', () => {
  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/')
    // Should redirect to login (after auth initialization)
    await page.waitForURL(/\/login/, { timeout: 5000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirects /profile to /login when not authenticated', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForURL(/\/login/, { timeout: 5000 })
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Reset Password Page', () => {
  test('shows error when no token in URL', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByText(/invalid/i)).toBeVisible()
  })

  test('shows form when token present', async ({ page }) => {
    await page.goto('/reset-password?token=some-reset-token')
    await expect(page.getByLabel(/new password/i)).toBeVisible()
    await expect(page.getByLabel(/confirm password/i)).toBeVisible()
  })

  test('validates passwords match', async ({ page }) => {
    await page.goto('/reset-password?token=some-token')
    await page.getByLabel(/^new password/i).fill('NewPass123')
    await page.getByLabel(/confirm password/i).fill('DifferentPass123')
    await page.getByRole('button', { name: /reset password/i }).click()
    await expect(page.getByText(/passwords do not match/i)).toBeVisible()
  })
})

test.describe('Mobile Viewport', () => {
  // These tests run on Mobile Chrome and Mobile Safari via playwright.config.ts projects
  test('login page is usable at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/login')
    const signInBtn = page.getByRole('button', { name: /sign in/i })
    const box = await signInBtn.boundingBox()
    // P1: min 44px touch target
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  })

  test('register page scrolls correctly at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/register')
    // Should be able to reach submit button by scrolling
    const btn = page.getByRole('button', { name: /create account/i })
    await btn.scrollIntoViewIfNeeded()
    await expect(btn).toBeVisible()
  })
})
