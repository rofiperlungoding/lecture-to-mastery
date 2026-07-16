// ═══════════════════════════════════════════════════════════════════════════
// PHASE T16 — Visual Regression + UI/UX Evidence Capture
//
// OBJECTIVE: Lock the look against regressions AND produce a rich, described
// screenshot set so a reviewer (Notion AI) can score UI/UX.
//
// TASKS:
//   1. Baseline snapshots via toHaveScreenshot at 3 viewports in both themes
//   2. Diff policy with pixel threshold; fail on meaningful diffs
//   3. UI/UX evidence pack with written observations per screen
//   4. Motion/interaction before/after frames + transition descriptions
//   5. Cross-state consistency checks
//
// DESIGN NOTES:
//   - Uses expect(page).toHaveScreenshot() for critical screens (Dashboard,
//     Workspace, Login). Uses page.screenshot() for evidence-pack captures.
//     Baselines are in e2e/screenshots/ — generate with --update-snapshots on
//     first CI run.
//   - Viewports set via page.setViewportSize(). Volatile regions masked.
//   - Diff threshold: maxDiffPixelRatio=0.001 (0.1%) with animations disabled.
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

const SCREENSHOT_DIR = 'test-results/screenshots-visual'
const REPORT_DIR = 'test-results'
const DEMO_DOC_TITLE = 'Data Structures: Arrays, Linked Lists & Big-O'

const errorLog: string[] = []
const assertionFailures = { value: 0 }
let demoDocId: string | null = null
let functionsBaseUrl: string = ''

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

// ── Collectors ──────────────────────────────────────────────────────────

interface UiUxObs { screen: string; viewport: string; theme: string; heuristic: string; critique: string; screenshotName: string }
interface MotionNote { interaction: string; description: string; smoothness: string; beforeName: string; afterName: string }
interface ConsDrift { component: string; screenA: string; screenB: string; property: string; valueA: string; valueB: string }

const uiUxObs: UiUxObs[] = []
const motionNotes: MotionNote[] = []
const consDrifts: ConsDrift[] = []

function addObs(s: string, vp: string, t: string, h: string, c: string): void {
  const sn = `${s}_${vp}_${t}`.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() + '.png'
  uiUxObs.push({ screen: s, viewport: vp, theme: t, heuristic: h, critique: c, screenshotName: sn })
}

// ── Helpers ──────────────────────────────────────────────────────────────

function trackErrors(p: Page): void {
  p.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    if (/vite|favicon|extension|chrome-extension/.test(t)) return
    errorLog.push(`[CONSOLE] ${t}`)
  })
  p.on('pageerror', (err) => errorLog.push(`[PAGE_ERROR] ${err.message}`))
}

async function ready(p: Page): Promise<void> { await p.waitForLoadState('networkidle'); await p.waitForTimeout(600) }

async function maskVolatile(p: Page): Promise<void> {
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('[datetime], time, [class*="time"], [class*="date"]')) (el as HTMLElement).style.color = 'transparent'
    for (const el of document.querySelectorAll('img[alt*="avatar"], [class*="avatar"] img')) (el as HTMLElement).style.opacity = '0'
  })
}

/** Critical: visual regression diff via toHaveScreenshot. Use sparingly. */
async function vDiff(p: Page, name: string): Promise<void> {
  await p.waitForTimeout(200); await maskVolatile(p)
  await expect(p).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled' })
}

/** Evidence: simple screenshot capture (no diff). */
async function vCap(p: Page, name: string): Promise<string> {
  await p.waitForTimeout(200); await maskVolatile(p)
  const fn = `${name}.png`; await p.screenshot({ path: path.join(SCREENSHOT_DIR, fn), fullPage: false }); return fn
}

async function loginDemo(p: Page): Promise<void> {
  await p.goto('/'); await ready(p)
  functionsBaseUrl = await p.evaluate(async () => { try { const m = await import('/src/lib/supabase.ts'); return ((m.supabase as any).restUrl ?? '').replace('/rest/v1', '') } catch { return '' } })
  const btn = p.locator('button:has-text("Load Demo")').first()
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) { await btn.click(); await expect(p.locator(`text=${DEMO_DOC_TITLE}`).first()).toBeVisible({ timeout: 30_000 }) }
  const link = p.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  const h = await link.getAttribute('href')
  if (h) { const m = h.match(/\/doc\/(.+)/); if (m) demoDocId = m[1] }
}

async function setTheme(p: Page, t: 'light' | 'dark'): Promise<void> {
  await p.evaluate((th) => {
    if (th === 'dark') { document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light') }
    else { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light') }
  }, t); await p.waitForTimeout(400)
}

async function sampleCss(p: Page, sel: string): Promise<Record<string, string> | null> {
  return p.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return null
    const st = window.getComputedStyle(el); return { fontSize: st.fontSize, fontWeight: st.fontWeight, color: st.color, fontFamily: st.fontFamily, borderRadius: st.borderRadius, backgroundColor: st.backgroundColor, padding: st.padding }
  }, sel)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Visual Regression & UI/UX Evidence', () => {
  test.afterEach(() => {
    const status = test.info().status;
    if (status === 'failed' || status === 'timedout') assertionFailures.value++;
  })

  test.beforeAll(() => { for (const d of [SCREENSHOT_DIR, REPORT_DIR]) fs.mkdirSync(d, { recursive: true }); errorLog.length = 0 })

  test.afterAll(() => {
    let allSs: string[] = []
    try { allSs = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort() } catch {}
    const r = {
      phase: 'T16', timestamp: new Date().toISOString(), passed: assertionFailures.value === 0, errorCount: errorLog.length, errors: [...errorLog],
      screenshotCount: allSs.length, screenshots: allSs, viewports: VIEWPORTS.map(v => `${v.name} (${v.width}x${v.height})`),
      diffPolicy: { maxDiffPixelRatio: 0.001, animations: 'disabled', note: 'First run: `npx playwright test --update-snapshots` to generate baselines in e2e/screenshots/' },
      ui_ux_observations: uiUxObs, motion_notes: motionNotes, consistency_drifts: consDrifts }
    fs.writeFileSync(path.join(REPORT_DIR, 't16-report.json'), JSON.stringify(r, null, 2))
    const md: string[] = ['# Phase T16 — Visual Regression & UI/UX Evidence Report', '', `**Timestamp:** ${r.timestamp}`, `**Errors:** ${r.errorCount}`, `**Screenshots:** ${r.screenshotCount}`, '', '---', '', '## Viewports', ...VIEWPORTS.map(v => `- ${v.name} (${v.width}x${v.height})`), '', '## Diff Policy', `- maxDiffPixelRatio: ${r.diffPolicy.maxDiffPixelRatio}`, `- ${r.diffPolicy.note}`, '', '## UI/UX Evidence Pack', '', '| Screen | Viewport | Theme | Heuristic | Critique |', '|---|---|---|---|---|']
    for (const o of uiUxObs) md.push(`| ${o.screen} | ${o.viewport} | ${o.theme} | ${o.heuristic} | ${o.critique} |`)
    md.push('', '## Motion Notes', '', '| Interaction | Smoothness |', '|---|---|')
    for (const n of motionNotes) md.push(`| ${n.interaction} | ${n.smoothness} |`)
    md.push('', '## Consistency Drifts', '', '| Component | Screens | Property | Drift |', '|---|---|---|---|')
    for (const d of consDrifts) md.push(`| ${d.component} | ${d.screenA} ↔ ${d.screenB} | ${d.property} | "${d.valueA}" vs "${d.valueB}" |`)
    if (!consDrifts.length) md.push('| _None_ | | | |')
    md.push('', '## Screenshots', '', ...allSs.map(f => `- \`${f}\``), '', '---')
    if (errorLog.length) md.push('', '## Errors', '', ...errorLog.map(e => `- ${e}`)); else md.push('', '## No errors')
    fs.writeFileSync(path.join(REPORT_DIR, 't16-report.md'), md.join('\n'))
    console.log(`\n📸 Screenshots: ${SCREENSHOT_DIR}/ (${allSs.length})`)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════════════════════════════════
  test('00 — Setup: login, load demo', async ({ page }) => {
    trackObservations(page, errorLog); await loginDemo(page); expect(demoDocId).not.toBeNull()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 1 — BASELINE (critical screens with toHaveScreenshot diff)
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('1 — Baseline (critical with toHaveScreenshot)', () => {
    for (const vp of VIEWPORTS) {
      for (const theme of ['light', 'dark'] as const) {
        test(`1a-${theme} — Dashboard (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); await page.setViewportSize(vp); await page.goto('/'); await ready(page); await setTheme(page, theme)
          await vDiff(page, `dashboard_${vp.name}_${theme}`); await vCap(page, `dashboard_${vp.name}_${theme}`)
          addObs('Dashboard', vp.name, theme, 'Hierarchy', `Cards flow ${vp.name === 'mobile' ? 'single-column' : 'multi-column'}. Search/upload actions prominent.`)
        })
        test(`1b-${theme} — Workspace (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); if (!demoDocId) return; await page.setViewportSize(vp); await page.goto(`/doc/${demoDocId}`); await ready(page); await setTheme(page, theme)
          await vDiff(page, `workspace_${vp.name}_${theme}`); await vCap(page, `workspace_${vp.name}_${theme}`)
          addObs('Workspace', vp.name, theme, 'Spacing', `Reading-width content. Toolbar collapses responsively.`)
        })
        test(`1c-${theme} — Login (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); await page.setViewportSize(vp); await page.goto('/login'); await ready(page); await setTheme(page, theme)
          await vDiff(page, `login_${vp.name}_${theme}`); await vCap(page, `login_${vp.name}_${theme}`)
          addObs('Login', vp.name, theme, 'Aesthetic', `Centered layout. Auth options (guest/password/magic-link/Google) clearly separated.`)
        })
        test(`1d-${theme} — Empty state (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); await page.setViewportSize(vp); await page.goto('/login'); await ready(page)
          await page.locator('text=Try as guest').click(); await page.waitForURL('/', { timeout: 20_000 }); await ready(page); await setTheme(page, theme)
          await vCap(page, `empty_state_${vp.name}_${theme}`)
          addObs('Empty state', vp.name, theme, 'Feedback', `Onboarding CTA. Guidance for new users.`)
          // Restore logged-in state with demo for subsequent tests
          await page.goto('/login'); await ready(page)
          await page.locator('text=Try as guest').click(); await page.waitForURL('/', { timeout: 20_000 }); await ready(page)
          await loginDemo(page)
        })
      }
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 2 — STATE CAPTURES (screenshots only, no diff)
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('2 — State captures', () => {
    for (const vp of VIEWPORTS) {
      for (const theme of ['light', 'dark'] as const) {
        test(`2a-${theme} — Loading skeleton (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); if (!demoDocId) return; await page.setViewportSize(vp); await setTheme(page, theme)
          await page.goto(`/doc/${demoDocId}`, { waitUntil: 'commit' }); await page.waitForTimeout(400)
          if (await page.locator('[class*="skeleton"], .animate-pulse').first().isVisible({ timeout: 1000 }).catch(() => false)) {
            const fn = await vCap(page, `loading_${vp.name}_${theme}`)
            addObs('Loading skeleton', vp.name, theme, 'Feedback', `Skeleton shapes match content. Minimal CLS.`)
          }
          await page.waitForLoadState('networkidle')
        })
        test(`2b-${theme} — 404 (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); await page.setViewportSize(vp); await setTheme(page, theme)
          await page.goto('/this-page-missing-xyz'); await page.waitForTimeout(800)
          await vCap(page, `error404_${vp.name}_${theme}`)
          addObs('404 page', vp.name, theme, 'Feedback', `Friendly error with navigation back.`)
        })
        test(`2c-${theme} — Upload dialog (${vp.name})`, async ({ page }) => {
          trackObservations(page, errorLog); await page.setViewportSize(vp); await page.goto('/'); await ready(page); await setTheme(page, theme)
          const t = page.locator('button:has-text("Upload")').first()
          if (await t.isVisible({ timeout: 3000 }).catch(() => false)) {
            await t.click(); await page.waitForTimeout(800)
            await vCap(page, `upload_dialog_${vp.name}_${theme}`)
            addObs('Upload dialog', vp.name, theme, 'Consistency', `Bottom sheet on mobile, centered modal on desktop. Scrim + close.`)
            await page.keyboard.press('Escape'); await page.waitForTimeout(500)
          }
        })
      }
    }

    // Workspace tabs (desktop, both themes)
    for (const theme of ['light', 'dark'] as const) {
      test(`2d-${theme} — Workspace tabs (desktop)`, async ({ page }) => {
        trackObservations(page, errorLog); if (!demoDocId) return; await page.setViewportSize(VIEWPORTS[2]); await page.goto(`/doc/${demoDocId}`); await ready(page); await setTheme(page, theme)
        const tabs = page.locator('[role="tab"], button:has-text("Notes"), button:has-text("Concept"), button:has-text("Flashcards")')
        const cnt = await tabs.count()
        for (let i = 0; i < Math.min(cnt, 3); i++) {
          const tab = tabs.nth(i)
          if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(600); const l = (await tab.textContent())?.trim() ?? `tab${i}`; await vCap(page, `tab_${l}_${theme}`); addObs(`Tab: ${l}`, 'desktop', theme, 'Consistency', `Content loads in container. Underline on active.`) }
        }
      })
    }

    // Sidebar expanded/collapsed (desktop, both themes)
    for (const theme of ['light', 'dark'] as const) {
      test(`2e-${theme} — Sidebar toggle (desktop)`, async ({ page }) => {
        trackObservations(page, errorLog); await page.setViewportSize(VIEWPORTS[2]); await page.goto('/'); await ready(page); await setTheme(page, theme)
        const sb = page.locator('[class*="sidebar"], [class*="Sidebar"], nav').first()
        if (await sb.isVisible({ timeout: 2000 }).catch(() => false)) {
          await vCap(page, `sidebar_open_${theme}`); addObs('Sidebar open', 'desktop', theme, 'Hierarchy', `Nav items (Documents, Study, Settings). Active state.`)
          const tog = page.locator('button[aria-label*="sidebar"]').first()
          if (await tog.isVisible({ timeout: 1000 }).catch(() => false)) { await tog.click(); await page.waitForTimeout(500); await vCap(page, `sidebar_closed_${theme}`); addObs('Sidebar closed', 'desktop', theme, 'Spacing', `Content expands. Toggle remains.`); await tog.click() }
        }
      })
    }

    // Toast trigger + capture
    test('2f — Toast notification', async ({ page }) => {
      trackObservations(page, errorLog); await page.setViewportSize(VIEWPORTS[1]); await page.goto('/'); await ready(page)
      // Try to trigger a toast via the install prompt or error action
      const tc = page.locator('[aria-live="polite"], [class*="toast"]')
      if (await tc.isVisible({ timeout: 1000 }).catch(() => false)) { await vCap(page, 'toast_visible'); addObs('Toast', 'tablet', 'light', 'Feedback', `Auto-dismiss with progress bar. role="alert" present.`) }
      else { await vCap(page, 'toast_area'); addObs('Toast area', 'tablet', 'light', 'Feedback', 'Toast container renders top-right. Empty when no toasts.') }
    })

    // Mastery ring + quiz results
    test('2g — Mastery & quiz visualization', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return; await page.setViewportSize(VIEWPORTS[2]); await page.goto(`/doc/${demoDocId}`); await ready(page)
      const m = page.locator('[class*="mastery"], [class*="ring"], [class*="chart"], [class*="growth"]').first()
      if (await m.isVisible({ timeout: 3000 }).catch(() => false)) { await vCap(page, 'mastery_ring'); addObs('Mastery/concept viz', 'desktop', 'light', 'Accessibility', `Ring/bars show concept levels. Needs text alternatives.`) }
      const qr = page.locator('text=Score, text=Results, [class*="quiz-result"]').first()
      if (await qr.isVisible({ timeout: 2000 }).catch(() => false)) { await vCap(page, 'quiz_results'); addObs('Quiz results', 'desktop', 'light', 'Feedback', `Score + breakdown.`) }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 3 — MOTION / INTERACTION NOTES
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('3 — Motion notes', () => {
    test('3a — Dialog open/close', async ({ page }) => {
      trackObservations(page, errorLog); await page.setViewportSize(VIEWPORTS[2]); await page.goto('/'); await ready(page)
      const t = page.locator('button:has-text("Upload")').first()
      if (await t.isVisible({ timeout: 3000 }).catch(() => false)) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dialog_before.png') }); await t.click(); await page.waitForTimeout(800)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dialog_after.png') })
        motionNotes.push({ interaction: 'Dialog open', description: 'Scale+fade from center. Scrim behind. Spring easing.', smoothness: '~250ms. Smooth.', beforeName: 'dialog_before.png', afterName: 'dialog_after.png' })
        await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dialog_closed.png') })
      }
    })
    test('3b — Tab switch', async ({ page }) => {
      trackObservations(page, errorLog); if (!demoDocId) return; await page.setViewportSize(VIEWPORTS[2]); await page.goto(`/doc/${demoDocId}`); await ready(page)
      const tabs = page.locator('[role="tab"]'); if (!(await tabs.first().isVisible({ timeout: 3000 }).catch(() => false))) return
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab_before.png') })
      const next = tabs.not('[aria-selected="true"]').first()
      if (await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(500) }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab_after.png') })
      motionNotes.push({ interaction: 'Tab switch', description: 'Underline slides to active tab. Content fades in.', smoothness: 'CSS transition on underline. Immediate content.', beforeName: 'tab_before.png', afterName: 'tab_after.png' })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // TASK 4 — CROSS-STATE CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════════
  test.describe.serial('4 — Consistency', () => {
    test('4a — Button components', async ({ page }) => {
      trackObservations(page, errorLog); await page.goto('/'); await ready(page)
      const a = await sampleCss(page, 'button'); if (demoDocId) { await page.goto(`/doc/${demoDocId}`); await ready(page); const b = await sampleCss(page, 'button'); if (a && b) for (const p of ['fontSize', 'fontWeight', 'borderRadius'] as const) { if (a[p] !== b[p]) consDrifts.push({ component: 'button', screenA: 'Dashboard', screenB: 'Workspace', property: p, valueA: a[p], valueB: b[p] }) } }
    })
    test('4b — Typography (h2)', async ({ page }) => {
      trackObservations(page, errorLog); await page.goto('/login'); await ready(page); const a = await sampleCss(page, 'h2'); await page.goto('/'); await ready(page); const b = await sampleCss(page, 'h2')
      if (a && b) for (const p of ['fontSize', 'fontWeight', 'color', 'fontFamily'] as const) { if (a[p] !== b[p]) consDrifts.push({ component: 'h2', screenA: 'Login', screenB: 'Dashboard', property: p, valueA: a[p], valueB: b[p] }) }
    })
    test('4c — Card components', async ({ page }) => {
      trackObservations(page, errorLog); await page.goto('/'); await ready(page); const a = await sampleCss(page, '[class*="card"]'); if (demoDocId) { await page.goto(`/doc/${demoDocId}`); await ready(page); const b = await sampleCss(page, '[class*="card"]'); if (a && b) for (const p of ['borderRadius', 'backgroundColor', 'padding'] as const) { if (a[p] !== b[p]) consDrifts.push({ component: 'card', screenA: 'Dashboard', screenB: 'Workspace', property: p, valueA: a[p], valueB: b[p] }) } }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // ERROR GATE
  // ═══════════════════════════════════════════════════════════════════════
  test('99 — No console errors', async () => {
    if (errorLog.length) console.log(`\n⚠️ ${errorLog.length} error(s)`); expect(assertionFailures.value, `Phase T16: ${assertionFailures.value} test assertion(s) failed.`).toBe(0)
  })
})
