import { describe, it, expect } from 'vitest'
import { computeSm2, QUALITY_MAP, VALID_RATINGS } from './sm2.ts'

// ---------------------------------------------------------------------------
// Quality mapping
// ---------------------------------------------------------------------------
describe('QUALITY_MAP', () => {
  it('maps again → 1', () => {
    expect(QUALITY_MAP.again).toBe(1)
  })

  it('maps hard → 2', () => {
    expect(QUALITY_MAP.hard).toBe(2)
  })

  it('maps good → 4', () => {
    expect(QUALITY_MAP.good).toBe(4)
  })

  it('maps easy → 5', () => {
    expect(QUALITY_MAP.easy).toBe(5)
  })

  it('covers all valid ratings', () => {
    for (const r of VALID_RATINGS) {
      expect(QUALITY_MAP[r]).toBeTypeOf('number')
      expect(QUALITY_MAP[r]).toBeGreaterThanOrEqual(1)
      expect(QUALITY_MAP[r]).toBeLessThanOrEqual(5)
    }
  })
})

// ---------------------------------------------------------------------------
// First review (currentInterval === 0)
// ---------------------------------------------------------------------------
describe('first review (interval = 0)', () => {
  const INITIAL_EASE = 2.5

  it('rating=again (q=1): interval=0, ease=max(1.3, 2.5-0.2)=2.3', () => {
    const result = computeSm2(1, INITIAL_EASE, 0)
    expect(result.intervalDays).toBe(0)
    expect(result.ease).toBe(2.3)
  })

  it('rating=hard (q=2): interval=0, ease=max(1.3, 2.5-0.2)=2.3', () => {
    const result = computeSm2(2, INITIAL_EASE, 0)
    expect(result.intervalDays).toBe(0)
    expect(result.ease).toBe(2.3)
  })

  it('rating=good (q=4): interval=1 day, ease stays ~2.5', () => {
    const result = computeSm2(4, INITIAL_EASE, 0)
    expect(result.intervalDays).toBe(1)
    expect(result.ease).toBeCloseTo(2.5, 1)
  })

  it('rating=easy (q=5): interval=1 day, ease increases', () => {
    const result = computeSm2(5, INITIAL_EASE, 0)
    expect(result.intervalDays).toBe(1)
    expect(result.ease).toBeGreaterThan(INITIAL_EASE)
  })
})

// ---------------------------------------------------------------------------
// Second review (currentInterval === 1)
// ---------------------------------------------------------------------------
describe('second review (interval = 1)', () => {
  const INITIAL_EASE = 2.5

  it('rating=again (q=1): interval resets to 0', () => {
    const result = computeSm2(1, INITIAL_EASE, 1)
    expect(result.intervalDays).toBe(0)
  })

  it('rating=good (q=4): interval jumps to 6 days', () => {
    const result = computeSm2(4, INITIAL_EASE, 1)
    expect(result.intervalDays).toBe(6)
  })

  it('rating=easy (q=5): interval jumps to 6 days', () => {
    const result = computeSm2(5, INITIAL_EASE, 1)
    expect(result.intervalDays).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Subsequent reviews (currentInterval > 1)
// ---------------------------------------------------------------------------
describe('subsequent reviews (interval > 1)', () => {
  const INITIAL_EASE = 2.5

  it('rating=again (q=1): interval resets to 0', () => {
    const result = computeSm2(1, INITIAL_EASE, 5)
    expect(result.intervalDays).toBe(0)
  })

  it('rating=hard (q=2): interval resets to 0', () => {
    const result = computeSm2(2, INITIAL_EASE, 5)
    expect(result.intervalDays).toBe(0)
  })

  it('rating=good (q=4): interval = round(current * ease)', () => {
    const result = computeSm2(4, INITIAL_EASE, 5)
    // ease ~2.5, interval = round(5 * 2.5) = 12 or 13
    expect(result.intervalDays).toBeGreaterThanOrEqual(10)
    expect(result.intervalDays).toBeLessThanOrEqual(15)
    expect(result.dueAt).toBeTruthy()
  })

  it('rating=easy (q=5): interval grows faster than good', () => {
    const good = computeSm2(4, INITIAL_EASE, 5)
    const easy = computeSm2(5, INITIAL_EASE, 5)
    expect(easy.intervalDays).toBeGreaterThanOrEqual(good.intervalDays)
    expect(easy.ease).toBeGreaterThan(good.ease)
  })

  it('interval compounds over multiple good reviews', () => {
    let ease = 2.5
    let interval = 0

    // First review (good)
    let r = computeSm2(4, ease, interval)
    ease = r.ease
    interval = r.intervalDays
    expect(interval).toBe(1)

    // Second review (good) — interval 1 -> 6
    r = computeSm2(4, ease, interval)
    ease = r.ease
    interval = r.intervalDays
    expect(interval).toBe(6)

    // Third review (good) — interval 6 * ease ≈ 6 * 2.5 = 15
    r = computeSm2(4, ease, interval)
    ease = r.ease
    interval = r.intervalDays
    expect(interval).toBeGreaterThanOrEqual(12)
  })
})

// ---------------------------------------------------------------------------
// Ease factor edge cases
// ---------------------------------------------------------------------------
describe('ease factor edge cases', () => {
  it('ease never goes below 1.3', () => {
    const result = computeSm2(1, 1.3, 1)
    expect(result.ease).toBeGreaterThanOrEqual(1.3)
  })

  it('ease increases with repeated easy ratings', () => {
    let ease = 2.5
    let interval = 0
    for (let i = 0; i < 5; i++) {
      const r = computeSm2(5, ease, interval)
      ease = r.ease
      interval = r.intervalDays
    }
    expect(ease).toBeGreaterThan(2.5)
  })

  it('ease decreases with repeated again ratings but clamped to 1.3', () => {
    let ease = 2.5
    let interval = 0
    for (let i = 0; i < 10; i++) {
      const r = computeSm2(1, ease, interval)
      ease = r.ease
      interval = r.intervalDays
    }
    expect(ease).toBeCloseTo(1.3, 1)
  })

  it('ease is rounded to 2 decimal places', () => {
    const result = computeSm2(4, 2.5, 0)
    const decimalPlaces = (result.ease.toString().split('.')[1] || '').length
    expect(decimalPlaces).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Interval clamping and edge cases
// ---------------------------------------------------------------------------
describe('interval clamping', () => {
  it('interval never exceeds 365 days', () => {
    const result = computeSm2(5, 3.0, 300)
    expect(result.intervalDays).toBeLessThanOrEqual(365)
  })

  it('interval with easy rating on long interval is capped at 365', () => {
    const result = computeSm2(5, 3.0, 200)
    // ease ~3.0, interval = round(200 * 3.0) = 600, clamped to 365
    expect(result.intervalDays).toBe(365)
  })

  it('interval never goes below 0', () => {
    const result = computeSm2(1, 2.5, 0)
    expect(result.intervalDays).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// Due date formatting
// ---------------------------------------------------------------------------
describe('due date generation', () => {
  it('returns a valid ISO string', () => {
    const result = computeSm2(4, 2.5, 0)
    const date = new Date(result.dueAt)
    expect(date.getTime()).not.toBeNaN()
    expect(result.dueAt).toContain('T')
  })

  it('dueAt for interval=0 is close to current time', () => {
    const result = computeSm2(1, 2.5, 0)
    const due = new Date(result.dueAt).getTime()
    const now = Date.now()
    expect(Math.abs(due - now)).toBeLessThan(2000)
  })

  it('dueAt for interval=1 is ~1 day in the future', () => {
    const result = computeSm2(4, 2.5, 0)
    const due = new Date(result.dueAt).getTime()
    const diffMs = due - Date.now()
    const diffHours = diffMs / 3600000
    expect(diffHours).toBeGreaterThanOrEqual(22)
    expect(diffHours).toBeLessThanOrEqual(26)
  })

  it('dueAt for interval=6 is ~6 days in the future', () => {
    // First good review => interval=1, then second good => interval=6
    const r1 = computeSm2(4, 2.5, 0) // interval=1
    const result = computeSm2(4, r1.ease, 1) // interval=6
    expect(result.intervalDays).toBe(6)
    const due = new Date(result.dueAt).getTime()
    expect(due).toBeGreaterThan(Date.now())
  })
})

// ---------------------------------------------------------------------------
// Input quality clamping
// ---------------------------------------------------------------------------
describe('quality clamping', () => {
  it('clamps quality below 1 to 1', () => {
    const clamped = computeSm2(0, 2.5, 0)
    const normal = computeSm2(1, 2.5, 0)
    expect(clamped.ease).toEqual(normal.ease)
    expect(clamped.intervalDays).toEqual(normal.intervalDays)
  })

  it('clamps quality above 5 to 5', () => {
    const clamped = computeSm2(6, 2.5, 0)
    const normal = computeSm2(5, 2.5, 0)
    expect(clamped.ease).toEqual(normal.ease)
    expect(clamped.intervalDays).toEqual(normal.intervalDays)
  })
})

// ---------------------------------------------------------------------------
// Interval = 1 → 6 spec rule
// ---------------------------------------------------------------------------
describe('interval 1 → 6 transition', () => {
  it('a card with interval=1 that gets good goes to interval=6', () => {
    const result = computeSm2(4, 2.5, 1)
    expect(result.intervalDays).toBe(6)
  })

  it('a card with interval=1 that gets easy goes to interval=6', () => {
    const result = computeSm2(5, 2.5, 1)
    expect(result.intervalDays).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Ease decrease for q < 3: always -0.2
// ---------------------------------------------------------------------------
describe('ease decrease for q<3', () => {
  it('again decreases ease by exactly 0.2', () => {
    const result = computeSm2(1, 3.0, 5)
    expect(result.ease).toBe(2.8)
  })

  it('hard decreases ease by exactly 0.2 (same as again)', () => {
    const result = computeSm2(2, 3.0, 5)
    expect(result.ease).toBe(2.8)
  })

  it('ease clamped to 1.3 min', () => {
    const result = computeSm2(1, 1.35, 5)
    expect(result.ease).toBe(1.3)
  })
})
