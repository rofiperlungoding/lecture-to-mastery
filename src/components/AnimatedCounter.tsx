import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  /** The target value to animate to */
  value: number
  /** Duration in ms. Default: 400 */
  duration?: number
  /** Format function. Default: displays raw number */
  format?: (value: number) => string
  className?: string
}

/**
 * AnimatedCounter — smoothly animates numeric value changes.
 *
 * - Eases from previous value → new value over `duration` ms
 * - Uses `requestAnimationFrame` with standard easing curve
 * - Respects `prefers-reduced-motion` (instant set, no animation)
 * - Renders into a `<span>` for inline use
 *
 * Usage:
 *   <AnimatedCounter value={streak} format={(v) => `${v} days`} />
 */
export function AnimatedCounter({
  value,
  duration = 400,
  format = (v) => String(v),
  className = '',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  // Check for reduced motion preference
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const prevValue = prevValueRef.current
    prevValueRef.current = value

    // If value hasn't changed, or reduced motion, set instantly
    if (prevValue === value || prefersReduced) {
      setDisplayValue(value)
      return
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const startTime = performance.now()
    const startValue = prevValue
    const delta = value - startValue

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Standard ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3)

      setDisplayValue(startValue + delta * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration, prefersReduced])

  return (
    <span className={className} aria-live="polite" aria-atomic="true">
      {format(displayValue)}
    </span>
  )
}

export default AnimatedCounter
