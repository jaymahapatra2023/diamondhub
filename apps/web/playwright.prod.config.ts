import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/prod',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 45000,
  reporter: [['list'], ['json', { outputFile: '/tmp/dh-e2e-results.json' }]],
  use: {
    baseURL: 'https://d3i479v8ert7ze.cloudfront.net',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: '/tmp/dh-e2e-artifacts',
})
