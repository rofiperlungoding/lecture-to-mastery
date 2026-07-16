import { useEffect, useState, useRef, type ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'

interface MasteryGrowthProps {
  /** Whether a study session just completed (triggers the animation) */
  justStudied: boolean
  /** The previous mastery value for comparison */
  previousMastery: number | null
  /** The current mastery value */
  currentMastery: number
  children: ReactNode
}

/**
 * MasteryGrowth — wraps mastery content and adds:
 * 1. A subtle accent glow ring animation on the mastery card
 * 2. An encouraging one-line message that fades in/out
 * 3. Resets automatically after the animation completes
 *
 * Triggered when `justStudied` transitions to true.
 * Reduced motion: only shows the message (no glow).
 */
export function MasteryGrowth({
  justStudied,
  previousMastery,
  currentMastery,
  children,
}: MasteryGrowthProps) {
  const [showGlow, setShowGlow] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const prevJustStudied = useRef(justStudied)

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const improvement =
    previousMastery !== null ? currentMastery - previousMastery : null

  const message =
    improvement !== null && improvement > 0
      ? `+${Math.round(improvement)}% mastery — keep going!`
      : 'Great session! Your mastery is growing.'

  useEffect(() => {
    // Detect rising edge of justStudied
    if (justStudied && !prevJustStudied.current) {
      // Step 1: show the message immediately
      setShowMessage(true)

      // Step 2: show the glow after a brief delay (post-render)
      if (!prefersReduced) {
        const glowTimer = setTimeout(() => setShowGlow(true), 50)
        // Step 3: fade glow out
        const glowOffTimer = setTimeout(() => setShowGlow(false), 1200)
        // Step 4: fade message out
        const msgOffTimer = setTimeout(() => setShowMessage(false), 2500)

        return () => {
          clearTimeout(glowTimer)
          clearTimeout(glowOffTimer)
          clearTimeout(msgOffTimer)
        }
      } else {
        const msgOffTimer = setTimeout(() => setShowMessage(false), 2500)
        return () => clearTimeout(msgOffTimer)
      }
    }

    prevJustStudied.current = justStudied
  }, [justStudied, prefersReduced])

  return (
    <div className="relative">
      {/* Accent glow ring */}
      {showGlow && (
        <div
          className="pointer-events-none absolute -inset-2 z-10 rounded-2xl"
          aria-hidden="true"
        >
          <div className="h-full w-full rounded-2xl bg-accent/10 opacity-0 animate-fade-in"
            style={{
              boxShadow: '0 0 30px 10px var(--color-accent-subtle)',
              animationDuration: '0.6s',
              animationFillMode: 'forwards',
            }}
          />
        </div>
      )}

      {children}

      {/* Encouraging message */}
      {showMessage && (
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-10 z-10 flex justify-center"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-label font-medium text-accent backdrop-blur-sm animate-slide-up"
            style={{ animationDuration: '0.4s', animationFillMode: 'both' }}
          >
            <TrendingUp className="h-4 w-4" />
            <span>{message}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MasteryGrowth
