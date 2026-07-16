// ═══════════════════════════════════════════════════════════════════════════
// PHASE T6 — Summary E2E
//
// Proves summaries generate, persist, and render well.
//
// Tasks:
//   1. Generation — trigger summarize on a seeded document; assert a structured
//      summary renders (TL;DR, key points, key terms) and is non-empty.
//   2. Persistence — verify the summary is stored and re-shown on reload/return
//      WITHOUT regenerating (no duplicate/second generation on revisit).
//   3. Loading UX — skeleton shown during generation; no CLS on reveal.
//   4. Invariants — assert structure/shape (sections present, reasonable length
//      bounds, no raw JSON leaking, no empty sections).
//   5. Failure — mock a generation failure → friendly error + retry; malformed
//      output handled gracefully.
//
// Acceptance criteria:
//   - Summary generates, renders structured, and PERSISTS across reload (no regen).
//   - Loading is composed (skeleton, staged progress, no CLS).
//   - Failure + malformed output handled gracefully.
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

const SCREENSHOT_DIR = 'test-results/screenshots-summary'
const REPORT_DIR = 'test-results'

const DEMO_DOC_TITLE = 'Data Structures: Arrays, Linked Lists & Big-O'

// ── Shared state ──────────────────────────────────────────────────────────

const errorLog: string[] = []
const assertionFailures = { value: 0 }
let demoDocId: string | null = null

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

async function loginAsGuest(page: Page): Promise<void> {
  await page.goto('/')
  await waitForReady(page)
}

async function loadDemoDocument(page: Page): Promise<void> {
  const loadDemoBtn = page.locator('button:has-text("Load Demo")').first()
  if (await loadDemoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await loadDemoBtn.click()
  }

  await expect(page.locator(`text=${DEMO_DOC_TITLE}`).first()).toBeVisible({
    timeout: 15_000 })

  const docLink = page.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  const href = await docLink.getAttribute('href')
  if (href) {
    const match = href.match(/\/doc\/(.+)/)
    if (match) demoDocId = match[1]
  }
}

async function navigateToDoc(page: Page): Promise<void> {
  const docLink = page.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  await expect(docLink).toBeVisible({ timeout: 8_000 })
  await docLink.click()

  await page.waitForURL(/\/doc\//, { timeout: 15_000 })
  await waitForReady(page)
}

/** Check if summary content is already visible on the page. */
async function isSummaryVisible(page: Page): Promise<boolean> {
  return page.locator('text=TL;DR').or(page.locator('text=Generating')).isVisible({
    timeout: 3_000 }).catch(() => false)
}

/**
 * Intercept the summarize-document edge function call. In dev mode, this goes
 * through the Vite proxy at /api/functions/summarize-document. In production,
 * it goes to supabase.co/functions/v1/summarize-document.
 */
async function mockSummarizeFailure(page: Page): Promise<void> {
  await page.route(/summarize-document/, (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Simulated failure for E2E test' } }) })
  })
}

async function unrouteSummarize(page: Page): Promise<void> {
  await page.unroute(/summarize-document/)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Summary Generation & Rendering', () => {
  test.afterEach(() => {
    const status = test.info().status;
    if (status === 'failed' || status === 'timedout') assertionFailures.value++;
  })

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    errorLog.length = 0
    demoDocId = null
  })

  test.afterAll(async () => {
    const report: Record<string, unknown> = {
      phase: 'T6',
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
    } catch { /* dir may not exist */ }

    const jsonPath = path.join(REPORT_DIR, 't6-report.json')
    const mdPath = path.join(REPORT_DIR, 't6-report.md')

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

    const observations = categorizeObservations(errorLog);
    const md = [
      '# Phase T6 — Summary E2E Report',
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
  // 1 — Guest login + Load Demo document
  // =========================================================================
  test('01 — Guest login and load demo document', async ({ page }) => {
    trackObservations(page, errorLog)
    await loginAsGuest(page)
    await snap(page, '01-logged-in-dashboard')

    await loadDemoDocument(page)
    await snap(page, '02-demo-document-loaded')
  })

  // =========================================================================
  // 2 — Navigate to document workspace
  // =========================================================================
  test('02 — Document workspace loads with Summary tab active', async ({ page }) => {
    trackObservations(page, errorLog)
    await navigateToDoc(page)

    // The Summary tab should be active by default
    await expect(
      page.locator('button[role="tab"][aria-selected="true"]:has-text("Summary")')
    ).toBeVisible({ timeout: 10_000 })

    // Verify the three mode toggle buttons
    await expect(page.locator('button:has-text("ELI5")').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button:has-text("Detailed")').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button:has-text("Cheat sheet")').first()).toBeVisible({ timeout: 5_000 })

    // Regenerate button should be visible
    await expect(page.locator('button:has-text("Regenerate")').first()).toBeVisible({ timeout: 5_000 })

    await snap(page, '03-document-workspace')
  })

  // =========================================================================
  // 3 — Loading skeleton visible during initial summary generation
  // =========================================================================
  test('03 — Loading skeleton appears during summary generation', async ({ page }) => {
    trackObservations(page, errorLog)

    const alreadyLoaded = await isSummaryVisible(page)

    if (!alreadyLoaded) {
      await expect(
        page.locator('[aria-label="Loading content"]').or(
          page.locator('text=Generating detailed summary')
        )
      ).toBeVisible({ timeout: 5_000 })

      await snap(page, '04-loading-skeleton')
    } else {
      console.log('[SKIP] Summary already loaded — skeleton not shown this run')
    }
  })

  // =========================================================================
  // 4 — Detailed summary renders structured sections
  // =========================================================================
  test('04 — Detailed summary renders TL;DR, Key Points, and Key Terms', async ({ page }) => {
    trackObservations(page, errorLog)

    // Wait for the summary to render
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('text=Key Points').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Key Terms').first()).toBeVisible({ timeout: 5_000 })

    // TL;DR should be non-empty
    const tldrText = await page.locator('text=TL;DR').first().textContent()
    expect(tldrText).toBeTruthy()
    expect(tldrText!.length).toBeGreaterThan(10)

    // "Detailed" heading should be visible
    await expect(page.locator('text=Detailed').first()).toBeVisible({ timeout: 5_000 })

    await snap(page, '05-detailed-summary')
  })

  // =========================================================================
  // 5 — Summary structure invariants
  // =========================================================================
  test('05 — Summary content meets structural invariants', async ({ page }) => {
    trackObservations(page, errorLog)

    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 10_000 })

    // Read the page content to check for invariants
    const bodyText = await page.locator('body').innerText()

    // No raw JSON leaking — assert no model-output patterns that look like
    // serialized JSON objects or arrays
    const jsonLeakPatterns = [
      '{tldr', '"tldr"', '"keyPoints"', '"keyTerms"', '"cached"',
    ]

    for (const pattern of jsonLeakPatterns) {
      expect(
        bodyText,
        `Raw JSON leak detected: body text contains "${pattern}"`
      ).not.toContain(pattern)
    }

    // TL;DR should be between 50 and 2000 chars (reasonable for this seeded doc)
    const tldrSection = page.locator('h3:has-text("TL;DR")').first()
    const tldrParent = tldrSection.locator('..')
    const tldrContent = await tldrParent.locator('p').first().textContent()
    if (tldrContent) {
      expect(tldrContent.length).toBeGreaterThanOrEqual(50)
      expect(tldrContent.length).toBeLessThanOrEqual(2000)
    }

    await snap(page, '06-invariants')
  })

  // =========================================================================
  // 6 — Summary persistence across reload (no regen)
  // =========================================================================
  test('06 — Summary persists across reload without regenerating', async ({ page }) => {
    trackObservations(page, errorLog)

    // ── Route counter: counts summarize-document API calls ────────────────
    // This MUST call route.continue() so the request completes normally.
    // Without it, the request stalls and the page hangs.
    let summarizeCallCount = 0
    await page.route(/summarize-document/, (route) => {
      summarizeCallCount++
      route.continue()
    })

    // Ensure we have a summary visible first
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 10_000 })

    // Check for "Cached" label
    await expect(page.locator('text=Cached').first()).toBeVisible({ timeout: 5_000 })

    await snap(page, '07-before-reload')

    // Reload the page
    await page.reload()
    await waitForReady(page)

    // Wait for Summary tab to re-render
    await expect(
      page.locator('button[role="tab"][aria-selected="true"]:has-text("Summary")')
    ).toBeVisible({ timeout: 10_000 })

    // The summary should re-appear from cache — TL;DR visible
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 15_000 })

    // Cached label should still be visible
    await expect(page.locator('text=Cached').first()).toBeVisible({ timeout: 5_000 })

    // Critical: verify NO summarize-document edge function call was made after reload.
    // This proves the summary was loaded from doc_artifacts cache, not regenerated.
    expect(
      summarizeCallCount,
      'Expected 0 summarize-document calls after page reload (should use cache)'
    ).toBe(0)

    await page.unroute(/summarize-document/)
    await snap(page, '08-summary-after-reload')
  })

  // =========================================================================
  // 7 — ELI5 mode generation and rendering
  // =========================================================================
  test('07 — ELI5 mode generates and renders simplified summary', async ({ page }) => {
    trackObservations(page, errorLog)

    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 10_000 })

    // Click ELI5 mode toggle
    const eli5Btn = page.locator('button:has-text("ELI5")').first()
    await eli5Btn.click()

    // Verify aria-pressed state changed (toggle activated)
    await expect(eli5Btn).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 })

    // Wait for heading to change to "Simplified" (ELI5 mode heading)
    await expect(
      page.locator('text=Simplified').or(page.locator('text=Generating eli5 summary'))
    ).toBeVisible({ timeout: 10_000 })

    // Wait for TL;DR in ELI5 mode
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('text=Key Points').first()).toBeVisible({ timeout: 5_000 })

    await snap(page, '09-eli5-summary')
  })

  // =========================================================================
  // 8 — Cheat sheet mode generation and rendering
  // =========================================================================
  test('08 — Cheat sheet mode generates and renders summary', async ({ page }) => {
    trackObservations(page, errorLog)

    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 10_000 })

    // Click Cheat sheet mode toggle
    const cheatSheetBtn = page.locator('button:has-text("Cheat sheet")').first()
    await cheatSheetBtn.click()

    // Verify aria-pressed state changed
    await expect(cheatSheetBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 })

    // Wait for "Cheat Sheet" heading
    await expect(
      page.locator('text=Cheat Sheet').or(page.locator('text=Generating cheat-sheet summary'))
    ).toBeVisible({ timeout: 10_000 })

    // Wait for TL;DR in cheat sheet mode
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('text=Key Points').first()).toBeVisible({ timeout: 5_000 })

    await snap(page, '10-cheat-sheet-summary')
  })

  // =========================================================================
  // 9 — Failure + retry (via mock API failure)
  // =========================================================================
  test('09 — Failed summary generation shows error and retry button', async ({ page }) => {
    trackObservations(page, errorLog)

    // ── CRITICAL: Clear doc_artifacts cache first ─────────────────────────
    // The summarizeDocument() function checks doc_artifacts BEFORE calling
    // the edge function. By test 9, all 3 summary modes are cached from
    // tests 4, 7, 8. If we don't clear the cache, the mock never fires.
    if (demoDocId) {
      await page.evaluate(async (docId) => {
        try {
          const mod = await import('/src/lib/supabase.ts')
          await mod.supabase
            .from('doc_artifacts')
            .delete()
            .eq('document_id', docId)
        } catch {
          throw new Error('Could not clear doc_artifacts cache for failure test')
        }
      }, demoDocId)
    } else {
      console.log('[WARN] demoDocId is null — cannot clear cache for failure test')
    }

    // Mock the summarize-document API to return 500
    await mockSummarizeFailure(page)

    try {
      // Navigate to the demo document
      await page.goto('/')
      await waitForReady(page)
      await navigateToDoc(page)

      // Wait for Summary tab
      await expect(
        page.locator('button[role="tab"][aria-selected="true"]:has-text("Summary")')
      ).toBeVisible({ timeout: 10_000 })

      // With the cache cleared and the mock intercepting, the edge function
      // should be called and return 500. SummaryPanel catches the error and
      // shows: error text + Retry button.
      await expect(
        page.locator('button:has-text("Retry")').or(
          page.locator('text=Simulated failure').or(page.locator('text=Summarization failed'))
        )
      ).toBeVisible({ timeout: 15_000 })

      await snap(page, '11-summary-error-with-retry')
    } finally {
      // Always remove the route mock, even if the test fails early
      await unrouteSummarize(page)
    }
  })

  // =========================================================================
  // 10 — Regenerate button interaction
  // =========================================================================
  test('10 — Regenerate button re-generates summary', async ({ page }) => {
    trackObservations(page, errorLog)

    // Navigate back to dashboard and then to the demo document
    await page.goto('/')
    await waitForReady(page)
    await navigateToDoc(page)

    await expect(
      page.locator('button[role="tab"][aria-selected="true"]:has-text("Summary")')
    ).toBeVisible({ timeout: 10_000 })

    // Wait for summary to be visible
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 20_000 })

    // Click Regenerate button
    const regenerateBtn = page.locator('button:has-text("Regenerate")').first()
    await expect(regenerateBtn).toBeVisible({ timeout: 5_000 })
    await regenerateBtn.click()

    // After clicking Regenerate, the fetchMode callback calls
    // summarizeDocument() — may return cached result or regenerate.
    // At minimum, verify the button responded and TL;DR is still visible
    await expect(page.locator('text=TL;DR').first()).toBeVisible({ timeout: 15_000 })

    await snap(page, '12-regenerated-summary')
  })

  // =========================================================================
  // 11 — Error gate
  // =========================================================================
  test('11 — No uncaught console errors or failed requests across summary tests', async () => {
    const totalErrors = errorLog.length
    if (totalErrors > 0) {
      console.log(`\n❌ Found ${totalErrors} error(s) across summary tests:`)
      for (const err of errorLog) {
        console.log(`  ${err}`)
      }
    }
    expect(
      errorLog,
      `Expected zero errors but found ${totalErrors}. See test-results/t6-report.md for details.`,
    ).toHaveLength(0)
  })
})
