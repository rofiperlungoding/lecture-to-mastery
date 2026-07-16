// ═══════════════════════════════════════════════════════════════════════════
// PHASE T19 — Report Aggregation + Notion AI Handoff
//
// Usage: npx tsx scripts/aggregate-reports.ts
//
// Reads: test-results/t{phase}-report.json for phases T3-T18
// Writes:
//   test-results/consolidated-report.json   — Structured JSON (all phases)
//   test-results/CONSOLIDATED-REPORT.md     — Self-contained Markdown for Notion AI
//   test-results/trend-store.json           — Append-only trend history
//
// The Markdown report is designed to be copy-pasted into Notion for AI analysis.
// It includes embedded JSON, screenshot descriptions (no binary), and a
// "How to ask Notion AI" prompt.
// ═══════════════════════════════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ── Constants ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RESULTS_DIR = path.resolve(__dirname, '..', 'test-results')
const REPORT_FILE = path.join(RESULTS_DIR, 'consolidated-report.json')
const MD_FILE = path.join(RESULTS_DIR, 'CONSOLIDATED-REPORT.md')
const TREND_FILE = path.join(RESULTS_DIR, 'trend-store.json')

const KNOWN_PHASES = ['T3', 'T4', 'T14', 'T15', 'T16', 'T17', 'T18'] as const

// ── Phase metadata ───────────────────────────────────────────────────────

const PHASE_META: Record<string, { name: string; description: string }> = {
  T3:  { name: 'Critical-Path Smoke', description: 'Proves the demo flow is alive after every change/deploy' },
  T4:  { name: 'Auth & Session', description: 'Proves sign-in/out, session persistence, route guards, guest/demo path' },
  T14: { name: 'Performance, Latency & Load', description: 'Measures AI timings, web vitals, bundle analysis, perceived performance, concurrency' },
  T15: { name: 'Accessibility (A11Y)', description: 'Axe scans, keyboard, screen-reader semantics, contrast AA, reduced motion' },
  T16: { name: 'Visual Regression & UI/UX Evidence', description: 'Screenshot baselines, diff policy, UI/UX evidence pack, motion notes, consistency' },
  T17: { name: 'Cross-Browser, Responsive & PWA', description: 'Cross-browser engine checks, responsive sweep, touch/pointer, PWA verification, device emulation' },
  T18: { name: 'Resilience / Chaos / Failure Injection', description: 'Network chaos, API failure injection, corrupt data, interruption, error boundary coverage' },
}

// ── Types ────────────────────────────────────────────────────────────────

interface PhaseReport {
  phase: string
  timestamp: string
  passed?: boolean
  errorCount?: number
  errors?: string[]
  [key: string]: unknown
}

interface ConsolidatedReport {
  meta: {
    generatedAt: string
    totalPhases: number
    totalErrors: number
    phasesWithFailures: string[]
    phasesMissing: string[]
  }
  executiveSummary: {
    overallHealth: 'PASS' | 'WARN' | 'FAIL'
    verdict: string
    demoReadiness: 'READY' | 'CONDITIONAL' | 'NOT_READY'
    topRisks: string[]
    perfHeadline: string
    a11yHeadline: string
    pwaHeadline: string
  }
  phases: Record<string, PhaseReport & { meta: typeof PHASE_META[string] }>
  aggregatedDefects: Array<{
    severity: string
    phase: string
    description: string
    count: number
  }>
  uiUxObservations: string[]
  howToAskNotionAI: string
  allScreenshots: string[]
  trend: TrendSnapshot
}

interface TrendSnapshot {
  timestamp: string
  totalErrors: number
  phasesPassed: number
  phasesTotal: number
  a11yViolations: number
  perfFlags: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Read a phase report from test-results. Tries multiple filename patterns.
 */
function readPhaseReport(phase: string): PhaseReport | null {
  const patterns = [
    path.join(RESULTS_DIR, `${phase.toLowerCase()}-report.json`),       // t3-report.json
    path.join(RESULTS_DIR, `${phase.toLowerCase()}.json`),              // t3.json
    path.join(RESULTS_DIR, `${phase}.json`),                            // T3.json
  ]
  for (const file of patterns) {
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      return JSON.parse(raw) as PhaseReport
    } catch { continue }
  }
  return null
}

function readTrendStore(): TrendSnapshot[] {
  try {
    const raw = fs.readFileSync(TREND_FILE, 'utf-8')
    return JSON.parse(raw) as TrendSnapshot[]
  } catch {
    return []
  }
}

function writeTrendStore(snapshots: TrendSnapshot[]): void {
  fs.mkdirSync(path.dirname(TREND_FILE), { recursive: true })
  fs.writeFileSync(TREND_FILE, JSON.stringify(snapshots, null, 2))
}

function isScreenshotRef(s: string): boolean {
  return s.includes('.png') || s.includes('.jpg') || s.includes('.webp') ||
         s.includes('screenshot') || s.includes('snap')
}

function extractScreenshots(obj: unknown, acc: Set<string>): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const item of obj) extractScreenshots(item, acc)
    return
  }
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && isScreenshotRef(val)) {
      acc.add(val)
    } else if (typeof val === 'object') {
      extractScreenshots(val, acc)
    }
  }
}

/**
 * Collect all defects across phases, sorted by severity.
 */
function collectDefects(reports: Array<{ phase: string; report: PhaseReport }>) {
  const defects: Array<{ severity: string; phase: string; description: string; count: number }> = []

  for (const { phase, report } of reports) {
    // Axe violations
    const axeSummary = (report as any).axeSummary
    if (axeSummary?.totalViolationsByRule) {
      for (const v of axeSummary.totalViolationsByRule as Array<{ ruleId: string; impact: string; count: number; pages: string[] }>) {
        defects.push({
          severity: v.impact || 'unknown',
          phase,
          description: `axe: ${v.ruleId} on ${(v.pages || []).join(', ')}`,
          count: v.count,
        })
      }
    }

    // Contrast failures
    const contrastFailures = (report as any).contrastFailures
    if (Array.isArray(contrastFailures)) {
      for (const cf of contrastFailures) {
        defects.push({ severity: 'moderate', phase, description: `contrast: ${cf}`, count: 1 })
      }
    }

    // Perf flags (T14)
    const perfFlags = (report as any).perfFlags
    if (Array.isArray(perfFlags)) {
      for (const pf of perfFlags) {
        defects.push({ severity: 'warn', phase, description: `perf: ${pf}`, count: 1 })
      }
    }

    // Errors
    const errors = report.errors
    if (Array.isArray(errors) && errors.length > 0) {
      defects.push({ severity: 'error', phase, description: `${errors.length} error(s)`, count: errors.length })
    }

    // Chaos / resilience failures (T18)
    const chaosResults = (report as any).chaosResults
    if (Array.isArray(chaosResults)) {
      for (const r of chaosResults) {
        if (!r.passed) {
          defects.push({ severity: 'fail', phase, description: `chaos: ${r.test} — ${r.details}`, count: 1 })
        }
      }
    }

    // T16 Visual regression — screenshot diff errors (toHaveScreenshot assertions)
    if (Array.isArray(report.errors) && report.errors.length > 0) {
      for (const err of report.errors) {
        if (err.includes('screenshot') || err.includes('diff') || err.includes('Snapshot') || err.includes('match')) {
          defects.push({ severity: 'serious', phase, description: `visual diff: ${err.slice(0, 120)}`, count: 1 })
        }
      }
    }
    // T16 consistency drift (report uses snake_case: consistency_drifts)
    const consistencyDrifts = (report as any).consistency_drifts
    if (Array.isArray(consistencyDrifts)) {
      for (const cd of consistencyDrifts) {
        const desc = typeof cd === 'string' ? cd : `${cd.component}: ${cd.property} "${cd.valueA}" vs "${cd.valueB}"`
        defects.push({ severity: 'warn', phase, description: `consistency drift: ${desc}`, count: 1 })
      }
    }

    // T17 Responsive issues
    const visualObservations = (report as any).responsive?.observations
    if (Array.isArray(visualObservations)) {
      for (const o of visualObservations) {
        if (o.issues?.length > 0) {
          defects.push({ severity: 'warn', phase, description: `responsive @ ${o.viewport || ''} ${o.screen || ''}: ${o.issues.join('; ')}`, count: o.issues.length })
        }
      }
    }

    // T17 PWA failures
    const pwaChecks = (report as any).pwa?.checks
    if (Array.isArray(pwaChecks)) {
      for (const c of pwaChecks) {
        if (!c.passed) {
          defects.push({ severity: 'fail', phase, description: `PWA: ${c.check} — ${c.detail}`, count: 1 })
        }
      }
    }
  }

  // Sort: critical > serious > error > fail > moderate > warn
  const severityOrder = ['critical', 'serious', 'error', 'fail', 'moderate', 'warn']
  defects.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
  return defects
}

/**
 * Collect all UI/UX observations from visual regression and responsive reports.
 */
function collectUiUxObservations(reports: Array<{ phase: string; report: PhaseReport }>): string[] {
  const obs: string[] = []

  for (const { phase, report } of reports) {
    // T16 visual regression UI/UX observations
    const uiUx = (report as any).uiUxObservations
    if (Array.isArray(uiUx)) {
      for (const o of uiUx) {
        obs.push(`[${phase}] ${typeof o === 'string' ? o : JSON.stringify(o)}`)
      }
    }

    // T17 responsive observations
    const respObs = (report as any).responsive?.observations
    if (Array.isArray(respObs)) {
      for (const o of respObs) {
        if (o.issues?.length > 0 || o.tapTargetIssues?.length > 0) {
          obs.push(`[${phase}] Responsive @${o.viewport || ''} ${o.screen || ''}: ${[...(o.issues || []), ...(o.tapTargetIssues || [])].join('; ')}`)
        }
      }
    }

    // T18 chaos results
    const chaosResults = (report as any).chaosResults
    if (Array.isArray(chaosResults)) {
      for (const r of chaosResults) {
        obs.push(`[${phase}] ${r.test}: ${r.passed ? '✅' : '❌'} ${r.details}`)
      }
    }
  }

  return obs
}

/**
 * Build the executive summary.
 */
function buildExecutiveSummary(
  reports: Array<{ phase: string; report: PhaseReport }>,
  defects: Array<{ severity: string; description: string; count: number }>,
  missingPhases: string[],
): ConsolidatedReport['executiveSummary'] {
  const totalErrors = reports.reduce((s, r) => s + (r.report.errorCount || 0), 0)
  const seriousCritical = defects.filter(d => d.severity === 'critical' || d.severity === 'serious')
  const allPassed = reports.every(r => r.report.passed !== false)
  const phasesWithIssues = reports.filter(r => !r.report.passed).map(r => r.phase)

  const perfData = reports.find(r => r.phase === 'T14')
  const perfFlags = (perfData?.report as any)?.perfFlags
  const perfHeadline = perfFlags?.length > 0
    ? `${perfFlags.length} performance flags (see defects for details)`
    : 'No performance flags — all metrics within thresholds ✅'

  const a11yData = reports.find(r => r.phase === 'T15')
  const a11yViolations = (a11yData?.report as any)?.axeSummary?.totalViolationCount ?? 0
  const a11yHeadline = a11yViolations > 0
    ? `${a11yViolations} total a11y violations (${(a11yData?.report as any)?.axeSummary?.seriousCriticalCount || 0} serious/critical)`
    : 'Zero a11y violations across all axe scans ✅'

  const pwaData = reports.find(r => r.phase === 'T17')
  const pwaChecks = (pwaData?.report as any)?.pwa?.checks
  const pwaPassed = Array.isArray(pwaChecks) ? pwaChecks.filter((c: any) => c.passed).length : 0
  const pwaTotal = Array.isArray(pwaChecks) ? pwaChecks.length : 0
  const pwaHeadline = pwaTotal > 0 ? `${pwaPassed}/${pwaTotal} PWA checks pass` : 'PWA checks not run'

  const topRisks = defects.slice(0, 10).map(d => `[${d.severity.toUpperCase()}] ${d.description} (${d.count} instance(s))`)

  let verdict = ''
  let demoReadiness: 'READY' | 'CONDITIONAL' | 'NOT_READY' = 'READY'
  if (allPassed && seriousCritical.length === 0 && missingPhases.length === 0) {
    verdict = 'All phases pass. Zero critical/serious defects. App is demo-ready.'
    demoReadiness = 'READY'
  } else if (seriousCritical.length > 0 || phasesWithIssues.length > reports.length / 2) {
    verdict = `${seriousCritical.length} serious/critical defect(s) — app requires fixes before demo.`
    demoReadiness = 'NOT_READY'
  } else {
    const issues = phasesWithIssues.length > 0 ? phasesWithIssues.join(', ') : 'some warnings'
    verdict = `Phase(s) [${issues}] have issues. Review defects below — conditional go for demo with known limitations briefed.`
    demoReadiness = 'CONDITIONAL'
  }

  const overallHealth: 'PASS' | 'WARN' | 'FAIL' = allPassed && seriousCritical.length === 0 ? 'PASS' : seriousCritical.length > 0 ? 'FAIL' : 'WARN'

  return { overallHealth, verdict, demoReadiness, topRisks: topRisks.length > 0 ? topRisks : ['No risks detected — all checks pass ✅'], perfHeadline, a11yHeadline, pwaHeadline }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function main(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })

  const phaseEntries: Array<{ phase: string; report: PhaseReport }> = []
  const missingPhases: string[] = []

  for (const phase of KNOWN_PHASES) {
    const report = readPhaseReport(phase)
    if (report) phaseEntries.push({ phase, report })
    else missingPhases.push(phase)
  }

  const allDefects = collectDefects(phaseEntries)
  const allUiUxObs = collectUiUxObservations(phaseEntries)

  // Screenshots
  const allScreenshotsSet = new Set<string>()
  for (const { report } of phaseEntries) extractScreenshots(report, allScreenshotsSet)
  for (const dir of ['screenshots', 'screenshots-perf', 'screenshots-a11y', 'screenshots-t17', 'screenshots-t18']) {
    try {
      for (const f of fs.readdirSync(path.join(RESULTS_DIR, dir))) {
        if (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')) allScreenshotsSet.add(`${dir}/${f}`)
      }
    } catch { /* dir may not exist */ }
  }

  const totalErrors = phaseEntries.reduce((s, r) => s + (r.report.errorCount || 0), 0)
  const phasesWithFailures = phaseEntries.filter(r => !r.report.passed).map(r => r.phase)
  const execSummary = buildExecutiveSummary(phaseEntries, allDefects, missingPhases)

  const phases: Record<string, PhaseReport & { meta: typeof PHASE_META[string] }> = {}
  for (const { phase, report } of phaseEntries) {
    phases[phase] = { ...report, meta: PHASE_META[phase] || { name: phase, description: '' } }
  }

  const consolidated: ConsolidatedReport = {
    meta: { generatedAt: new Date().toISOString(), totalPhases: KNOWN_PHASES.length, totalErrors, phasesWithFailures, phasesMissing: missingPhases },
    executiveSummary: execSummary,
    phases,
    aggregatedDefects: allDefects,
    uiUxObservations: allUiUxObs,
    howToAskNotionAI: [
      '## How to Ask Notion AI to Analyze This Report',
      '',
      'Paste the entire CONSOLIDATED-REPORT.md into a Notion page, then ask:',
      '',
      '**For overall health:**',
      '> "Analyze this test report. What is the overall health score? Are we demo-ready? What are the top 3 risks?"',
      '',
      '**For UI/UX scoring:**',
      '> "Score the UI/UX against these heuristics: hierarchy, spacing/alignment, consistency, feedback, aesthetic, accessibility. Grade each as pass/warn/fail with evidence from the UI/UX Observations section."',
      '',
      '**For a11y review:**',
      '> "Review the accessibility section. Are there any WCAG AA failures? What must be fixed before launch?"',
      '',
      '**For perf review:**',
      '> "Review the performance data. Are there any latencies or bundle sizes that would hurt user experience?"',
      '',
      '**To compare with a previous run:**',
      '> "Compare this report with the previous trend snapshot in the Trend Tracking section. What regressions or improvements do you see?"',
      '',
      '---',
    ].join('\n'),
    allScreenshots: Array.from(allScreenshotsSet).sort(),
    trend: {
      timestamp: new Date().toISOString(),
      totalErrors,
      phasesPassed: phaseEntries.filter(r => r.report.passed !== false).length,
      phasesTotal: phaseEntries.length,
      a11yViolations: (phaseEntries.find(r => r.phase === 'T15')?.report as any)?.axeSummary?.totalViolationCount ?? 0,
      perfFlags: (phaseEntries.find(r => r.phase === 'T14')?.report as any)?.perfFlags ?? [],
    },
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(consolidated, null, 2))
  console.log(`📊 Consolidated JSON: ${REPORT_FILE}`)

  const md = generateMarkdownReport(consolidated)
  fs.writeFileSync(MD_FILE, md, 'utf-8')
  console.log(`📝 Consolidated Markdown: ${MD_FILE}`)

  const trendHistory = readTrendStore()
  trendHistory.push(consolidated.trend)
  if (trendHistory.length > 20) trendHistory.splice(0, trendHistory.length - 20)
  writeTrendStore(trendHistory)
  console.log(`📈 Trend store: ${TREND_FILE} (${trendHistory.length} snapshots)`)

  const failedCount = allDefects.filter(d => d.severity === 'critical' || d.severity === 'serious' || d.severity === 'error').length
  console.log('\n=== Consolidated Report Summary ===')
  console.log(`Phases: ${phaseEntries.length}/${KNOWN_PHASES.length} (missing: ${missingPhases.join(', ') || 'none'})`)
  console.log(`Health: ${execSummary.overallHealth} — ${execSummary.verdict}`)
  console.log(`Defects: ${allDefects.length} total (${failedCount} critical/serious/error)`)
  console.log(`Screenshots: ${consolidated.allScreenshots.length}`)
  console.log(`UI/UX Observations: ${allUiUxObs.length}`)
  console.log(`Demo Readiness: ${execSummary.demoReadiness}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKDOWN GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function generateMarkdownReport(report: ConsolidatedReport): string {
  const { meta, executiveSummary: exec, phases, aggregatedDefects: defects, uiUxObservations: uiUxObs, howToAskNotionAI, allScreenshots } = report

  const lines: string[] = []

  // HEADER
  lines.push(
    '# Consolidated E2E Test Report — Lecture-to-Mastery', '',
    `**Generated:** ${meta.generatedAt}`,
    `**Phases:** ${Object.keys(phases).length}/${meta.totalPhases} complete`,
    `**Overall Health:** ${renderBadge(exec.overallHealth)}`,
    `**Demo Readiness:** ${renderBadge(exec.demoReadiness === 'READY' ? 'PASS' : exec.demoReadiness === 'CONDITIONAL' ? 'WARN' : 'FAIL')} — ${exec.verdict}`, '',
    '---', '',
  )

  // EXECUTIVE SUMMARY
  lines.push(
    '## 🏁 Executive Summary', '',
    '| Metric | Value |', '|---|---|',
    `| Overall Health | ${renderBadge(exec.overallHealth)} |`,
    `| Demo Readiness | ${exec.demoReadiness} |`,
    `| Phases | ${Object.keys(phases).length}/${meta.totalPhases} |`,
    `| Total Errors | ${meta.totalErrors} |`,
    `| Phases with Failures | ${meta.phasesWithFailures.join(', ') || 'None'} |`,
    `| Missing Phases | ${meta.phasesMissing.join(', ') || 'None'} |`, '',
    '### Key Metrics', '',
    `- **Performance:** ${exec.perfHeadline}`,
    `- **Accessibility:** ${exec.a11yHeadline}`,
    `- **PWA:** ${exec.pwaHeadline}`,
    `- **Screenshots Captured:** ${allScreenshots.length}`,
    `- **UI/UX Observations:** ${uiUxObs.length}`, '',
    '### Top 10 Risks / Defects', '',
  )

  if (exec.topRisks[0] !== 'No risks detected — all checks pass ✅') {
    for (const risk of exec.topRisks) lines.push(`- ${risk}`)
  } else {
    lines.push('- No risks detected ✅')
  }
  lines.push('', '---', '')

  // PER-PHASE STATUS
  lines.push('## 📋 Per-Phase Status', '', '| Phase | Name | Status | Errors | Key Metrics |', '|---|---|---|---|---|')
  for (const [phase, data] of Object.entries(phases)) {
    const status = data.passed !== false ? '✅ PASS' : '❌ FAIL'
    const errs = data.errorCount ?? 0
    const m = data.meta as typeof PHASE_META[string]
    let km = ''
    switch (phase) {
      case 'T14': { const p = data as any; km = `AI ops: ${p.aiTimings?.length || 0}, Web vitals: ${Object.keys(p.webVitals || {}).length} pages`; break }
      case 'T15': { const a = data as any; km = `Axe: ${a.axeSummary?.totalViolationCount ?? '?'} violations (${a.axeSummary?.seriousCriticalCount ?? '?'} serious/critical)`; break }
      case 'T16': { const v = data as any; km = `Observations: ${v.uiUxObservations?.length || '?'}`; break }
      case 'T17': { const x = data as any; const pw = x.pwa?.checks; const pwp = Array.isArray(pw) ? pw.filter((c: any) => c.passed).length : '?'; km = `Browser: ${x.browser?.engineNotes?.length || 0}, PWA: ${pwp}/${pw?.length || '?'}`; break }
      case 'T18': { const c = data as any; km = `Chaos failures: ${c.chaosResults?.filter((r: any) => !r.passed).length || 0}`; break }
    }
    lines.push(`| ${phase} | ${m?.name || phase} | ${status} | ${errs} | ${km} |`)
  }
  lines.push('', '---', '')

  // AGGREGATED DEFECTS
  lines.push('## 🔴 Aggregated Defects (Sorted by Severity)', '', '| Severity | Phase | Description | Count |', '|---|---|---|---|')
  if (defects.length > 0) {
    for (const d of defects) lines.push(`| ${renderBadgeBySeverity(d.severity)} ${d.severity} | ${d.phase} | ${d.description} | ${d.count} |`)
  } else { lines.push('| _No defects found_ | | | |') }
  lines.push('', '---', '')

  // PERFORMANCE DATA
  const perfPhase = phases['T14'] as any
  if (perfPhase?.aiTimings) {
    lines.push('## ⚡ Performance Data', '', '### AI Timing Harness', '', '| Operation | Samples | Min (ms) | Median (ms) | P95 (ms) | Max (ms) | Mean (ms) |', '|---|---|---|---|---|---|---|')
    for (const t of perfPhase.aiTimings) lines.push(`| ${t.operation} | ${t.sampleCount} | ${t.min ?? '-'} | ${t.median ?? '-'} | ${t.p95 ?? '-'} | ${t.max ?? '-'} | ${t.mean?.toFixed(0) ?? '-'} |`)
    if (perfPhase.webVitals) {
      lines.push('', '### Web Vitals', '', '| Page | Metric | Value | Threshold | Status |', '|---|---|---|---|---|')
      const th: Record<string, number> = { LCP: 2500, CLS: 0.1, FID: 100, TBT: 200 }
      for (const [pn, ms] of Object.entries(perfPhase.webVitals) as Array<[string, Record<string, number | null>]>) {
        for (const [metric, value] of Object.entries(ms)) {
          const t = th[metric]
          lines.push(`| ${pn} | ${metric} | ${value ?? 'N/A'} | ${t ?? '—'} | ${value !== null && t !== undefined ? (value > t ? '⚠️ POOR' : '✅ OK') : '—'} |`)
        }
      }
    }
    lines.push('', '---', '')
  }

  // ACCESSIBILITY DATA
  const a11yPhase = phases['T15'] as any
  if (a11yPhase?.axeSummary) {
    lines.push('## ♿ Accessibility (A11Y)', '', `**Total Violations:** ${a11yPhase.axeSummary.totalViolationCount ?? 0}`, `**Serious/Critical:** ${a11yPhase.axeSummary.seriousCriticalCount ?? 0}`, '', '### Violations by Rule', '', '| Rule ID | Impact | Count | Pages |', '|---|---|---|---|')
    for (const v of a11yPhase.axeSummary.totalViolationsByRule || []) lines.push(`| ${v.ruleId} | ${v.impact} | ${v.count} | ${v.pages?.join(', ') || ''} |`)
    if (!a11yPhase.axeSummary.totalViolationsByRule?.length) lines.push('| _No violations_ | | | |')
    if (a11yPhase.contrastFailures?.length > 0) lines.push('', '### Contrast Failures', '', ...a11yPhase.contrastFailures.map((cf: string) => `- ${cf}`))
    lines.push('', '---', '')
  }

  // PWA DATA
  const pwaPhase = phases['T17'] as any
  if (pwaPhase?.pwa?.checks) {
    lines.push('## 📱 PWA Verification', '', '| Check | Passed | Detail |', '|---|---|---|')
    for (const c of pwaPhase.pwa.checks) lines.push(`| ${c.check} | ${c.passed ? '✅' : '❌'} | ${c.detail} |`)
    lines.push('', '---', '')
  }

  // UI/UX OBSERVATIONS
  lines.push('## 🎨 UI/UX Evidence Pack', '', 'This section contains observations from visual regression, responsive, and chaos testing. Each observation references a heuristic: hierarchy, spacing/alignment, consistency, feedback, aesthetic, accessibility.', '')
  if (uiUxObs.length > 0) { for (const obs of uiUxObs) lines.push(`- ${obs}`) } else { lines.push('- No UI/UX observations recorded.') }
  lines.push('', '---', '')

  // SCREENSHOT INDEX
  lines.push('## 📸 Screenshot Index', '', `Total screenshots: ${allScreenshots.length}. Referenced in observations above.`, '')
  for (const ss of allScreenshots.slice(0, 50)) lines.push(`- \`${ss}\``)
  if (allScreenshots.length > 50) lines.push(`- ... and ${allScreenshots.length - 50} more`)
  lines.push('', '---', '')

  // TREND TRACKING
  lines.push('## 📈 Trend Tracking', '', '| Run | Timestamp | Errors | Phases Passed | A11Y Violations | Perf Flags |', '|---|---|---|---|---|---|')
  const trendHistory = readTrendStore()
  for (const t of trendHistory.slice(-10)) {
    lines.push(`| ${trendHistory.indexOf(t) + 1} | ${t.timestamp} | ${t.totalErrors} | ${t.phasesPassed}/${t.phasesTotal} | ${t.a11yViolations} | ${Array.isArray(t.perfFlags) ? t.perfFlags.length : 0} |`)
  }
  lines.push('', '---', '')

  // NOTION AI HANDOFF
  lines.push('', howToAskNotionAI, '')

  // RAW JSON EMBED
  lines.push('## 📄 Raw Phase Data (JSON)', '', '```json',
    JSON.stringify({
      meta: report.meta, executiveSummary: report.executiveSummary,
      phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { passed: v.passed, errorCount: v.errorCount }])),
      aggregatedDefects: report.aggregatedDefects.slice(0, 20), trend: report.trend,
    }, null, 2),
    '```', '',
  )

  return lines.join('\n')
}

function renderBadge(status: string): string {
  switch (status) {
    case 'PASS': return '✅ PASS'; case 'WARN': return '⚠️ WARN'; case 'FAIL': return '❌ FAIL'
    case 'CONDITIONAL': return '⚠️ CONDITIONAL'; case 'NOT_READY': return '❌ NOT READY'; case 'READY': return '✅ READY'
    default: return status
  }
}

function renderBadgeBySeverity(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴'; case 'serious': return '🟠'; case 'error': return '🔴'
    case 'fail': return '🟡'; case 'moderate': return '🟡'; case 'warn': return '🟢'
    default: return '⚪'
  }
}

main()
