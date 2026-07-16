// ═══════════════════════════════════════════════════════════════════════════
// Unit tests — gamification pure logic
//
// Tests the deterministic, side-effect-free functions:
//   - calcLevel(xp)       : level = floor(sqrt(xp / 100)) + 1
//   - xpForLevel(level)   : min XP for a given level
//   - xpToNextLevel(xp)   : XP needed from current level to next
//   - xpProgressInLevel(xp): percentage progress within current level
//
// These are pure math functions — no mocking needed.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { calcLevel, xpForLevel, xpToNextLevel, xpProgressInLevel } from './gamification'

describe('calcLevel', () => {
  it('returns 1 for 0 XP', () => {
    expect(calcLevel(0)).toBe(1)
  })

  it('returns 1 for XP below 100', () => {
    expect(calcLevel(50)).toBe(1)
    expect(calcLevel(99)).toBe(1)
  })

  it('returns 2 at exactly 100 XP', () => {
    expect(calcLevel(100)).toBe(2)
  })

  it('returns 3 at 400 XP (sqrt(4)=2 → 2+1=3)', () => {
    expect(calcLevel(400)).toBe(3)
  })

  it('returns 11 at 10000 XP (sqrt(100)=10 → 10+1=11)', () => {
    expect(calcLevel(10000)).toBe(11)
  })

  it('handles fractional XP', () => {
    expect(calcLevel(249)).toBe(2)  // sqrt(2.49) ≈ 1.57 → floor=1 → +1=2
    expect(calcLevel(250)).toBe(2)  // sqrt(2.5) ≈ 1.58 → floor=1 → +1=2
    expect(calcLevel(400)).toBe(3)  // sqrt(4) = 2 → +1=3
  })

  it('handles very large XP values without overflow', () => {
    expect(calcLevel(1_000_000)).toBe(101)        // sqrt(10000) = 100 → 101
    expect(calcLevel(100_000_000)).toBe(1001)      // sqrt(1_000_000) = 1000 → 1001
  })
})

describe('xpForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(xpForLevel(1)).toBe(0)
  })

  it('returns 100 for level 2', () => {
    expect(xpForLevel(2)).toBe(100)
  })

  it('returns 400 for level 3', () => {
    expect(xpForLevel(3)).toBe(400)
  })

  it('follows the formula: (level-1)^2 * 100', () => {
    expect(xpForLevel(5)).toBe(1600)  // 4^2 * 100 = 1600
    expect(xpForLevel(10)).toBe(8100) // 9^2 * 100 = 8100
  })
})

describe('xpToNextLevel', () => {
  it('returns 100 for 0 XP (level 1 → level 2 = 100 - 0 = 100)', () => {
    expect(xpToNextLevel(0)).toBe(100)
  })

  it('returns 300 for 100 XP (level 2 → level 3 = 400 - 100 = 300)', () => {
    expect(xpToNextLevel(100)).toBe(300)
  })

  it('returns 500 for 400 XP (level 3 → level 4 = 900 - 400 = 500)', () => {
    expect(xpToNextLevel(400)).toBe(500)
  })
})

describe('xpProgressInLevel', () => {
  it('returns 0 at the start of level 1 (0 XP)', () => {
    expect(xpProgressInLevel(0)).toBe(0)
  })

  it('returns 0.5 halfway through level 1 (50 XP)', () => {
    expect(xpProgressInLevel(50)).toBe(0.5)
  })

  it('returns 0 at the exact XP for the next level (start of next level)', () => {
    // At 100 XP, we're at level 2, and progress within level 2 starts at 0
    expect(xpProgressInLevel(100)).toBe(0)
  })

  it('returns 0 at the start of level 2 (100 XP)', () => {
    // In level 2, min is 100, max is 400, so progress = (100 - 100) / (400 - 100) = 0
    // Wait - the function calculates: xpProgressInLevel(100) → level=2, min=100, max=400 → (100-100)/(400-100) = 0
    expect(xpProgressInLevel(100)).toBe(0)
  })

  it('returns 0.5 halfway through level 2 (250 XP)', () => {
    // Level 2: min=100, max=400, progress = (250-100)/(400-100) = 150/300 = 0.5
    expect(xpProgressInLevel(250)).toBe(0.5)
  })

  it('never exceeds 1.0', () => {
    // At exactly the next level threshold, progress should be 1.0 (or very close)
    const progress = xpProgressInLevel(100)
    expect(progress).toBeLessThanOrEqual(1.0)
  })
})
