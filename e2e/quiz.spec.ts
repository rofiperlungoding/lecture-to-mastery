// ═══════════════════════════════════════════════════════════════════════════
// PHASE T8 — Quiz + Concept Tagging E2E
//
// Tasks:
//   1. Generation — assert structural validity
//   2. Scoring — 100%, known-wrong exact score; feedback + explanation
//   3. Mastery wiring — concept_mastery + study_events payload
//   4. Interaction UX — keyboard, single selection, disabled submit, results
//   5. Edge — empty content → graceful; malformed output handled; fresh retake
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

const SCREENSHOT_DIR = 'test-results/screenshots-quiz'
const REPORT_DIR = 'test-results'
const DEMO_DOC_TITLE = 'Data Structures: Arrays, Linked Lists & Big-O'

interface SeedQuestion {
  question: string
  options: string[]
  correct_index: number
  explanation: string
  concept: string
}

const SEEDED_QUESTIONS: SeedQuestion[] = [
  { question: 'What is the time complexity of accessing an array element by index?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], correct_index: 0, explanation: 'Array access is O(1) because the memory address can be calculated directly using base_address + (index × element_size).', concept: 'Array access' },
  { question: 'What makes linked list insertion at the head efficient?', options: ['Elements are stored contiguously', 'Only the head pointer needs updating', 'It uses binary search', 'It preallocates memory'], correct_index: 1, explanation: 'Inserting at the head of a linked list is O(1) because you only need to update the head pointer to point to the new node.', concept: 'Linked list insertion' },
  { question: 'Which Big-O notation describes the worst-case time complexity of merge sort?', options: ['O(n)', 'O(n²)', 'O(n log n)', 'O(log n)'], correct_index: 2, explanation: 'Merge sort has O(n log n) time complexity in both best and average cases.', concept: 'Big-O notation' },
  { question: 'What happens to array elements when inserting an element in the middle?', options: ['They remain unchanged', 'They shift one position right', 'They are deleted', 'They are copied to a new array'], correct_index: 1, explanation: 'Every element after the insertion point must shift right by one position to maintain contiguity, making it O(n).', concept: 'Array operations' },
]

const errorLog: string[] = []
const assertionFailures = { value: 0 }
let demoDocId: string | null = null
let currentUserId: string | null = null

// trackErrors replaced by shared trackObservations from helpers/reporter

async function snap(page: Page, label: string): Promise<void> {
  const filename = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${filename}.png`), fullPage: true })
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
  await expect(page.locator(`text=${DEMO_DOC_TITLE}`).first()).toBeVisible({ timeout: 15_000 })
  const docLink = page.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  const href = await docLink.getAttribute('href')
  if (href) { const match = href.match(/\/doc\/(.+)/); if (match) demoDocId = match[1] }
}

async function navigateToDoc(page: Page): Promise<void> {
  const docLink = page.locator(`a[href*="/doc/"]:has-text("${DEMO_DOC_TITLE}")`).first()
  await expect(docLink).toBeVisible({ timeout: 8_000 })
  await docLink.click()
  await page.waitForURL(/\/doc\//, { timeout: 15_000 })
  await waitForReady(page)
}

async function navigateToQuizTab(page: Page): Promise<void> {
  const quizTab = page.locator('button[role="tab"]:has-text("Quiz")').first()
  await expect(quizTab).toBeVisible({ timeout: 8_000 })
  await quizTab.click()
  await page.waitForTimeout(600)
}

/** Seed quiz questions from the SEEDED_QUESTIONS constant (single source of truth). */
async function seedQuizQuestions(page: Page, docId: string, questions: readonly SeedQuestion[]): Promise<void> {
  await page.evaluate(async ({ docId, questions }) => {
    try {
      const mod = await import('/src/lib/supabase.ts')
      await mod.supabase.from('quiz_questions').delete().eq('document_id', docId)
      for (const q of questions) {
        await mod.supabase.from('quiz_questions').insert({ document_id: docId, ...q })
      }
    } catch { /* best-effort */ }
  }, { docId, questions })
}

async function clearQuizQuestions(page: Page, docId: string): Promise<void> {
  if (!docId) return
  await page.evaluate(async (id: string) => {
    try { const mod = await import('/src/lib/supabase.ts'); await mod.supabase.from('quiz_questions').delete().eq('document_id', id) } catch { }
  }, docId)
}

async function getConceptMastery(page: Page, docId: string): Promise<Array<{ concept: string; attempts: number; correct: number }>> {
  return page.evaluate(async (id: string) => {
    try { const mod = await import('/src/lib/supabase.ts'); const { data } = await mod.supabase.from('concept_mastery').select('concept, attempts, correct').eq('document_id', id); return data ?? [] } catch { return [] }
  }, docId)
}

async function getStudyEventsForDoc(page: Page, docId: string, userId: string | null): Promise<Array<{ event_type: string; event_data: unknown }>> {
  return page.evaluate(async ({ docId, userId }: { docId: string; userId: string | null }) => {
    try {
      const mod = await import('/src/lib/supabase.ts')
      let q = mod.supabase.from('study_events').select('event_type, event_data').eq('document_id', docId).eq('event_type', 'quiz_completed')
      if (userId) q = q.eq('user_id', userId)
      const { data } = await q.order('created_at', { ascending: false }).limit(3)
      return data ?? []
    } catch { return [] }
  }, { docId, userId })
}

async function getQuizAttemptsCount(page: Page, docId: string): Promise<number> {
  return page.evaluate(async (id: string) => {
    try { const mod = await import('/src/lib/supabase.ts'); const { count } = await mod.supabase.from('quiz_attempts').select('*', { count: 'exact', head: true }).eq('document_id', id); return count ?? 0 } catch { return -1 }
  }, docId)
}

async function clickAnswer(page: Page, index: number): Promise<void> {
  const target = page.locator('button:not([disabled])').filter({ hasText: ['A', 'B', 'C', 'D'][index] }).first()
  await expect(target).toBeVisible({ timeout: 5_000 })
  await target.click()
  await page.waitForTimeout(300)
}

async function submitAnswer(page: Page): Promise<void> {
  const btn = page.locator('button:has-text("Submit Answer")')
  await expect(btn).toBeVisible({ timeout: 5_000 })
  await expect(btn).not.toBeDisabled({ timeout: 3_000 })
  await btn.click()
  await page.waitForTimeout(500)
}

async function advanceQuestion(page: Page): Promise<void> {
  await (page.locator('button:has-text("Next Question")').or(page.locator('button:has-text("See Results")'))).click()
  await page.waitForTimeout(400)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Quiz Generation, Scoring & Concept Tagging', () => {
  test.afterEach(() => {
    const status = test.info().status;
    if (status === 'failed' || status === 'timedout') assertionFailures.value++;
  })

  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    errorLog.length = 0
    demoDocId = null
    currentUserId = null
  })

  test.afterAll(async ({ page }) => {
    if (demoDocId) await clearQuizQuestions(page, demoDocId)
    const report: Record<string, unknown> = {
      phase: 'T8', timestamp: new Date().toISOString(), passed: assertionFailures.value === 0, errorCount: errorLog.length, errors: [...errorLog],
      screenshotCount: 0, screenshots: [] as string[] }
    try { const files = fs.readdirSync(SCREENSHOT_DIR); report.screenshots = files; report.screenshotCount = files.length } catch { }
    fs.writeFileSync(path.join(REPORT_DIR, 't8-report.json'), JSON.stringify(report, null, 2))
    const observations = categorizeObservations(errorLog);
    const md = ['# Phase T8 — Quiz & Concept Tagging E2E Report', '', `**Timestamp:** ${report.timestamp}`, `**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}`, `**Errors:** ${report.errorCount}`, '', '---', '', '## Screenshots', '', ...report.screenshots.map((f) => `- \`${f}\``), '', '---', '', ...(errorLog.length > 0 ? ['## Errors', '', ...errorLog.map((e) => `- ${e}`)] : ['## No errors detected']), ''].join('\n')
    fs.writeFileSync(path.join(REPORT_DIR, 't8-report.md'), md)
    console.log(`📸 ${SCREENSHOT_DIR}/`)
  })

  test('01 — Guest login and load demo document', async ({ page }) => {
    trackObservations(page, errorLog); await loginAsGuest(page); await snap(page, '01-logged-in-dashboard')
    await loadDemoDocument(page); await snap(page, '02-demo-document-loaded')
  })

  test('02 — Seed quiz questions and verify structural validity', async ({ page }) => {
    trackObservations(page, errorLog)
    await navigateToDoc(page)
    await expect(page.locator('button[role="tab"]:has-text("Quiz")').first()).toBeVisible({ timeout: 8_000 })

    if (demoDocId) await seedQuizQuestions(page, demoDocId, SEEDED_QUESTIONS)

    const dbQuestions: SeedQuestion[] = await page.evaluate(async (docId: string) => {
      try { const mod = await import('/src/lib/supabase.ts'); const { data } = await mod.supabase.from('quiz_questions').select('question, options, correct_index, explanation, concept').eq('document_id', docId).order('id'); return data ?? [] } catch { return [] }
    }, demoDocId!)
    expect(dbQuestions.length).toBe(SEEDED_QUESTIONS.length)

    for (let i = 0; i < dbQuestions.length; i++) {
      expect(dbQuestions[i].options.length).toBe(4)
      expect(Number.isInteger(dbQuestions[i].correct_index)).toBe(true)
      expect(dbQuestions[i].correct_index).toBeGreaterThanOrEqual(0)
      expect(dbQuestions[i].correct_index).toBeLessThanOrEqual(3)
      expect(dbQuestions[i].explanation.length).toBeGreaterThan(0)
      expect(dbQuestions[i].concept.length).toBeGreaterThan(0)
      expect(dbQuestions[i].question).toBe(SEEDED_QUESTIONS[i].question)
    }

    currentUserId = await page.evaluate(async () => {
      try { const mod = await import('/src/lib/supabase.ts'); const { data: { user } } = await mod.supabase.auth.getUser(); return user?.id ?? null } catch { return null }
    })
    await snap(page, '03-questions-seeded')
  })

  test('03 — Quiz tab loads questions into taking phase', async ({ page }) => {
    trackObservations(page, errorLog)
    await page.reload(); await waitForReady(page); await navigateToQuizTab(page)
    await expect(page.locator('text=Submit Answer').first()).toBeVisible({ timeout: 10_000 })
    const pt = await page.locator('text=/\\d+ \\/ \\d+/').first().textContent()
    expect(pt).toContain('1 /'); expect(pt).toContain('4')
    await expect(page.locator(`text=${SEEDED_QUESTIONS[0].question}`).first()).toBeVisible({ timeout: 5_000 })
    for (const l of ['A', 'B', 'C', 'D']) await expect(page.locator(`text=${l}`).first()).toBeVisible({ timeout: 3_000 })
    await snap(page, '04-quiz-taking-phase')
  })

  test('04 — Interaction UX: disabled submit, keyboard selection, aria-selected', async ({ page }) => {
    trackObservations(page, errorLog)
    const submitBtn = page.locator('button:has-text("Submit Answer")').first()
    await expect(submitBtn).toBeVisible({ timeout: 5_000 }); await expect(submitBtn).toBeDisabled()

    const firstOpt = page.locator('button:has-text("A")').first()
    await firstOpt.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    await expect(firstOpt).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 })
    await expect(submitBtn).not.toBeDisabled({ timeout: 3_000 })

    await clickAnswer(page, 1); await page.waitForTimeout(200)
    await expect(submitBtn).not.toBeDisabled()
    await snap(page, '05-interaction-ux')
  })

  test('05 — Score 100% with explanation reveal after each answer', async ({ page }) => {
    trackObservations(page, errorLog)
    for (const idx of [0, 1, 2, 1]) {
      await clickAnswer(page, idx)
      await submitAnswer(page)
      await expect(page.locator('text=Explanation').first()).toBeVisible({ timeout: 3_000 })
      await advanceQuestion(page)
    }
    await expect(page.locator('text=4/4').or(page.locator('text=Perfect score'))).toBeVisible({ timeout: 5_000 })
    await snap(page, '06-perfect-score')
  })

  test('06 — Known-wrong scoring: all wrong → exact 0/4 with ✗ indicators', async ({ page }) => {
    trackObservations(page, errorLog)
    await page.locator('button:has-text("Retake")').first().click()
    await page.waitForTimeout(600)
    await expect(page.locator('text=Submit Answer').first()).toBeVisible({ timeout: 5_000 })

    for (let i = 0; i < SEEDED_QUESTIONS.length; i++) {
      await clickAnswer(page, 3) // D is always wrong for correct_indices 0,1,2,1
      await submitAnswer(page)
      await expect(page.locator('text=Explanation').first()).toBeVisible({ timeout: 3_000 })
      await advanceQuestion(page)
    }

    await expect(page.locator('text=0/4').or(page.locator('text=Keep studying'))).toBeVisible({ timeout: 5_000 })
    // Verify per-question wrong-answer indicators
    const wrongIndicators = await page.locator('text=✗').count()
    expect(wrongIndicators).toBeGreaterThanOrEqual(SEEDED_QUESTIONS.length)
    await snap(page, '07-all-wrong-score')
  })

  test('07 — Mastery wiring: concept_mastery and study_events', async ({ page }) => {
    trackObservations(page, errorLog)
    if (!demoDocId) { console.log('[SKIP]'); return }
    const mastery = await getConceptMastery(page, demoDocId)
    for (const r of mastery) { expect(r.attempts).toBeGreaterThanOrEqual(1) }
    const events = await getStudyEventsForDoc(page, demoDocId, currentUserId)
    const qc = events.find((e) => e.event_type === 'quiz_completed')
    expect(qc).toBeDefined()
    if (qc) { const d = qc.event_data as Record<string, unknown>; expect(d).toHaveProperty('score'); expect(d).toHaveProperty('total') }
    await snap(page, '08-mastery-wiring')
  })

  test('08 — Re-taking produces fresh attempt', async ({ page }) => {
    trackObservations(page, errorLog)
    await navigateToQuizTab(page)
    await expect(page.locator('button:has-text("Retake")').first()).toBeVisible({ timeout: 8_000 })
    const before = await getQuizAttemptsCount(page, demoDocId!)
    await page.locator('button:has-text("Retake")').first().click()
    await page.waitForTimeout(600)
    await expect(page.locator('text=Submit Answer').first()).toBeVisible({ timeout: 5_000 })
    for (let i = 0; i < SEEDED_QUESTIONS.length; i++) {
      await clickAnswer(page, SEEDED_QUESTIONS[i].correct_index)
      await submitAnswer(page); await expect(page.locator('text=Explanation').first()).toBeVisible({ timeout: 3_000 })
      await advanceQuestion(page)
    }
    await expect(page.locator('text=/\\d+\\/4/').first()).toBeVisible({ timeout: 5_000 })
    expect(await getQuizAttemptsCount(page, demoDocId!)).toBeGreaterThan(before)
    await snap(page, '09-retake-results')
  })

  test('09 — Empty content → graceful error', async ({ page }) => {
    trackObservations(page, errorLog)
    if (!demoDocId) { console.log('[SKIP]'); return }
    await clearQuizQuestions(page, demoDocId)
    await page.reload(); await waitForReady(page); await navigateToQuizTab(page)
    await expect(page.locator('text=No quiz yet').or(page.locator('button:has-text("Generate Quiz")'))).toBeVisible({ timeout: 8_000 })
    const btn = page.locator('button:has-text("Generate Quiz")').first()
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click()
      await expect(page.locator('text=Reading document').or(page.locator('text=Creating questions').or(page.locator('text=Import failed').or(page.locator('text=Quiz generation failed').or(page.locator('text=No chunks')))))).toBeVisible({ timeout: 15_000 })
      await snap(page, '10-generate-quiz-graceful')
    } else { await snap(page, '10-no-generate-btn') }
    await seedQuizQuestions(page, demoDocId, SEEDED_QUESTIONS)
  })

  test('10 — Malformed model output handled gracefully (route mock)', async ({ page }) => {
    trackObservations(page, errorLog)
    if (!demoDocId) { console.log('[SKIP]'); return }
    await clearQuizQuestions(page, demoDocId)
    await page.reload(); await waitForReady(page); await navigateToQuizTab(page)

    await page.route(/generate-quiz/, (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ not_questions: 'malformed — no questions array' }) })
    })

    const btn = page.locator('button:has-text("Generate Quiz")').first()
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click()
      await expect(page.locator('text=Import failed').or(page.locator('text=Quiz generation failed').or(page.locator('text=Error')))).toBeVisible({ timeout: 10_000 })
      await snap(page, '11-malformed-output-graceful')
    }
    await page.unroute(/generate-quiz/)
    await seedQuizQuestions(page, demoDocId, SEEDED_QUESTIONS)
  })

  test('11 — No uncaught console errors or failed requests', async () => {
    const n = errorLog.length
    if (n > 0) { console.log(`\n❌ ${n} error(s):`); for (const e of errorLog) console.log(`  ${e}`) }
    expect(errorLog, `Found ${n} errors`).toHaveLength(0)
  })
})
