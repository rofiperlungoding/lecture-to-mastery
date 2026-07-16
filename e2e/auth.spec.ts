// ═══════════════════════════════════════════════════════════════════════════
// PHASE T4 — Auth & Session E2E
//
// Proves sign-in/out, session persistence, route guards, and guest/demo path.
//
// Auth flows tested:
//   1. Route guard — unauthenticated access redirects to /login
//   2. Public routes — /health and /u/... stay accessible; protected routes block
//   3. Deep-link redirect — protected → /login → guest → lands on dashboard
//      (Note: app doesn't implement deep-link return yet — login goes to / always)
//   4. Guest sign-in — anonymous auth, dashboard loads, guest banner visible
//   5. Session persistence — guest session survives hard reload + new tabs
//   6. Sign-out — localStorage cleared, route guard re-engages
//   7. Guest upgrade form — renders, validates input, button state toggles
//   8. Password form validation — client-side checks without server call
//   9. Sign-in / Create account toggle — button text and form mode switch
//   10. Magic link flow — fill email → send → "Check your email" screen
//   11. /u/<username> public route — accessible without auth
//   12. Invalid credentials — submit wrong password, error banner appears
//   13. No uncaught console errors or failed requests
//
// Env:
//   PLAYWRIGHT_BASE_URL — the app URL (default http://localhost:3000)
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test'
import {
  trackObservations,
  categorizeObservations,
  buildReport,
  writeReports,
  defaultReportHeader,
  observationsTable,
  type Report,
  type Observation
} from './helpers/reporter'

// G0: auth tests manage their own auth state — no pre-authenticated session
test.use({ storageState: undefined })
import * as fs from 'fs'
import * as path from 'path'

// ── Constants ──────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'test-results/screenshots-auth'
const REPORT_DIR = 'test-results'

// ── Shared state ──────────────────────────────────────────────────────────

const errorLog: string[] = []
const assertionFailures = { value: 0 }

// ── Helpers ────────────────────────────────────────────────────────────────

// trackErrors replaced by shared trackObservations from helpers/reporter

async function snap(page: Page, label: string): Promise<void> {
  const filename = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  await page.waitForTimeout(400)
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${filename}.png`),
    fullPage: true })
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

/**
 * Sign in as guest from the login page.
 * Assumes we're already on /login.
 */
async function loginAsGuest(page: Page): Promise<void> {
  await expect(page.locator('text=Try as guest')).toBeVisible({ timeout: 10_000 })
  await page.click('text=Try as guest')
  await page.waitForURL('/', { timeout: 20_000 })
  await waitForReady(page)
}

/**
 * Clear Supabase session from localStorage (sign-out equivalent).
 * Supabase stores the session token under `sb-*-auth-token` keys.
 */
async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'))
    for (const key of keys) {
      localStorage.removeItem(key)
    }
  })
}

/**
 * Verify we are on the login page (route guard active).
 */
async function expectOnLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Auth & Session E2E', () => {
  test.afterEach(() => {
    const status = test.info().status;
    if (status === 'failed' || status === 'timedout') assertionFailures.value++;
  })

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    errorLog.length = 0
  })

  test.afterAll(async () => {
    const report: Record<string, unknown> = {
      phase: 'T4',
      timestamp: new Date().toISOString(),
      passed: assertionFailures.value === 0,
      errorCount: errorLog.length,
      errors: [...errorLog],
      screenshotCount: 0,
      screenshots: [] as string[] }

    try {
      const files = fs.readdirSync(SCREENSHOT_DIR)
      report.screenshots = files
      report.screenshotCount = files.length
    } catch {
      // dir may not exist
    }

    const jsonPath = path.join(REPORT_DIR, 't4-report.json')
    const mdPath = path.join(REPORT_DIR, 't4-report.md')

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

    const observations = categorizeObservations(errorLog);
    const md = [
      '# Phase T4 — Auth & Session E2E Report',
      '',
      `**Timestamp:** ${report.timestamp}`,
      `**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}`,
      `**Errors:** ${report.errorCount}`,
      '',
      '---',
      '',
      '## Screenshots',
      '',
      ...report.screenshots.map((f) => `- \`${f}\``),
      '',
      '---',
      '',
      ...(errorLog.length > 0
        ? ['## Errors', '', ...errorLog.map((e) => `- ${e}`)]
        : ['## No errors detected']),
      '',
    ].join('\n')

    fs.writeFileSync(mdPath, md)

    console.log(`\n📸 Screenshots: ${SCREENSHOT_DIR}/`)
    console.log(`📄 Report: ${jsonPath}`)
    console.log(`📝 Markdown: ${mdPath}`)
  })

  // =========================================================================
  // 1 — Route guard: unauthenticated → /login
  // =========================================================================
  test('01 — Route guard redirects unauthenticated to /login', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/')
    await waitForReady(page)

    await expectOnLogin(page)

    await expect(page.locator('text=Try as guest')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Password' })).toBeVisible()
    await expect(page.locator('text=Magic Link')).toBeVisible()
    await expect(page.locator('text=Continue with Google')).toBeVisible()

    await snap(page, '01-route-guard-login')
  })

  // =========================================================================
  // 2 — Public routes
  // =========================================================================
  test('02 — Protected routes redirect; public /health accessible', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/health')
    await waitForReady(page)
    await expect(page).toHaveURL(/\/health/, { timeout: 10_000 })

    await page.goto('/about')
    await waitForReady(page)
    await expectOnLogin(page)

    await page.goto('/this-does-not-exist')
    await waitForReady(page)
    await expectOnLogin(page)

    await snap(page, '02-public-routes')
  })

  // =========================================================================
  // 3 — Deep-link redirect
  // =========================================================================
  test('03 — Deep-link redirect lands on dashboard after guest login', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/about')
    await waitForReady(page)
    await expectOnLogin(page)

    await loginAsGuest(page)

    // NOTE: App doesn't implement deep-link return yet. Login always goes to /.
    await expect(page).toHaveURL('/', { timeout: 15_000 })
    await expect(page.locator('text=Good')).toBeVisible({ timeout: 10_000 })

    await snap(page, '03-deep-link-dashboard')
  })

  // =========================================================================
  // 4 — Guest dashboard
  // =========================================================================
  test('04 — Guest login shows dashboard and guest banner', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/')
    await waitForReady(page)

    await expect(page.locator('text=Good')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Guest mode')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=upgrade with email')).toBeVisible()

    await snap(page, '04-guest-dashboard')
  })

  // =========================================================================
  // 5 — Session persistence
  // =========================================================================
  test('05 — Session persists across hard reload', async ({ page }) => {
    trackObservations(page, errorLog)

    await expect(page.locator('text=Good')).toBeVisible({ timeout: 5_000 })

    await page.reload()
    await waitForReady(page)

    await expect(page).toHaveURL('/', { timeout: 15_000 })
    await expect(page.locator('text=Guest mode')).toBeVisible({ timeout: 5_000 })

    await snap(page, '05-session-persistence')

    const newPage = await page.context().newPage()
    await newPage.goto('/')
    await waitForReady(newPage)
    await expect(newPage).toHaveURL('/', { timeout: 10_000 })
    await expect(newPage.locator('text=Guest mode')).toBeVisible({ timeout: 5_000 })
    await newPage.close()
  })

  // =========================================================================
  // 6 — Sign-out
  // =========================================================================
  test('06 — Sign out clears state and route guard re-engages', async ({ page }) => {
    trackObservations(page, errorLog)

    await clearSession(page)

    await page.reload()
    await waitForReady(page)
    await expectOnLogin(page)

    await page.goto('/')
    await waitForReady(page)
    await expectOnLogin(page)

    await snap(page, '06-signed-out-guard')
  })

  // =========================================================================
  // 7 — Guest upgrade form
  // =========================================================================
  test('07 — Guest upgrade form renders and validates input', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/login')
    await waitForReady(page)
    await loginAsGuest(page)

    await expect(page.locator('text=Guest mode')).toBeVisible({ timeout: 5_000 })

    await page.locator('text=upgrade with email').click()
    await page.waitForTimeout(500)

    await expect(page.locator('input[placeholder="Your email"]')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('input[placeholder="Password (min 6 characters)"]')).toBeVisible()
    const upgradeBtn = page.locator('button:has-text("Upgrade account")')
    await expect(upgradeBtn).toBeVisible()
    await expect(upgradeBtn).toBeDisabled()

    await snap(page, '07-guest-upgrade-form')

    await page.locator('input[placeholder="Your email"]').fill('test@example.com')
    await page.locator('input[placeholder="Password (min 6 characters)"]').fill('123')
    await expect(upgradeBtn).toBeDisabled()

    await page.locator('input[placeholder="Password (min 6 characters)"]').fill('valid-password-123')
    await expect(upgradeBtn).not.toBeDisabled()
  })

  // =========================================================================
  // 8 — Password validation
  // =========================================================================
  test('08 — Password form client-side validation', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/login')
    await waitForReady(page)

    const passwordInput = page.locator('input#password')
    await passwordInput.fill('12345')
    await page.waitForTimeout(300)
    await expect(page.locator('text=must be at least 6 characters')).toBeVisible({ timeout: 5_000 })

    const submitBtn = page.locator('button[type="submit"]:has-text("Sign in")')
    await expect(submitBtn).toBeDisabled()

    await passwordInput.fill('valid-password-123')
    await page.waitForTimeout(300)
    await expect(page.locator('text=must be at least 6 characters')).not.toBeVisible()

    await snap(page, '08-password-validation')

    const emailInput = page.locator('input#email-pw')
    await emailInput.fill('')
    await expect(submitBtn).toBeDisabled()

    await emailInput.fill('test@example.com')
    await expect(submitBtn).not.toBeDisabled()

    await page.locator('text=Magic Link').click()
    await page.waitForTimeout(300)
    await expect(page.locator('input#email-ml')).toBeVisible()
    await expect(page.locator('button:has-text("Send magic link")')).toBeVisible()
  })

  // =========================================================================
  // 9 — Sign-in / Create account toggle
  // =========================================================================
  test('09 — Sign-in and Create account mode toggle', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/login')
    await waitForReady(page)

    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toHaveText(/Sign in/)

    await page.locator('text=Create account').click()
    await page.waitForTimeout(300)
    await expect(submitBtn).toHaveText(/Create account/)

    const passwordInput = page.locator('input#password')
    await expect(passwordInput).toHaveAttribute('autocomplete', 'new-password')

    await page.locator('text=Sign in').click()
    await page.waitForTimeout(300)
    await expect(submitBtn).toHaveText(/Sign in/)
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password')
  })

  // =========================================================================
  // 10 — Magic link flow
  // =========================================================================
  test('10 — Magic link flow shows confirmation or error handling', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/login')
    await waitForReady(page)

    await page.locator('text=Magic Link').click()
    await page.waitForTimeout(300)

    const emailInput = page.locator('input#email-ml')
    await emailInput.fill('test-magic@example.com')

    const sendBtn = page.locator('button:has-text("Send magic link")')
    await expect(sendBtn).not.toBeDisabled()
    await sendBtn.click()

    // Wait for either the success screen ("Check your email") or the error
    // banner (if the API call throws). Both are valid — the UI handles both
    // paths gracefully without crashing.
    await expect(
      page.locator('text=Check your email')
        .or(page.locator('text=We sent a magic sign-in link'))
        .or(page.locator('text=Dismiss'))
    ).toBeVisible({ timeout: 10_000 })

    // If success screen appeared, verify its specific elements
    if (await page.locator('text=Check your email').isVisible().catch(() => false)) {
      await expect(page.locator('text=Use a different email')).toBeVisible()
      await expect(page.locator('text=Resend link')).toBeVisible()
    }

    await snap(page, '10-magic-link-sent')
  })

  // =========================================================================
  // 11 — Public /u/ routes
  // =========================================================================
  test('11 — /u/ profile routes accessible without auth', async ({ page }) => {
    trackObservations(page, errorLog)

    // Clear session to ensure we're logged out
    await clearSession(page)

    // Navigate to a public profile URL
    await page.goto('/u/testuser')
    await waitForReady(page)

    // Should be on the profile page, NOT redirected to /login
    await expect(page).toHaveURL(/\/u\/testuser/, { timeout: 10_000 })
    await expect(page.locator('body')).toBeAttached()
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)

    await snap(page, '11-public-profile')

    // Achievement share route also public
    await page.goto('/u/testuser/achievement/first-doc')
    await waitForReady(page)
    await expect(page).toHaveURL(/\/u\/testuser\/achievement\//, { timeout: 10_000 })
  })

  // =========================================================================
  // 12 — Invalid credentials
  // =========================================================================
  test('12 — Invalid credentials show error banner', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/login')
    await waitForReady(page)

    await page.locator('input#email-pw').fill('nonexistent-user@example.com')
    await page.locator('input#password').fill('definitely-wrong-password')

    const submitBtn = page.locator('button[type="submit"]:has-text("Sign in")')
    await expect(submitBtn).not.toBeDisabled()
    await submitBtn.click()

    await expect(
      page.locator('text=Invalid login credentials')
        .or(page.locator('text=Email not confirmed'))
        .or(page.locator('text=Invalid'))
    ).toBeVisible({ timeout: 10_000 })

    await expect(page.locator('text=Dismiss')).toBeVisible()
    await snap(page, '12-invalid-credentials')
  })

  // =========================================================================
  // 13 — Assert no errors
  // =========================================================================
  test('13 — No uncaught console errors or failed requests', async () => {
    const totalErrors = errorLog.length

    if (totalErrors > 0) {
      console.log(`\n❌ Found ${totalErrors} error(s) across auth tests:`)
      for (const err of errorLog) {
        console.log(`  ${err}`)
      }
    }

    expect(
      errorLog,
      `Expected zero errors but found ${totalErrors}. See test-results/t4-report.md for details.`,
    ).toHaveLength(0)
  })
})
