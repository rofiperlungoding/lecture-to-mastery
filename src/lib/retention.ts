// ============================================================================
// Retention Model — Ebbinghaus Forgetting Curve
//
// Core formula:  R(t) = exp(-t / S)
//
// Where:
//   R = predicted recall probability (0.0 to 1.0)
//   t = time since last review (in hours)
//   S = memory stability (in hours), derived from SM-2 scheduling:
//         S = interval_days * 24 * ease_multiplier
//       where ease_multiplier = max(0.5, ease / 2.5)
//       (2.5 is the default SM-2 ease; ease below 1.3 is clamped)
//
// This is a documented Ebbinghaus-style model. The predictions are estimates
// and should be labeled as such in the UI. Individual recall varies.
//
// Reference: https://en.wikipedia.org/wiki/Forgetting_curve
//            https://github.com/eshapard/ebbinghaus-forgetting-curve
// ============================================================================

import type { FlashcardItem } from './api'
import type { ConceptMasteryRow } from './api'

// ── Constants ───────────────────────────────────────────────────────────

/** Threshold below which a concept is considered "at risk" of forgetting. */
export const RETENTION_THRESHOLD = 0.6

/** When no SM-2 data exists (e.g. quiz-only concepts), use this base stability in hours. */
export const DEFAULT_STABILITY_HOURS = 24

/** Minimum stability to avoid division-by-zero or unrealistic instant forgetting. */
export const MIN_STABILITY_HOURS = 1

/** Maximum stability cap (10 years) so rare reviews don't produce absurd retentions. */
export const MAX_STABILITY_HOURS = 10 * 365 * 24

// ── Core retention computation ──────────────────────────────────────────

/**
 * Compute the memory stability in hours from SM-2 scheduling parameters.
 *
 * S = interval_days * 24 * (ease / 2.5)
 *
 * ease / 2.5 is a multiplier: ease=2.5 → 1.0×, ease=1.3 → 0.52×, ease=3.0 → 1.2×
 */
export function computeStabilityHours(intervalDays: number, ease: number): number {
  const hours = intervalDays * 24 * Math.max(0.5, ease / 2.5)
  return Math.max(MIN_STABILITY_HOURS, Math.min(hours, MAX_STABILITY_HOURS))
}

/**
 * Compute predicted recall probability R = exp(-t / S).
 *
 * @param hoursSinceReview - time elapsed since the last review (hours)
 * @param stabilityHours   - memory stability (hours), from computeStabilityHours()
 * @returns predicted recall probability 0.0–1.0
 */
export function computeRecallProbability(hoursSinceReview: number, stabilityHours: number): number {
  if (hoursSinceReview <= 0) return 1.0
  if (stabilityHours <= 0) return 0.0
  return Math.exp(-hoursSinceReview / stabilityHours)
}

// ── Per-flashcard retention ─────────────────────────────────────────────

export interface FlashcardRetention {
  id: string
  front: string
  back: string
  recallProbability: number  // 0.0–1.0
  stabilityHours: number
  hoursSinceReview: number
  dueAt: string | null
}

/**
 * Compute predicted retention for a single flashcard.
 */
export function computeFlashcardRetention(
  flashcard: FlashcardItem,
  now: Date = new Date(),
): FlashcardRetention {
  const dueAt = flashcard.due_at ? new Date(flashcard.due_at) : null
  const lastReview = dueAt
    ? new Date(dueAt.getTime() - (flashcard.interval_days || 0) * 86400000)
    : now
  const hoursSince = (now.getTime() - lastReview.getTime()) / 3600000

  const stabilityHours = computeStabilityHours(
    flashcard.interval_days || 0,
    flashcard.ease || 2.5,
  )

  return {
    id: flashcard.id,
    front: flashcard.front || flashcard.question || '',
    back: flashcard.back || flashcard.answer || '',
    recallProbability: computeRecallProbability(hoursSince, stabilityHours),
    stabilityHours,
    hoursSinceReview: Math.max(0, hoursSince),
    dueAt: flashcard.due_at || null,
  }
}

/**
 * Compute predicted retention for a list of flashcards.
 * Returns cards sorted by recall probability ascending (most forgotten first).
 */
export function computeFlashcardRetentions(
  flashcards: FlashcardItem[],
  now: Date = new Date(),
): FlashcardRetention[] {
  return flashcards
    .map((f) => computeFlashcardRetention(f, now))
    .sort((a, b) => a.recallProbability - b.recallProbability)
}

// ── Per-concept retention (aggregated from concepts + flashcards) ────────

export interface ConceptRetention {
  concept: string
  documentId: string
  /** Predicted recall probability 0.0–1.0 */
  recallProbability: number
  /** Memory stability in hours */
  stabilityHours: number
  /** Raw mastery % from concept_mastery (correct/attempts) */
  masteryPct: number
  /** Number of review attempts */
  attempts: number
  /** Hours since last seen */
  hoursSinceLastSeen: number
  /** Whether this concept is at risk (recallProbability < threshold) */
  atRisk: boolean
  /** Whether recall is an estimate (no flashcard data — computed from concept_mastery only) */
  isEstimate: boolean
}

/**
 * Compute per-concept predicted retention.
 *
 * For each concept, we estimate retention from two sources:
 * 1. Flashcards tagged with this concept — average their predicted recall probabilities
 * 2. concept_mastery.last_seen (quiz data) — estimate stability from attempts + correctness
 *
 * If flashcard data exists, it takes precedence. Otherwise, we fall back to a
 * conservative estimate based on concept_mastery data.
 */
export function computeConceptRetentions(
  concepts: ConceptMasteryRow[],
  flashcards: FlashcardItem[] = [],
): ConceptRetention[] {
  const now = new Date()

  // Group flashcards by concept (from back-of-card or front-of-card text)
  const flashcardByConcept = new Map<string, FlashcardRetention[]>()
  for (const fc of flashcards) {
    // Use concept from the card if available, otherwise skip
    // We compute retention per card regardless
    const retention = computeFlashcardRetention(fc, now)
    // Try to extract a concept from the flashcard text (first 40 chars = rough concept)
    // This is a heuristic — concepts may not be tagged on flashcards directly
    const conceptHint = (fc.front || '').slice(0, 40).trim()
    if (conceptHint) {
      const existing = flashcardByConcept.get(conceptHint) || []
      existing.push(retention)
      flashcardByConcept.set(conceptHint, existing)
    }
  }

  const results: ConceptRetention[] = []

  for (const concept of concepts) {
    const masteryPct = concept.masteryPct
    const hoursSince = concept.lastSeen
      ? (now.getTime() - new Date(concept.lastSeen).getTime()) / 3600000
      : 9999 // never seen

    // Estimate stability from concept_mastery data:
    // More attempts → higher stability. Each attempt adds ~24h of stability.
    // Correctness > 70% means stability grows faster.
    const correctionFactor = concept.attempts > 0 && concept.correct / concept.attempts > 0.7
      ? 1.5
      : 1.0
    const stabilityHours = Math.max(
      MIN_STABILITY_HOURS,
      DEFAULT_STABILITY_HOURS * (1 + concept.attempts * 0.5) * correctionFactor,
    )

    const recallProbability = computeRecallProbability(hoursSince, stabilityHours)

    results.push({
      concept: concept.concept,
      documentId: concept.documentId || '',
      recallProbability,
      stabilityHours,
      masteryPct,
      attempts: concept.attempts,
      hoursSinceLastSeen: Math.round(hoursSince),
      atRisk: recallProbability < RETENTION_THRESHOLD,
      isEstimate: true, // computed from concept_mastery, not flashcard SM-2
    })
  }

  // If a concept has flashcard data, override with flashcard-based retention
  for (const [conceptText, fcRetentions] of flashcardByConcept) {
    const avgFlashcardRetention =
      fcRetentions.reduce((sum, r) => sum + r.recallProbability, 0) / fcRetentions.length

    const existing = results.find((r) => r.concept === conceptText)
    if (existing) {
      existing.recallProbability = avgFlashcardRetention
      existing.atRisk = avgFlashcardRetention < RETENTION_THRESHOLD
      existing.isEstimate = false
    }
  }

  return results.sort((a, b) => a.recallProbability - b.recallProbability)
}

// ── Retention curve data generation (for visualization) ─────────────────

export interface RetentionCurvePoint {
  /** Days since review (for display) */
  day: number
  /** Predicted recall probability */
  probability: number
  /** Whether this is a "review bump" (a review happened here) */
  isReview: boolean
  /** Label for review bumps (e.g. "Good", "Easy") */
  reviewLabel?: string
}

/**
 * Generate data points for a retention-over-time curve, given current stability.
 *
 * Shows the exponential decay from day 0 to day N (default 30), with optional
 * review bumps that reset the curve.
 */
export function generateRetentionCurve(
  stabilityHours: number,
  daysToShow: number = 30,
  reviewDays: number[] = [],
): RetentionCurvePoint[] {
  const points: RetentionCurvePoint[] = []
  // Generate a point every 0.5 days for smooth curve
  const totalPoints = daysToShow * 2

  // Simulate: start with a review at day 0
  let currentStability = stabilityHours
  let lastReviewDay = 0

  // Sort review days and interleave
  const sortedReviews = [...reviewDays].sort((a, b) => a - b)
  let reviewIdx = 0

  for (let i = 0; i <= totalPoints; i++) {
    const day = i / 2

    // Check if we hit a review day (allow some tolerance)
    while (reviewIdx < sortedReviews.length && Math.abs(sortedReviews[reviewIdx] - day) < 0.3) {
      // Review resets stability
      currentStability = stabilityHours * (1 + reviewIdx * 0.3) // each review increases stability
      lastReviewDay = day
      points.push({
        day: Math.round(day * 10) / 10,
        probability: 1.0,
        isReview: true,
        reviewLabel: 'Reviewed',
      })
      reviewIdx++
      continue
    }

    const hoursSince = (day - lastReviewDay) * 24
    const probability = computeRecallProbability(Math.max(0, hoursSince), currentStability)

    points.push({
      day: Math.round(day * 10) / 10,
      probability: Math.round(probability * 100) / 100,
      isReview: false,
    })
  }

  return points
}

// ── Fallback: "I don't know" for concepts with no data ───────────────────

/** Empty retention result for documents/concepts with no study history. */
export function emptyConceptRetention(): ConceptRetention {
  return {
    concept: 'No data',
    documentId: '',
    recallProbability: 0,
    stabilityHours: 0,
    masteryPct: 0,
    attempts: 0,
    hoursSinceLastSeen: 0,
    atRisk: false,
    isEstimate: true,
  }
}

// ============================================================================
// Model documentation
// ============================================================================
/**
 * MODEL ASSUMPTIONS & LIMITATIONS
 *
 * 1. The forgetting curve follows R(t) = exp(-t/S), which is a simplified
 *    Ebbinghaus model. Real memory decay is more complex, but this is a
 *    well-established approximation used in spaced repetition systems.
 *
 * 2. Memory stability S is derived from SM-2 scheduling parameters:
 *    - interval_days (the current review interval from SM-2)
 *    - ease (the SM-2 ease factor, default 2.5)
 *    - estimate: S = interval_days * 24 * (ease / 2.5)
 *
 * 3. For quiz-only concepts (no flashcards), stability is estimated
 *    conservatively from concept_mastery.attempts:
 *    - Each attempt adds ~12h of stability
 *    - High correctness (>70%) multiplies stability by 1.5×
 *
 * 4. These are ESTIMATES. Individual recall varies based on:
 *    - Sleep quality, attention during study, prior knowledge
 *    - Interference from similar material
 *    - Emotional state and testing conditions
 *
 * 5. The 60% threshold for "at risk" is a standard heuristic. Below 60%,
 *    the chance of forgetting the concept in a test scenario increases
 *    significantly.
 *
 * 6. Concept tagging on flashcards is heuristic (extracted from front text).
 *    This may miss some concepts. The fallback uses concept_mastery data.
 */
