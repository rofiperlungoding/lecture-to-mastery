import { useCallback, useRef } from 'react'

interface PressableHandlers {
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onMouseLeave: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

/**
 * usePressable — spring-back press animation.
 *
 * Attach the returned handlers to any element to get a
 * subtle scale(0.97) on press, springing back on release.
 * Respects prefers-reduced-motion (no-op).
 *
 * Timing: fast (120ms) with spring easing.
 */
export function usePressable(): PressableHandlers {
  const isPressed = useRef(false)

  const prefersReducedMotion = useCallback((): boolean => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const press = useCallback((el: HTMLElement) => {
    if (prefersReducedMotion()) return
    isPressed.current = true
    el.style.transitionProperty = 'transform'
    el.style.transitionDuration = 'var(--dur-fast)'
    el.style.transitionTimingFunction = 'var(--ease-spring)'
    el.style.transform = 'scale(0.97)'
  }, [prefersReducedMotion])

  const release = useCallback((el: HTMLElement) => {
    if (prefersReducedMotion()) return
    isPressed.current = false
    el.style.transitionProperty = 'transform'
    el.style.transitionDuration = 'var(--dur-base)'
    el.style.transitionTimingFunction = 'var(--ease-spring)'
    el.style.transform = ''
  }, [prefersReducedMotion])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    press(e.currentTarget as HTMLElement)
  }, [press])

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    release(e.currentTarget as HTMLElement)
  }, [release])

  const onMouseLeave = useCallback((e: React.MouseEvent) => {
    if (isPressed.current) release(e.currentTarget as HTMLElement)
  }, [release])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    press(e.currentTarget as HTMLElement)
  }, [press])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    release(e.currentTarget as HTMLElement)
  }, [release])

  return { onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd }
}
export default usePressable
