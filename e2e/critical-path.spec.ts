// ═══════════════════════════════════════════════════════════════════════════
// PHASE T3 — Critical-Path E2E Smoke Suite
//
// Proves the demo flow is alive after every change/deploy.
//
// Critical path:
//   login (guest) → dashboard → load demo doc → Summary tab → Quiz tab →
//   Flashcards tab → Chat tab → dark-mode recapture → back to light
//
// Each feature tab is not just rendered but *interacted with* — buttons are
// clicked, inputs are typed into — to verify that event handlers and state
// transitions work.  AI-dependent steps (generation, query) verify the
// loading/progress UI rather than a successful AI response, keeping the
// suite fast and reliable without external dependencies.
//
// Acceptance criteria:
//   - Green across all 4 feature surfaces + dashboard
//   - Zero uncaught console errors / failed network requests
//   - Screenshots captured for each screen (light + dark)
//   - Runnable against local dev OR Netlify preview via env
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
import * as fs from 'fs'
import * as path from 'path'

// ── Constants ──────────────────────────────────────────────────────────────

const SCREENSHOT_DIR = 'test-results/screenshots'
const REPORT_DIR = 'test-results'

// Stable substring that matches the demo doc title in the DB
const DEMO_TITLE_PART = 'Data Structures: Arrays'

// ── Shared state ──────────────────────────────────────────────────────────

/** All errors collected across the critical path. */
const errorLog: string[] = []
const assertionFailures = { value: 0 }

// ── Error tracking helper ─────────────────────────────────────────────────

// trackErrors replaced by shared trackObservations from helpers/reporter

// ── Screenshot helper ─────────────────────────────────────────────────────

async function snap(page: Page, label: string): Promise<void> {
  const filename = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  await page.waitForTimeout(400)
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${filename}.png`),
    fullPage: true })
}

// ── Wait for page to settle ───────────────────────────────────────────────

async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Critical-path smoke', () => {
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
    // ── Emit report ──────────────────────────────────────────
    const report: {
      phase: string
      timestamp: string
      passed: boolean
      errorCount: number
      errors: string[]
      screenshotCount: number
      screenshots: string[]
    } = {
      phase: 'T3',
      timestamp: new Date().toISOString(),
      passed: assertionFailures.value === 0,
      errorCount: errorLog.length,
      errors: [...errorLog],
      screenshotCount: 0,
      screenshots: [] }

    try {
      const files = fs.readdirSync(SCREENSHOT_DIR)
      report.screenshots = files
      report.screenshotCount = files.length
    } catch {
      // dir may not exist yet
    }

    const jsonPath = path.join(REPORT_DIR, 't3-report.json')
    const mdPath = path.join(REPORT_DIR, 't3-report.md')

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

    const observations = categorizeObservations(errorLog);
    const md = [
      '# Phase T3 — Critical-Path Smoke Report',
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
  // 1 — Dashboard loads (pre-authenticated via shared storageState)
  // =========================================================================
  test('01 — Dashboard loads (pre-authenticated)', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.goto('/')
    await waitForReady(page)

    await expect(page.locator('text=Good')).toBeVisible({ timeout: 10_000 })
    await snap(page, '01-dashboard-loaded')
  })

  // =========================================================================
  // 2 — Load Demo document
  // =========================================================================
  test('02 — Load Demo document', async ({ page }) => {
    trackObservations(page, errorLog)

    const emptyState = page.locator('text=Your library is empty')

    if (await emptyState.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const loadDemoBtn = page.locator('button:has-text("Load Demo")').first()
      await expect(loadDemoBtn).toBeVisible({ timeout: 5_000 })
      await loadDemoBtn.click()

      await expect(page.locator('[data-testid="doc-link"]').first()).toBeVisible({
        timeout: 20_000 })
    }

    await expect(page.locator('text=Cards due today')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Study streak')).toBeVisible()
    await expect(page.locator('text=Avg mastery')).toBeVisible()

    await snap(page, '03-dashboard-with-demo')
  })

  // =========================================================================
  // 3 — Document workspace
  // =========================================================================
  test('03 — Document workspace loads', async ({ page }) => {
    trackObservations(page, errorLog)

    const docLink = page
      .locator('[data-testid="doc-link"]')
      .first()
    await expect(docLink).toBeVisible({ timeout: 5_000 })
    await docLink.click()

    await page.waitForURL(/\/doc\//, { timeout: 15_000 })
    await waitForReady(page)

    await expect(page.locator(`h1:has-text("${DEMO_TITLE_PART}")`)).toBeVisible({
      timeout: 10_000 })

    for (const label of [
      'Summary',
      'Exam',
      'Map',
      'Mastery',
      'Flashcards',
      'Quiz',
      'Chat',
      'Notes',
    ]) {
      await expect(
        page.getByRole('tab', { name: label }).first(),
      ).toBeVisible({ timeout: 3_000 })
    }

    await expect(page.locator('a[aria-label="Back to library"]')).toBeVisible()
    await snap(page, '04-document-workspace')
  })

  // =========================================================================
  // 4 — Summary tab → mode toggle
  // =========================================================================
  test('04 — Summary tab renders and responds to mode toggle', async ({ page }) => {
    trackObservations(page, errorLog)

    await waitForReady(page)

    const detailedBtn = page.locator('button:has-text("Detailed")').first()
    await expect(detailedBtn).toBeVisible({ timeout: 10_000 })

    const eli5Btn = page.locator('button:has-text("ELI5")').first()
    await expect(eli5Btn).toBeVisible()

    await eli5Btn.click()
    await page.waitForTimeout(500)

    const detailedPressed = await detailedBtn.getAttribute('aria-pressed')
    const eli5Pressed = await eli5Btn.getAttribute('aria-pressed')
    expect(
      detailedPressed === 'false' || eli5Pressed === 'true',
      'Expected mode toggle to switch from Detailed to ELI5',
    ).toBe(true)

    await snap(page, '05-summary-tab')
  })

  // =========================================================================
  // 5 — Quiz tab → click Generate
  // =========================================================================
  test('05 — Quiz tab generates and shows loading or error state', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.getByRole('tab', { name: 'Quiz' }).click()
    await page.waitForTimeout(1_000)

    const generateBtn = page
      .locator('button:has-text("Generate Quiz"):not([disabled])')
      .first()

    const hasQuiz = await page
      .locator('text=Submit Answer')
      .isVisible()
      .catch(() => false)

    if (!hasQuiz) {
      await expect(generateBtn).toBeVisible({ timeout: 10_000 })
      await generateBtn.click()
      await page.waitForTimeout(500)

      // After clicking Generate: loading UI, progress, OR error/Retry
      // (the API call fails fast without Mistral — error banner appears)
      await expect(
        page
          .locator('button:has-text("Generating"):disabled')
          .or(page.locator('text=Reading document'))
          .or(page.locator('text=Creating questions'))
          .or(page.locator('text=Retry')),
      ).toBeVisible({ timeout: 8_000 })
    }

    await snap(page, '06-quiz-tab')
  })

  // =========================================================================
  // 6 — Flashcards tab → click Generate
  // =========================================================================
  test('06 — Flashcards tab generates and shows loading or error state', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.getByRole('tab', { name: 'Flashcards' }).click()
    await page.waitForTimeout(1_000)

    const generateBtn = page
      .locator('button:has-text("Generate Flashcards"):not([disabled])')
      .first()

    const hasCards = await page
      .locator('text=Front')
      .or(page.locator('text=Answer'))
      .isVisible()
      .catch(() => false)

    if (!hasCards) {
      await expect(generateBtn).toBeVisible({ timeout: 10_000 })
      await generateBtn.click()
      await page.waitForTimeout(500)

      await expect(
        page
          .locator('button:has-text("Generating"):disabled')
          .or(page.locator('text=Reading document'))
          .or(page.locator('text=Creating flashcards'))
          .or(page.locator('text=Retry')),
      ).toBeVisible({ timeout: 8_000 })
    }

    await snap(page, '07-flashcards-tab')
  })

  // =========================================================================
  // 7 — Chat tab → type + send
  // =========================================================================
  test('07 — Chat tab accepts input and sends a message', async ({ page }) => {
    trackObservations(page, errorLog)

    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.waitForTimeout(1_000)

    const chatInput = page.locator('input[placeholder*="Ask a question"]')
    await expect(chatInput).toBeVisible({ timeout: 10_000 })

    const sendBtn = page.locator('button:has-text("Send")')
    await expect(sendBtn).toBeVisible()

    await chatInput.fill('What is a linked list?')
    await expect(chatInput).toHaveValue('What is a linked list?')

    await sendBtn.click()

    // User message bubble appears
    await expect(page.locator('text=What is a linked list?').first()).toBeVisible({
      timeout: 5_000 })

    // Input is cleared
    await expect(chatInput).toHaveValue('')

    // Assistant responds (loading, error, or answer)
    await expect(
      page
        .locator('text=Thinking')
        .or(page.locator('text=Retry'))
        .or(page.locator('text=sources')),
    ).toBeVisible({ timeout: 8_000 })

    await snap(page, '08-chat-tab')
  })

  // =========================================================================
  // 8 — Dark mode screenshots
  // =========================================================================
  test('08 — Dark mode screenshots', async ({ page }) => {
    trackObservations(page, errorLog)

    // Back to dashboard
    await page.locator('a[aria-label="Back to library"]').first().click()
    await page.waitForURL('/', { timeout: 10_000 })
    await waitForReady(page)

    // Toggle theme: cycleMode cycles system → light → dark → system.
    // Default is 'light' (localStorage), so one click reaches 'dark'.
    const themeBtn = page.locator('button[aria-label*="Current:"]')
    await themeBtn.click()
    await page.waitForTimeout(1_500)

    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )
    expect(themeAttr).toBe('dark')

    await snap(page, '09-dashboard-dark')

    // Document page in dark
    const docLink = page
      .locator('[data-testid="doc-link"]')
      .first()
    if (await docLink.isVisible().catch(() => false)) {
      await docLink.click()
      await page.waitForURL(/\/doc\//, { timeout: 10_000 })
      await waitForReady(page)
      await snap(page, '10-document-dark')
    }

    // Back to light (dark → system → light = 2 clicks)
    for (let i = 0; i < 2; i++) {
      await themeBtn.click()
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(500)

    const themeFinal = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )
    expect(themeFinal).toBe('light')
  })

  // =========================================================================
  // 9 — Assert no errors
  // =========================================================================
  test('09 — No uncaught console errors or failed requests', async () => {
    const totalErrors = errorLog.length

    if (totalErrors > 0) {
      console.log(`\n❌ Found ${totalErrors} error(s) across the critical path:`)
      for (const err of errorLog) {
        console.log(`  ${err}`)
      }
    }

    expect(
      errorLog,
      `Expected zero errors but found ${totalErrors}. See test-results/t3-report.md for details.`,
    ).toHaveLength(0)
  })
})
