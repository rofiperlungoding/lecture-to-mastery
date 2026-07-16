/**
 * SM-2 spacing mapping:
 *   again → quality=1, hard → quality=2, good → quality=4, easy → quality=5
 *
 * If q < 3 (again/hard): interval = 0 (reset), ease = max(1.3, ease - 0.2)
 * If q >= 3 (good/easy):
 *   interval == 0 → 1 day
 *   interval == 1 → 6 days
 *   else → round(interval * ease)
 *   ease = max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
 *   Cap interval at 365 days.
 */

export function computeSm2(
  quality: number,
  currentEase: number,
  currentInterval: number,
): { ease: number; intervalDays: number; dueAt: string } {
  // Clamp quality 1-5
  const q = Math.max(1, Math.min(5, quality))

  let ease: number
  let intervalDays: number

  if (q < 3) {
    // again (1) or hard (2) — reset
    intervalDays = 0
    ease = Math.max(1.3, currentEase - 0.2)
  } else {
    // good (4) or easy (5)
    if (currentInterval === 0) {
      intervalDays = 1
    } else if (currentInterval === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(currentInterval * currentEase)
    }

    // SM-2 ease formula
    ease = currentEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ease = Math.max(1.3, ease)
  }

  intervalDays = Math.min(365, Math.max(0, intervalDays))

  const dueAt = intervalDays === 0
    ? new Date().toISOString()
    : new Date(Date.now() + intervalDays * 86400000).toISOString()

  return { ease: Math.round(ease * 100) / 100, intervalDays, dueAt }
}

export const QUALITY_MAP: Record<string, number> = { again: 1, hard: 2, good: 4, easy: 5 }
export const VALID_RATINGS = ['again', 'hard', 'good', 'easy'] as const
