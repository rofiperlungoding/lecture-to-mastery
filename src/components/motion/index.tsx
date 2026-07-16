import type { ReactNode } from 'react'

interface MotionProps {
  children: ReactNode
  className?: string
  /** Duration token: fast | base | slow. Default: base */
  duration?: 'fast' | 'base' | 'slow'
  /** Delay in ms before animation starts. Default: 0 */
  delay?: number
  as?: 'div' | 'span'
}

const durMap = { fast: 'var(--dur-fast)', base: 'var(--dur-base)', slow: 'var(--dur-slow)' }

/**
 * FadeIn — fade in with a slight translateY(4px) → translateY(0).
 *
 * Usage: <FadeIn delay={150}><Card>...</Card></FadeIn>
 *
 * Timing: base (220ms) with standard easing.
 * Respects prefers-reduced-motion (instant appear).
 */
export function FadeIn({
  children,
  className = '',
  duration = 'base',
  delay = 0,
  as: Tag = 'div',
}: MotionProps) {
  return (
    <Tag
      className={`animate-fade-in ${className}`}
      style={{
        animationDuration: durMap[duration],
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </Tag>
  )
}

/**
 * ScaleIn — scale(0.95) → scale(1) + fade in.
 *
 * For dialog/sheet entrances.
 * Timing: slow (360ms) with spring easing.
 */
export function ScaleIn({
  children,
  className = '',
  duration = 'slow',
  delay = 0,
  as: Tag = 'div',
}: MotionProps) {
  return (
    <Tag
      className={`animate-scale-in ${className}`}
      style={{
        animationDuration: durMap[duration],
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </Tag>
  )
}

/**
 * SlideUp — translateY(16px) → translateY(0) + fade in.
 *
 * For sheets, panels, bottom drawers.
 * Timing: slow (360ms) with spring easing.
 */
export function SlideUp({
  children,
  className = '',
  duration = 'slow',
  delay = 0,
  as: Tag = 'div',
}: MotionProps) {
  return (
    <Tag
      className={`animate-slide-up ${className}`}
      style={{
        animationDuration: durMap[duration],
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </Tag>
  )
}

/**
 * Stagger — wraps a list of children in a container; each child
 * fades+slides in sequentially with the given staggerDelay.
 *
 * Usage:
 *   <Stagger staggerDelay={80}>
 *     {items.map(item => <div key={item.id}>...</div>)}
 *   </Stagger>
 */
export function Stagger({
  children,
  staggerDelay = 80,
  duration = 'base',
  className = '',
}: {
  children: ReactNode
  staggerDelay?: number
  duration?: 'fast' | 'base' | 'slow'
  className?: string
}) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <FadeIn key={i} duration={duration} delay={i * staggerDelay}>
              {child}
            </FadeIn>
          ))
        : <FadeIn duration={duration}>{children}</FadeIn>}
    </div>
  )
}
