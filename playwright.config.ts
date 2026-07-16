// ═══════════════════════════════════════════════════════════════════════════
// Playwright E2E test configuration
//
// Projects: chromium (primary), firefox, webkit (additional coverage)
// Artifacts: trace, screenshot, video on failure
// Base URL: from PLAYWRIGHT_BASE_URL env var (default: http://localhost:3000)
//
// AUTH: Global setup authenticates ONCE as guest and saves storageState to
// e2e/.auth/user.json. All projects reuse this session, eliminating 429
// rate-limit errors from per-spec anonymous signups.
// ═══════════════════════════════════════════════════════════════════════════

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  timeout: 60_000,          // per-test timeout
  expect: {
    timeout: 10_000,        // per-assertion timeout
  },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'e2e/.auth/user.json',
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
})
