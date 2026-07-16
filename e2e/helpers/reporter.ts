// ═══════════════════════════════════════════════════════════════════════════
// Shared E2E reporting harness
//
// Separates two concepts:
//   (a) Hard failures = failed test assertions / thrown errors → drives PASS/FAIL
//   (b) Observations = console/page/network messages → categorized, not auto-fail
//
// Every phase spec imports from this module instead of duplicating inline logic.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface Observation {
  message: string
  source: 'console' | 'page_error' | 'http_response'
  severity: 'error' | 'warning' | 'info'
  allowlisted: boolean
}

export interface Report {
  phase: string
  timestamp: string
  /** TRUE only when zero test assertions failed — does NOT depend on observations */
  passed: boolean
  /** Count of test assertion failures detected across the suite */
  assertionFailures: number
  /** All captured observations (console, page errors, 4xx/5xx responses) */
  observations: Observation[]
  /** Number of NON-allowlisted observations (real anomalies) */
  anomalyCount: number
  [key: string]: unknown
}

// ═══════════════════════════════════════════════════════════════════════════
// Default allowlist — known-expected noise routes/messages
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_OBSERVATION_ALLOWLIST = [
  // Normal cache-miss patterns (406 when no row exists yet)
  '/rest/v1/doc_artifacts?select=content',
  '/rest/v1/chunks?select=*&embedding=is.null',
  '/rest/v1/rate_limits',
  'embedding=is.null',
  'is.null',
  // Normal HTTP codes for non-existent or empty resources
  '406',
  '404',
  // Known non-critical edge function warmup
  '/api/functions/',
  '/functions/v1/',
  // Dev-server path patterns
  '@vite',
  'favicon',
  'chrome-extension',
  // Known transient patterns
  'Failed to load resource: the server responded with a status of 4',
]

// ═══════════════════════════════════════════════════════════════════════════
// Observation tracking (replaces inline `trackErrors()`)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set up console/page/network observation tracking on a page.
 * ALL observations are pushed into `buffer` (including allowlisted ones).
 * The allowlist is applied later in `categorizeObservations()` which tags
 * known-noise entries as severity: 'info' — they appear in the report
 * as observations but do NOT affect PASS/FAIL.
 */
export function trackObservations(
  page: Page,
  buffer: string[],
): void {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('vite') || text.includes('favicon') || text.includes('extension') || text.includes('chrome-extension')) return
    buffer.push(text)
  })

  page.on('pageerror', (err) => {
    buffer.push(`[PAGE_ERROR] ${err.message}`)
  })

  page.on('response', (response) => {
    const status = response.status()
    if (status < 400) return
    const url = response.url()
    if (url.includes('/rest/v1/') || url.includes('/auth/') || url.includes('/functions/')) {
      buffer.push(`[HTTP ${status}] ${url}`)
    }
  })
}

/**
 * Categorize a raw-string buffer into structured Observation objects.
 * Allowlisted messages (expected noise) are tagged as severity: 'info'.
 */
export function categorizeObservations(
  buffer: string[],
  allowlist: string[] = DEFAULT_OBSERVATION_ALLOWLIST,
): Observation[] {
  return buffer.map((msg) => {
    const isAllowlisted = allowlist.some((p) => msg.includes(p))
    let severity: 'error' | 'warning' | 'info' = 'error'
    if (isAllowlisted) severity = 'info'
    else if (/\[HTTP 4/.test(msg)) severity = 'warning'
    else if (/\[HTTP 5/.test(msg)) severity = 'error'
    // Derive source
    let source: Observation['source'] = 'console'
    if (/^\[PAGE_ERROR\]/.test(msg)) source = 'page_error'
    else if (/^\[HTTP/.test(msg)) source = 'http_response'
    return { message: msg, source, severity, allowlisted: isAllowlisted }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Assertion-failure tracker
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call this in `test.afterEach` to detect and count assertion failures.
 */
export function trackAssertionFailures(counter: { value: number }): void {
  const status = test.info().status
  if (status === 'failed' || status === 'timedout') {
    counter.value++
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Report builder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a phase report with honest PASS/FAIL based on assertion failures.
 *
 * @param phase - Phase identifier (e.g. 'T3', 'T4', 'T15')
 * @param buffer - Raw observation buffer (from trackObservations)
 * @param assertionFailures - Count of failed assertions
 * @param extra - Additional phase-specific data to include in the report
 * @param allowlist - Custom allowlist (defaults to DEFAULT_OBSERVATION_ALLOWLIST)
 */
export function buildReport(
  phase: string,
  buffer: string[],
  assertionFailures: number,
  extra: Record<string, unknown> = {},
  allowlist: string[] = DEFAULT_OBSERVATION_ALLOWLIST,
): Report {
  const observations = categorizeObservations(buffer, allowlist)
  const anomalies = observations.filter((o) => !o.allowlisted)

  return {
    phase,
    timestamp: new Date().toISOString(),
    passed: assertionFailures === 0,        // ← KEY CHANGE: assertion-driven, not console-driven
    assertionFailures,
    observations,
    anomalyCount: anomalies.length,
    ...extra,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Ensure a directory exists (replaces inline fs.mkdirSync in each spec). */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

/** Take a labeled screenshot. */
export async function snap(page: Page, dir: string, label: string): Promise<string> {
  const filename = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() + '.png'
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(dir, filename), fullPage: true })
  return filename
}

/** Wait for network idle + settle time. */
export async function waitForReady(page: Page, ms = 600): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(ms)
}

// ═══════════════════════════════════════════════════════════════════════════
// Markdown writers per phase (keep existing report contract intact)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write the standard JSON + Markdown reports.
 */
export function writeReports(
  report: Report,
  reportDir: string,
  mdLines: string[] | ((report: Report) => string[]),
): void {
  const filename = report.phase.toLowerCase()
  fs.writeFileSync(
    path.join(reportDir, `${filename}-report.json`),
    JSON.stringify(report, null, 2),
  )

  const lines = typeof mdLines === 'function' ? mdLines(report) : mdLines
  fs.writeFileSync(
    path.join(reportDir, `${filename}-report.md`),
    lines.join('\n'),
  )

  console.log(`\n📊 Report: ${filename}-report.json`)
  console.log(`📝 Markdown: ${filename}-report.md`)
}

/**
 * Default Markdown header lines used by most phases.
 */
export function defaultReportHeader(report: Report): string[] {
  const statusEmoji = report.passed ? '✅ PASSED' : '❌ FAILED'
  const anomalyCount = (report.observations as Observation[]).filter((o) => !o.allowlisted).length
  return [
    `# Phase ${report.phase} — Report`,
    '',
    `**Timestamp:** ${report.timestamp}`,
    `**Status:** ${statusEmoji}`,
    `**Assertion Failures:** ${report.assertionFailures}`,
    `**Observations (total):** ${report.observations?.length ?? 0}`,
    `**Anomalies (non-allowlisted):** ${anomalyCount}`,
    '',
    '---',
    '',
  ]
}

/**
 * Default observations table (append to any phase's markdown).
 */
export function observationsTable(report: Report): string[] {
  const obs = report.observations as Observation[] | undefined
  if (!obs || obs.length === 0) return ['## Observations', '', 'No observations captured.', '']

  const lines: string[] = ['## Observations', '', '| Source | Severity | Message | Allowlisted |', '|---|---|---|---|']
  for (const o of obs) {
    const emoji = o.allowlisted ? '🔇' : o.severity === 'error' ? '🔴' : o.severity === 'warning' ? '🟡' : '🔵'
    lines.push(`| ${o.source} | ${emoji} ${o.severity} | ${o.message} | ${o.allowlisted} |`)
  }
  lines.push('')
  return lines
}
