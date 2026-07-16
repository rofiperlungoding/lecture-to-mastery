// ═══════════════════════════════════════════════════════════════════════════
// Reporting Contract adapter
//
// Converts test runner results into the standardized Reporting Contract
// format (JSON + Markdown) defined in TESTPLAN.md.
//
// This is called at the end of each test phase to produce machine-parseable
// and human-readable reports.
// ═══════════════════════════════════════════════════════════════════════════

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Severity and Status types ─────────────────────────────────────────────

export type Severity = 'blocker' | 'major' | 'minor' | 'none'
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'flaky'

// ── Reporting Contract types ──────────────────────────────────────────────

export interface TestReportItem {
  id: string
  description: string
  status: TestStatus
  severity?: Severity
  durationMs: number
  error?: string
  screenshotPaths?: string[]
  tracePaths?: string[]
}

export interface DefectEntry {
  id: string
  title: string
  description: string
  severity: Severity
  affectedComponent: string
  reproducible: boolean
  evidencePath?: string
}

export interface PhaseReport {
  phase: string
  timestamp: string
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    flaky: number
    durationMs: number
  }
  tests: TestReportItem[]
  defects: DefectEntry[]
  coverage?: {
    lines: number
    branches: number
    functions: number
    statements: number
  }
  artifacts: {
    screenshots: string[]
    traces: string[]
    reports: string[]
  }
}

// ── Reporter class ────────────────────────────────────────────────────────

export class ReportBuilder {
  private phase: string
  private tests: TestReportItem[] = []
  private defects: DefectEntry[] = []
  private startTime: number
  private coverage?: PhaseReport['coverage']
  private screenshots: string[] = []
  private traces: string[] = []
  private reports: string[] = []

  constructor(phase: string) {
    this.phase = phase
    this.startTime = Date.now()
  }

  addTest(item: TestReportItem): void {
    this.tests.push(item)
  }

  addDefect(defect: DefectEntry): void {
    this.defects.push(defect)
  }

  addScreenshot(path: string): void {
    this.screenshots.push(path)
  }

  addTrace(path: string): void {
    this.traces.push(path)
  }

  addReport(path: string): void {
    this.reports.push(path)
  }

  setCoverage(coverage: PhaseReport['coverage']): void {
    this.coverage = coverage
  }

  build(): PhaseReport {
    const durationMs = Date.now() - this.startTime
    const summary = {
      total: this.tests.length,
      passed: this.tests.filter((t) => t.status === 'passed').length,
      failed: this.tests.filter((t) => t.status === 'failed').length,
      skipped: this.tests.filter((t) => t.status === 'skipped').length,
      flaky: this.tests.filter((t) => t.status === 'flaky').length,
      durationMs,
    }

    return {
      phase: this.phase,
      timestamp: new Date().toISOString(),
      summary,
      tests: this.tests,
      defects: this.defects,
      coverage: this.coverage,
      artifacts: {
        screenshots: this.screenshots,
        traces: this.traces,
        reports: this.reports,
      },
    }
  }

  /** Write JSON report to disk */
  writeJson(outputDir: string): string {
    const report = this.build()
    const dir = outputDir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const path = join(dir, `phase-${this.phase}-report.json`)
    writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8')
    return path
  }

  /** Write Markdown summary to disk */
  writeMarkdown(outputDir: string): string {
    const report = this.build()
    const dir = outputDir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const path = join(dir, `phase-${this.phase}-report.md`)

    const emoji = (s: TestStatus) =>
      s === 'passed' ? '✅' : s === 'failed' ? '❌' : s === 'skipped' ? '⏭️' : '⚠️'

    let md = `# Phase ${report.phase} Test Report\n\n`
    md += `**Generated:** ${report.timestamp}\n\n`
    md += `## Summary\n\n`
    md += `| Metric | Value |\n`
    md += `|---|---|\n`
    md += `| Total | ${report.summary.total} |\n`
    md += `| Passed | ${report.summary.passed} |\n`
    md += `| Failed | ${report.summary.failed} |\n`
    md += `| Skipped | ${report.summary.skipped} |\n`
    md += `| Flaky | ${report.summary.flaky} |\n`
    md += `| Duration | ${(report.summary.durationMs / 1000).toFixed(1)}s |\n`

    if (report.coverage) {
      md += `\n## Coverage\n\n`
      md += `| Metric | Value |\n`
      md += `|---|---|\n`
      md += `| Lines | ${report.coverage.lines}% |\n`
      md += `| Branches | ${report.coverage.branches}% |\n`
      md += `| Functions | ${report.coverage.functions}% |\n`
      md += `| Statements | ${report.coverage.statements}% |\n`
    }

    if (report.tests.length > 0) {
      md += `\n## Tests\n\n`
      md += `| Status | ID | Description | Duration |\n`
      md += `|---|---|---|---|\n`
      for (const t of report.tests) {
        const dur = `${(t.durationMs / 1000).toFixed(2)}s`
        md += `| ${emoji(t.status)} | ${t.id} | ${t.description} | ${dur} |\n`
      }
    }

    if (report.defects.length > 0) {
      md += `\n## Defects\n\n`
      for (const d of report.defects) {
        const sev = d.severity === 'blocker' ? '🔴' : d.severity === 'major' ? '🟠' : '🟡'
        md += `### ${sev} [${d.severity.toUpperCase()}] ${d.title}\n\n`
        md += `${d.description}\n\n`
        md += `- **Component:** ${d.affectedComponent}\n`
        md += `- **Reproducible:** ${d.reproducible}\n`
        if (d.evidencePath) md += `- **Evidence:** ${d.evidencePath}\n`
        md += '\n'
      }
    }

    if (report.artifacts.screenshots.length > 0) {
      md += `\n## Screenshots\n\n`
      for (const s of report.artifacts.screenshots) {
        md += `- ${s}\n`
      }
      md += '\n'
    }

    if (report.artifacts.traces.length > 0) {
      md += `\n## Traces\n\n`
      for (const t of report.artifacts.traces) {
        md += `- ${t}\n`
      }
      md += '\n'
    }

    writeFileSync(path, md, 'utf-8')
    return path
  }
}

// ── CLI usage ─────────────────────────────────────────────────────────────
//
// This module can also be used from a script:
//   tsx src/test/reporter.ts --phase T1 --output-dir test-results
//
// For programmatic use, create a ReportBuilder instance and call
// its methods, then writeJson() and writeMarkdown() at the end.
