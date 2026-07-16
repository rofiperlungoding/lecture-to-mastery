// ═══════════════════════════════════════════════════════════════════════════
// Time control utilities
//
// Provides a controllable clock for deterministic tests involving:
//   - SM-2 scheduling (due_at comparisons)
//   - Study streak calculations (consecutive days)
//   - XP daily caps (date-based resets)
//   - Achievement evaluations (time-based conditions)
//
// In tests, call `setTestNow()` to freeze time, then advance with `tick()`.
// ═══════════════════════════════════════════════════════════════════════════

let _testNow: Date | null = null

/**
 * Freeze the clock to a specific date/time for testing.
 * All subsequent `now()` calls return this value until reset.
 */
export function setTestNow(date: Date | string | number): void {
  _testNow = new Date(date)
}

/**
 * Advance the frozen clock by the given duration.
 * Has no effect if `setTestNow()` hasn't been called.
 */
export function advanceTime(ms: number): void {
  if (_testNow) {
    _testNow = new Date(_testNow.getTime() + ms)
  }
}

/**
 * Advance the frozen clock by N days (86400000 ms each).
 */
export function advanceDays(n: number): void {
  advanceTime(n * 86_400_000)
}

/**
 * Reset the clock to real time (stop controlling time).
 */
export function resetTime(): void {
  _testNow = null
}

/**
 * Get the current test time, or real time if not frozen.
 * Replace `new Date()` calls with this in testable code.
 */
export function now(): Date {
  return _testNow ? new Date(_testNow) : new Date()
}

/**
 * Get ISO string of test time.
 */
export function nowISO(): string {
  return now().toISOString()
}

/**
 * Get today's date as YYYY-MM-DD string (local timezone).
 */
export function todayStr(): string {
  const d = now()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Get yesterday's date as YYYY-MM-DD string.
 */
export function yesterdayStr(): string {
  const d = now()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Get a date N days from test time.
 */
export function daysFromNow(n: number): Date {
  const d = now()
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Build ISO date string offset from test time.
 * Positive = future, Negative = past.
 *
 * Example: `dateOffset(-3)` → 3 days ago as ISO string
 */
export function isoOffset(days: number): string {
  return daysFromNow(days).toISOString()
}

// ── Convenience: create a known streak of study event dates ────────────────

/**
 * Generate an array of ISO date strings representing N consecutive days
 * ending at the test time (or today). Useful for seeding streak data.
 */
export function consecutiveDays(count: number): string[] {
  const dates: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    dates.push(isoOffset(-i))
  }
  return dates
}
