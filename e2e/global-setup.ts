// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SETUP — Authenticate exactly ONCE as guest, save storageState
//
// Every spec reuses this session via use.storageState in playwright.config.ts.
// This eliminates the 429 rate-limit caused by dozens of anonymous signups
// during a full suite run.
//
// Creates up to 3 pre-authenticated sessions:
//   user.json   — primary session for all specs (shared via config.storageState)
//   userA.json  — User A for security-rls.spec.ts (Row-Level Security isolation)
//   userB.json  — User B for security-rls.spec.ts
// ═══════════════════════════════════════════════════════════════════════════

import { chromium, type FullConfig } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

const AUTH_DIR = path.join(__dirname, '.auth')
const AUTH_FILE = path.join(AUTH_DIR, 'user.json')
const AUTH_A_FILE = path.join(AUTH_DIR, 'userA.json')
const AUTH_B_FILE = path.join(AUTH_DIR, 'userB.json')

async function createSession(baseURL: string, savePath: string, label: string): Promise<void> {
  const browser = await chromium.launch()
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  await page.goto(`${baseURL}/login`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)

  await page.locator('text=Try as guest').click()
  await page.waitForURL('**/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)

  await context.storageState({ path: savePath })
  console.log(`[GLOBAL SETUP] ✅ ${label} session saved to ${savePath}`)
  await browser.close()
}

async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

  // Primary session — all specs
  await createSession(baseURL, AUTH_FILE, 'Primary guest')

  // User A — for security-rls Row-Level Security isolation tests
  await createSession(baseURL, AUTH_A_FILE, 'User A (RLS)')

  // User B — for security-rls
  await createSession(baseURL, AUTH_B_FILE, 'User B (RLS)')
}

export default globalSetup
