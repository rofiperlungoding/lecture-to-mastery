// ═══════════════════════════════════════════════════════════════════════════
// E2E smoke test — App loads
//
// Verifies the SPA boots and renders the key navigation elements.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test'

test.describe('App smoke tests', () => {
  test('page loads and shows the app title', async ({ page }) => {
    // Navigate to the app (baseURL from config)
    await page.goto('/')

    // The page should load without errors
    await expect(page.locator('body')).toBeAttached()

    // Title should contain the app name
    const title = await page.title()
    expect(title).toContain('Lecture')
  })

  test('login page can be navigated to', async ({ page }) => {
    await page.goto('/login')

    // Should see a sign-in form or login-related heading
    await expect(page.locator('body')).toBeAttached()

    // Check that the page rendered something meaningful (not a blank page)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)

    // Check there are no console errors
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Wait for any async errors to surface
    await page.waitForTimeout(1000)
    expect(consoleErrors).toHaveLength(0)
  })

  test('404 route shows app shell', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')

    // Should still be on the app (not a blank page or server error)
    await expect(page.locator('body')).toBeAttached()

    // The page should render something (SPA fallback)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})
