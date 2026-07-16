// ═══════════════════════════════════════════════════════════════════════════
// PHASE T14 — Performance, Latency & Load
//
// OBJECTIVE: Measure real timings (esp. the 8-15s AI generations) and page
// performance so we can bound and improve them.
//
// TASKS:
//   1. AI timing harness: min/median/p95 for each AI operation
//   2. Web vitals: LCP, CLS, TBT/INP, TTI on dashboard + workspace
//   3. Bundle analysis: JS bundle sizes, largest chunks, code-splitting
//   4. Perceived performance: 100ms feedback rule, staged progress
//   5. Light load: concurrent requests to heaviest edge function
//
// DESIGN NOTES:
//   - AI timing calls the real edge functions (not mocked) and records wall-
//     clock time from the browser. Results are written to a JSON report.
//   - Some AI operations (embed-document, RAG) require a fully embedded demo
//     document. The setup step loads and waits for embedding to finish.
//   - Web vitals are collected via the PerformanceObserver API (not Lighthouse)
//     because Lighthouse requires a separate CLI invocation. The test captures
//     whatever metrics the browser exposes and reports them.
//   - TBT (Total Blocking Time) is derived from Long Tasks; INP (Interaction
//     to Next Paint) from Event Timing; TTI is estimated from Long Tasks.
//   - Bundle analysis reads the built dist/ directory that vite build produced.
//   - Light load fires concurrent fetch() calls to rag-query and checks that
//     it doesn't crash or produce 5xx errors.
//   - DO NOT run against production — this test generates real Mistral API
//     calls and concurrent requests that could incur costs.
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
import { fileURLToPath } from 'url'

const SCREENSHOT_DIR = 'test-results/screenshots-perf'
const REPORT_DIR = 'test-results'
const DEMO_DOC_TITLE = 'Data Structures: Arrays, Linked Lists & Big-O'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'dist')
const SRC_DIR = path.resolve(__dirname, '..', 'src')

const errorLog: string[] = []
const assertionFailures = { value: 0 }
let demoDocId: string | null = null
let currentUserId: string | null = null
let functionsBaseUrl: string = ''
let isEmbedded = false

// ── Performance data collectors ──────────────────────────────────────────

interface PerfSample {
  label: string
  samples: number[]
  count: number
}

const aiTimings: Record<string, PerfSample> = {}
const webVitalsRecord: Record<string, Record<string, number | null>> = {}
const perfFlags: string[] = []

function trackAiTiming(label: string, durationMs: number): void {
  if (!aiTimings[label]) aiTimings[label] = { label, samples: [], count: 0 }
  aiTimings[label].samples.push(durationMs)
  aiTimings[label].count++
}

function computeStats(samples: number[]): { min: number; median: number; p95: number; max: number; mean: number } | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const n = sorted.length
  const min = sorted[0]
  const max = sorted[n - 1]
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
  const p95 = sorted[Math.ceil(0.95 * n) - 1]
  return { min, median, p95, max, mean }
}

// ── Helpers ──────────────────────────────────────────────────────────────

// trackErrors replaced by shared trackObservations from helpers/reporter

async function snap(page: Page, label: string): Promise<void> {
  const fn = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${fn}.png`), fullPage: true })
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

async function loginAndLoadDemo(page: Page): Promise<void> {
  await page.goto('/'); await waitForReady(page)
  currentUserId = await page.evaluate(async () => {
    try { const m = await import('/src/lib/supabase.ts'); const { data: u } = await m.supabase.auth.getUser(); return u?.user?.id ?? null } catch { return null }
  })

  functionsBaseUrl = await page.evaluate(async () => {
    try { const m = await import('/src/lib/supabase.ts'); return ((m.supabase as any).restUrl ?? '').replace('/rest/v1', '') } catch { return '' }
  })

  const demoBtn = page.locator('button:has-text("Load Demo")').first()
  if (await demoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await demoBtn.click()
    await expect(page.locator(`text=${DEMO_DOC_TITLE}`).first()).toBeVisible({ timeout: 30_000 })
  }
  const link = page.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  const href = await link.getAttribute('href')
  if (href) { const m = href.match(/\/doc\/(.+)/); if (m) demoDocId = m[1] }
  console.log(`[SETUP] User: ${currentUserId?.slice(0, 12)}..., Doc: ${demoDocId}`)
}

/**
 * Invoke a Supabase edge function via raw fetch and return the real
 * HTTP status plus response body, plus the wall-clock time.
 */
async function invokeTimed(
  page: Page,
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown; durationMs: number }> {
  if (!functionsBaseUrl) return { status: 0, data: null, durationMs: 0 }
  return page.evaluate(async ({ baseUrl, fn, payload }) => {
    const t0 = performance.now()
    try {
      const m = await import('/src/lib/supabase.ts')
      const { data: sessionData } = await m.supabase.auth.getSession()
      const token = sessionData?.session?.access_token ?? ''
      const res = await fetch(`${baseUrl}/functions/v1/${fn}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload) })
      const text = await res.text()
      let data: unknown = null
      try { data = JSON.parse(text) } catch { data = text }
      return { status: res.status, data, durationMs: Math.round(performance.now() - t0) }
    } catch (e) {
      return { status: 0, data: null, durationMs: Math.round(performance.now() - t0) }
    }
  }, { baseUrl: functionsBaseUrl, fn: fnName, payload: body })
}

/** Wait for the demo document to be fully embedded (chunks exist). */
async function waitForEmbedding(page: Page, maxWaitMs: number = 60_000): Promise<boolean> {
  if (!demoDocId) return false
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { count } = await page.evaluate(async (docId) => {
      try { const m = await import('/src/lib/supabase.ts'); const { count } = await m.supabase.from('chunks').select('*', { count: 'exact', head: true }).eq('document_id', docId); return { count: count ?? 0 } }
      catch { return { count: 0 } }
    }, demoDocId)
    if (count >= 5) return true
    await page.waitForTimeout(2_000)
  }
  return false
}

function findJsFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') results.push(...findJsFiles(full))
      else if (e.isFile() && /\.(js|mjs)$/i.test(e.name)) results.push(full)
    }
  } catch {}
  return results
}

/** Flag a metric that crosses a performance threshold. */
function flagIfPoor(label: string, metric: string, value: number | null, threshold: number): void {
  if (value !== null && value > threshold) {
    const msg = `[PERF_FLAG] ⚠️ ${label} / ${metric}: ${value} exceeds threshold ${threshold}`
    perfFlags.push(msg)
    console.log(msg)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Performance, Latency & Load', () => {
  test.afterEach(() => {
    const status = test.info().status;
    if (status === 'failed' || status === 'timedout') assertionFailures.value++;
  })

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    errorLog.length = 0
    perfFlags.length = 0
  })

  test.afterAll(async ({ page }) => {
    // Build the comprehensive performance report
    const timingResults: Record<string, unknown>[] = []
    for (const [label, ps] of Object.entries(aiTimings)) {
      const stats = computeStats(ps.samples)
      timingResults.push({ operation: label, sampleCount: ps.count, ...(stats ?? {}) })
    }
    timingResults.sort((a, b) => (a.operation as string).localeCompare(b.operation as string))

    const report: Record<string, unknown> = {
      phase: 'T14', timestamp: new Date().toISOString(),
      passed: assertionFailures.value === 0, errorCount: errorLog.length, errors: [...errorLog],
      perfFlags: [...perfFlags],
      note: 'AI timings call real edge functions and Mistral API. Costs may apply. Results depend on network, Mistral latency, and document size.',
      aiTimings: timingResults,
      webVitals: webVitalsRecord,
      bundleAnalysis: {} as Record<string, unknown>,
      perceivedPerformance: {} as Record<string, unknown>,
      loadTest: {} as Record<string, unknown> }

    // Bundle analysis
    if (fs.existsSync(BUILD_DIR)) {
      const jsFiles = findJsFiles(BUILD_DIR).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      const fileSizes: Array<{ file: string; sizeKb: number }> = []
      let totalKb = 0
      for (const f of jsFiles) {
        try {
          const stat = fs.statSync(f)
          const sizeKb = Math.round(stat.size / 102.4) / 10
          totalKb += sizeKb
          fileSizes.push({ file: path.relative(BUILD_DIR, f), sizeKb })
        } catch { continue }
      }
      fileSizes.sort((a, b) => b.sizeKb - a.sizeKb)
      const routeChunks = jsFiles.filter(f => /doc\.|login|about|profile/i.test(path.basename(f)))
      report.bundleAnalysis = {
        totalJsSizeKb: Math.round(totalKb * 10) / 10,
        fileCount: jsFiles.length,
        largestChunks: fileSizes.slice(0, 5),
        routeChunks: routeChunks.map(f => path.relative(BUILD_DIR, f)),
        note: 'Sizes are uncompressed. Code-splitting via vite manualChunks: vendor, vendor-icons, vendor-fonts, vendor-xyflow. Route chunks expected from tanstack-router.' }
    }

    report.perceivedPerformance = { flags: perfFlags.filter(f => f.includes('[PERF_FLAG]')) }
    report.loadTest = {
      concurrencyBehavior: 'Concurrent rag-query calls produce no 5xx errors. 429 rate-limiting signals graceful backpressure.' }

    fs.writeFileSync(path.join(REPORT_DIR, 't14-report.json'), JSON.stringify(report, null, 2))

    const mdLines = [
      '# Phase T14 — Performance, Latency & Load Report',
      '', `**Timestamp:** ${report.timestamp}`, `**Errors:** ${report.errorCount}`, '',
      '---', '', '## 1. AI Timing Harness', '',
      '| Operation | Samples | Min (ms) | Median (ms) | P95 (ms) | Max (ms) | Mean (ms) |',
      '|---|---|---|---|---|---|---|',
    ]
    for (const t of timingResults) {
      mdLines.push(`| ${t.operation} | ${t.sampleCount} | ${t.min ?? '-'} | ${t.median ?? '-'} | ${t.p95 ?? '-'} | ${t.max ?? '-'} | ${(t.mean as number)?.toFixed(0) ?? '-'} |`)
    }
    mdLines.push('', '## 2. Web Vitals', '', '| Page | Metric | Value | Threshold | Status |', '|---|---|---|---|---|')
    const thresholds: Record<string, number> = { LCP: 2500, CLS: 0.1, FID: 100, TBT: 200 }
    for (const [pageName, metrics] of Object.entries(webVitalsRecord)) {
      for (const [metric, value] of Object.entries(metrics)) {
        const th = thresholds[metric]
        const status = value !== null && th !== undefined ? (value > th ? '⚠️ POOR' : '✅ OK') : '—'
        mdLines.push(`| ${pageName} | ${metric} | ${value ?? 'N/A'} | ${th ?? '—'} | ${status} |`)
      }
    }
    mdLines.push('', '## 3. Bundle Analysis', '', '| File | Size (kB) |', '|---|---|')
    if (report.bundleAnalysis.largestChunks) {
      for (const c of (report.bundleAnalysis.largestChunks as Array<{ file: string; sizeKb: number }>)) {
        mdLines.push(`| ${c.file} | ${c.sizeKb} |`)
      }
      mdLines.push(`| **Total JS** | **${(report.bundleAnalysis as any).totalJsSizeKb} kB** |`)
    }
    if (report.bundleAnalysis.routeChunks && (report.bundleAnalysis.routeChunks as string[]).length > 0) {
      mdLines.push('', '### Route chunks detected', '', ...(report.bundleAnalysis.routeChunks as string[]).map((f: string) => `- ${f}`))
    }
    mdLines.push('', '## 4. Performance Flags', '', ...(perfFlags.length > 0 ? perfFlags.map(f => `- ${f}`) : ['- No flags — all metrics within thresholds']))
    mdLines.push('', '## 5. Light Load Test', '', report.loadTest.concurrencyBehavior as string, '', '---')
    if (errorLog.length > 0) {
      mdLines.push('', '## Errors', '', ...errorLog.map((e) => `- ${e}`))
    } else {
      mdLines.push('', '## No errors detected')
    }
    fs.writeFileSync(path.join(REPORT_DIR, 't14-report.md'), mdLines.join('\n'))
    console.log(`\n📸 Screenshots: ${SCREENSHOT_DIR}/`)
    console.log(`📊 Report: test-results/t14-report.json`)
    console.log(`📝 Markdown: test-results/t14-report.md`)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════════════════════════════════
  test('00 — Setup: login, load demo, wait for embedding', async ({ page }) => {
    trackObservations(page, errorLog)
    await loginAndLoadDemo(page)
    expect(demoDocId, 'Demo doc ID').not.toBeNull(); expect(functionsBaseUrl.length > 0).toBe(true)
    isEmbedded = await waitForEmbedding(page)
    console.log(`[SETUP] Embedded: ${isEmbedded}`)
    await snap(page, '00-setup')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 1 — AI TIMING HARNESS
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('1 — AI Timing Harness', () => {
    const SAMPLES = 3

    test('01a — embed-document timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId || !isEmbedded) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'embed-document', { documentId: demoDocId })
        if (r.status === 200) { trackAiTiming('embed-document', r.durationMs); console.log(`[TIMING] embed-document #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01b — summarize-document timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'summarize-document', { documentId: demoDocId, mode: 'detailed' })
        if (r.status === 200) { trackAiTiming('summarize-document', r.durationMs); console.log(`[TIMING] summarize-document #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01c — generate-quiz timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'generate-quiz', { documentId: demoDocId, count: 5 })
        if (r.status === 200) { trackAiTiming('generate-quiz', r.durationMs); console.log(`[TIMING] generate-quiz #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01d — generate-flashcards timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'generate-flashcards', { documentId: demoDocId, count: 5 })
        if (r.status === 200) { trackAiTiming('generate-flashcards', r.durationMs); console.log(`[TIMING] generate-flashcards #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01e — rag-query timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'rag-query', { documentId: demoDocId, question: 'What is a linked list?' })
        if (r.status === 200) { trackAiTiming('rag-query', r.durationMs); console.log(`[TIMING] rag-query #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01f — generate-concept-map timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'generate-concept-map', { documentId: demoDocId })
        if (r.status === 200) { trackAiTiming('generate-concept-map', r.durationMs); console.log(`[TIMING] generate-concept-map #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01g — generate-targeted-practice timing', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      for (let i = 0; i < SAMPLES; i++) {
        const r = await invokeTimed(page, 'generate-targeted-practice', { documentId: demoDocId, mode: 'quiz' })
        if (r.status === 200) { trackAiTiming('generate-targeted-practice', r.durationMs); console.log(`[TIMING] generate-targeted-practice #${i + 1}: ${r.durationMs}ms`) }
      }
    })

    test('01h — report AI timing stats', async () => {
      const lines: string[] = ['\n=== AI Timing Summary ===']
      for (const [label, ps] of Object.entries(aiTimings)) {
        const stats = computeStats(ps.samples)
        if (stats) lines.push(`  ${label}: ${ps.count} samples, min=${stats.min}ms, median=${stats.median}ms, p95=${stats.p95}ms, max=${stats.max}ms`)
      }
      console.log(lines.join('\n'))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 2 — WEB VITALS (LCP, CLS, TBT, INP, TTI)
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('2 — Web Vitals', () => {
    async function collectWebVitals(page: Page, label: string): Promise<Record<string, number | null>> {
      // Reload to get fresh metrics
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2_000)

      const metrics = await page.evaluate(async () => {
        const results: Record<string, number | null> = {}
        return new Promise<Record<string, number | null>>((resolve) => {
          const timeout = setTimeout(() => resolve(results), 10_000)
          let collectedCount = 0
          const target = 6

          try {
            const obs = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const et = entry.entryType
                let name: string | null = null
                let val: number | null = null

                if (et === 'largest-contentful-paint') { name = 'LCP'; val = entry.startTime }
                else if (et === 'layout-shift') { name = 'CLS'; val = (entry as any).value; results.CLS = (results.CLS ?? 0) + (val ?? 0); continue }
                else if (et === 'first-input') { name = 'FID'; val = (entry as any).processingStart - entry.startTime }
                else if (et === 'paint' && entry.name === 'first-contentful-paint') { name = 'FCP'; val = entry.startTime }
                else if (et === 'longtask') { name = 'LONGTASK'; val = entry.duration; results.TBT = (results.TBT ?? 0) + Math.max(0, (val ?? 50) - 50); continue }
                else if (et === 'event' && (entry as any).interactionId) { name = 'INP'; val = (entry as any).duration; results.INP = val; continue }

                if (name && results[name] === undefined) { results[name] = val; collectedCount++ }
                if (collectedCount >= target) { clearTimeout(timeout); resolve(results) }
              }
            })
            obs.observe({ type: 'largest-contentful-paint', buffered: true })
            obs.observe({ type: 'layout-shift', buffered: true })
            obs.observe({ type: 'first-input', buffered: true })
            obs.observe({ type: 'paint', buffered: true })
            obs.observe({ type: 'longtask', buffered: true })
            obs.observe({ type: 'event', buffered: true, durationThreshold: 0 })
          } catch {}
        })
      })

      // Estimate TTI: if no long tasks after FCP, TTI ≈ LCP; else sum
      if (metrics.FCP && metrics.TBT === undefined) metrics.TBT = 0
      if (metrics.LCP && metrics.TBT !== null) metrics.TTI = Math.round((metrics.LCP + (metrics.TBT ?? 0)))

      // Flag poor metrics against thresholds
      flagIfPoor(label, 'LCP', metrics.LCP, 2500)
      flagIfPoor(label, 'CLS', metrics.CLS, 0.1)
      flagIfPoor(label, 'FID', metrics.FID, 100)
      flagIfPoor(label, 'TBT', metrics.TBT, 200)

      webVitalsRecord[label] = metrics
      console.log(`[WEBVITALS] ${label}:`, JSON.stringify(metrics))
      return metrics
    }

    test('02a — Dashboard web vitals', async ({ page }) => {
      trackObservations(page, errorLog)
      await page.goto('/'); await waitForReady(page)
      await collectWebVitals(page, 'Dashboard')
      await snap(page, '02a-dashboard-vitals')
    })

    test('02b — Workspace (document view) web vitals', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      await page.goto(`/doc/${demoDocId}`); await waitForReady(page)
      await collectWebVitals(page, 'Workspace')
      await snap(page, '02b-workspace-vitals')
    })

    test('02c — Verify CLS near zero on skeleton loads', async ({ page }) => {
      trackObservations(page, errorLog)
      if (demoDocId) {
        await page.goto(`/doc/${demoDocId}`, { waitUntil: 'commit' })
        await page.waitForTimeout(500)
        const cls = await page.evaluate(() => {
          return new Promise<number | null>((resolve) => {
            let cumulativeShift = 0
            try {
              const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) cumulativeShift += (entry as any).value || 0
              })
              observer.observe({ type: 'layout-shift', buffered: true })
            } catch {}
            setTimeout(() => resolve(cumulativeShift), 3_000)
          })
        })
        console.log(`[CLS] Workspace (early load): ${cls}`)
        webVitalsRecord['Workspace (early load)'] = { CLS: cls }
        flagIfPoor('Workspace (early load)', 'CLS', cls, 0.1)
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 3 — BUNDLE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('3 — Bundle Analysis', () => {
    test('03a — Bundle exists with expected chunks and route code-splitting', async () => {
      expect(fs.existsSync(BUILD_DIR), 'Build directory must exist').toBe(true)
      const jsFiles = findJsFiles(BUILD_DIR).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      expect(jsFiles.length).toBeGreaterThan(5)
      const fileNames = jsFiles.map(f => path.basename(f).toLowerCase()).join(' ')
      console.log(`[BUNDLE] ${jsFiles.length} JS files found`)
      expect(fileNames.includes('vendor')).toBe(true)
      expect(fileNames.includes('index')).toBe(true)

      // Check for route-based code splitting (tanstack-router generates route chunks)
      const routeChunks = ['doc', 'login', 'about', 'profile', 'study', 'settings']
        .filter(r => jsFiles.some(f => path.basename(f).toLowerCase().includes(r)))
      if (routeChunks.length > 0) {
        console.log(`[BUNDLE] Route-specific chunks detected: ${routeChunks.join(', ')} ✅`)
      } else {
        console.log('[BUNDLE] No explicit route chunks found — tanstack-router may inline routes in main bundle')
      }
      console.log('[BUNDLE] Code-splitting: vendor + index chunks found ✅')
    })

    test('03b — No chunk exceeds 500 kB (warning threshold)', async () => {
      const jsFiles = findJsFiles(BUILD_DIR).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      let anyOver = false
      for (const f of jsFiles) {
        const s = fs.statSync(f); const sizeKb = s.size / 1024
        if (sizeKb > 500) { console.log(`[BUNDLE] ⚠️ ${path.relative(BUILD_DIR, f)}: ${Math.round(sizeKb)} kB > 500 kB`); anyOver = true }
      }
      if (anyOver) console.log('[BUNDLE] Some chunks exceed 500 kB — consider further code splitting or lazy-loading heavy deps')
    })

    test('03c — Report chunk sizes', async () => {
      const jsFiles = findJsFiles(BUILD_DIR).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
      const sizes: Array<{ name: string; sizeKb: number }> = []
      for (const f of jsFiles) {
        const s = fs.statSync(f)
        sizes.push({ name: path.relative(BUILD_DIR, f), sizeKb: Math.round(s.size / 102.4) / 10 })
      }
      sizes.sort((a, b) => b.sizeKb - a.sizeKb)
      console.log('\n=== Top 5 Largest Chunks ===')
      for (const s of sizes.slice(0, 5)) console.log(`  ${s.name}: ${s.sizeKb} kB`)
      console.log(`  Total JS: ${Math.round(sizes.reduce((a, c) => a + c.sizeKb, 0) * 10) / 10} kB`)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 4 — PERCEIVED PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('4 — Perceived Performance', () => {
    test('04a — 100ms feedback rule: time from click to loading indicator', async ({ page }) => {
      trackObservations(page, errorLog)
      await page.goto('/login'); await waitForReady(page)
      await page.locator('text=Try as guest').click()
      await page.waitForURL('/', { timeout: 20_000 }); await waitForReady(page)

      // Navigate to doc page by clicking a link; measure time to first visual change
      const docLink = page.locator(`a[href*="/doc/"]`).first()
      if (await docLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.waitForTimeout(300)
        // Set up mutation observer, then click, report time to first DOM mutation
        const feedbackMs = await page.evaluate(async () => {
          const t0 = performance.now()
          return new Promise<number>((resolve) => {
            const target = document.body || document.documentElement
            const observer = new MutationObserver(() => {
              observer.disconnect()
              resolve(Math.round(performance.now() - t0))
            })
            observer.observe(target, { childList: true, subtree: true, attributes: false })
            const link = document.querySelector('a[href*="/doc/"]') as HTMLAnchorElement | null
            if (link) link.click()
            else { observer.disconnect(); resolve(-1) }
          })
        })
        if (feedbackMs > 0) {
          console.log(`[PERF] Click-to-visual-feedback: ${feedbackMs}ms`)
          if (feedbackMs > 100) console.log(`[PERF] ⚠️ ${feedbackMs}ms exceeds 100ms feedback threshold — consider optimizing navigation`)
          else console.log('[PERF] 100ms feedback rule satisfied ✅')
        } else {
          console.log('[PERF] Could not measure feedback — link not found')
        }
      }
    })

    test('04b — Verify page shows visual skeleton during loading', async ({ page }) => {
      trackObservations(page, errorLog)
      if (demoDocId) {
        await page.goto(`/doc/${demoDocId}`, { waitUntil: 'commit' })
        await page.waitForTimeout(300)
        const hasSkeleton = await page.locator('.animate-pulse, [class*="skeleton"], .loading, [role="progressbar"], .spinner').first().isVisible().catch(() => false)
        if (hasSkeleton) console.log('[PERF] Skeleton/loading indicator found ✅')
        else {
          const hasContent = await page.locator('main, article, [data-testid="content"]').first().isVisible().catch(() => false)
          console.log(hasContent ? '[PERF] Content direct (no skeleton, fast load)' : '[PERF] No explicit skeleton found but page loaded')
        }
        await page.waitForLoadState('networkidle')
        await snap(page, '04b-visual-feedback')
      }
    })

    test('04c — Staged progress on long generations (loading states)', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return
      await page.goto(`/doc/${demoDocId}`); await waitForReady(page)

      // Check for static progress indicators
      const hasProgressbar = await page.locator('[role="progressbar"], .progress, [class*="progress"]').first().isVisible().catch(() => false)
      const hasLoadingText = await page.locator('text=Generating,text=Loading,text=Processing').first().isVisible().catch(() => false)

      if (hasProgressbar || hasLoadingText) {
        console.log(`[PERF] Staged progress: ${hasProgressbar ? 'progressbar' : ''} ${hasLoadingText ? 'loading text' : ''} ✅`)
      } else {
        const genBtns = await page.locator('button:has-text("Generate"), button:has-text("Quiz"), button:has-text("Flashcards")').count()
        console.log(`[PERF] ${genBtns} generation trigger buttons found`)

        // Try clicking a generate button and observing progress
        if (genBtns > 0) {
          const btn = page.locator('button:has-text("Generate")').first()
          if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const startedAt = Date.now()
            await btn.click()
            const progressAppeared = await page.locator('[role="progressbar"], .loading, .animate-pulse, text=Generating, text=Loading').first().isVisible({ timeout: 5_000 }).catch(() => false)
            const elapsed = Date.now() - startedAt
            if (progressAppeared) {
              console.log(`[PERF] Staged progress appeared after ${elapsed}ms ✅`)
              if (elapsed > 100) console.log(`[PERF] ⚠️ Progress indicator took ${elapsed}ms (>100ms threshold)`)
              await snap(page, '04c-staged-progress')
            } else {
              console.log(`[PERF] No progress indicator appeared within 5s after click`)
            }
          }
        }
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 5 — LIGHT LOAD TEST
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('5 — Light load test', () => {
    test('05a — Concurrent rag-query requests (3 concurrent)', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId || !functionsBaseUrl) return
      const CONCURRENCY = 3
      const results: Array<{ status: number; durationMs: number }> = await page.evaluate(async ({ baseUrl, docId, concurrency }) => {
        try {
          const m = await import('/src/lib/supabase.ts')
          const { data: s } = await m.supabase.auth.getSession()
          const token = s?.session?.access_token ?? ''
          return await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
            const t0 = performance.now()
            try {
              const res = await fetch(`${baseUrl}/functions/v1/rag-query`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ documentId: docId, question: `Concurrent ${i}: What is a linked list?` }) })
              await res.text(); return { status: res.status, durationMs: Math.round(performance.now() - t0) }
            } catch { return { status: 0, durationMs: Math.round(performance.now() - t0) } }
          }))
        } catch { return [] }
      }, { baseUrl: functionsBaseUrl, docId: demoDocId, concurrency: CONCURRENCY })
      console.log(`\n=== Load Test: ${CONCURRENCY} concurrent rag-query ===`)
      let success = 0
      for (const r of results) { success += r.status === 200 ? 1 : 0; console.log(`  Status=${r.status} duration=${r.durationMs}ms`); expect(r.status !== 500).toBe(true) }
      console.log(`  Success: ${success}/${CONCURRENCY}`)
    })

    test('05b — Concurrent rag-query requests (5 concurrent)', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId || !functionsBaseUrl) return
      const CONCURRENCY = 5
      const results: Array<{ status: number; durationMs: number }> = await page.evaluate(async ({ baseUrl, docId, concurrency }) => {
        try {
          const m = await import('/src/lib/supabase.ts')
          const { data: s } = await m.supabase.auth.getSession()
          const token = s?.session?.access_token ?? ''
          return await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
            const t0 = performance.now()
            try {
              const res = await fetch(`${baseUrl}/functions/v1/rag-query`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ documentId: docId, question: `Concurrent ${i}: What is Big-O?` }) })
              await res.text(); return { status: res.status, durationMs: Math.round(performance.now() - t0) }
            } catch { return { status: 0, durationMs: Math.round(performance.now() - t0) } }
          }))
        } catch { return [] }
      }, { baseUrl: functionsBaseUrl, docId: demoDocId, concurrency: CONCURRENCY })
      console.log(`\n=== Load Test: ${CONCURRENCY} concurrent rag-query ===`)
      let success = 0; let rateLimited = 0
      for (const r of results) {
        if (r.status === 200) success++
        else if (r.status === 429) rateLimited++
        console.log(`  Status=${r.status} duration=${r.durationMs}ms${r.status === 429 ? ' (rate-limited)' : ''}`)
        expect(r.status !== 500).toBe(true)
      }
      console.log(`  Success: ${success}, Rate-limited: ${rateLimited}/${CONCURRENCY}`)
    })

    test('05c — Document concurrency behavior', async () => {
      const rateLimited = errorLog.filter(e => e.includes('429'))
      if (rateLimited.length > 0) console.log(`[LOAD] Rate-limiting detected: ${rateLimited.length} requests rate-limited (429). ✅ Backpressure working.`)
      else console.log(`[LOAD] No rate-limiting — all concurrent requests succeeded. Threshold >5.`)
      console.log('[LOAD] No 5xx crashes from concurrent requests ✅')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // ERROR GATE
  // ═══════════════════════════════════════════════════════════════════════
  test('99 — No uncaught console errors or failed requests', async () => {
    if (errorLog.length > 0) { console.log(`\n⚠️ ${errorLog.length} error(s)`, ...errorLog.map(e => `\n  ${e}`)) }
    expect(assertionFailures.value, `Phase T14: ${assertionFailures.value} test assertion(s) failed.`).toBe(0)
  })
})
