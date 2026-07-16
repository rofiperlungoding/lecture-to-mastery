import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function masteryColor(pct: number): string {
  if (pct >= 80) return 'var(--color-mastery-high, #10B981)'
  if (pct >= 50) return 'var(--color-mastery-mid, #8B5CF6)'
  return 'var(--color-mastery-low, #F97316)'
}

// ─────────────────────────────────────────────────────────────────────────────
// MasteryRing — animated circular progress ring
// Fitness-style: rounded caps, gradient color, center %, animate-on-mount + change
// ─────────────────────────────────────────────────────────────────────────────

interface MasteryRingProps {
  /** Mastery percentage 0–100 */
  value: number
  /** Ring size in px. Default: 120 */
  size?: number
  /** Stroke width in px. Default: 8 */
  strokeWidth?: number
  className?: string
  /** Show center label. Default: true */
  showLabel?: boolean
}

export function MasteryRing({
  value,
  size = 120,
  strokeWidth = 8,
  className = '',
  showLabel = true,
}: MasteryRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const color = masteryColor(value)
  const reduced = prefersReducedMotion()

  // Animate offset from full → target
  const [offset, setOffset] = useState(reduced ? circumference * (1 - value / 100) : circumference)

  useEffect(() => {
    if (reduced) {
      setOffset(circumference * (1 - value / 100))
      return
    }

    // Small delay so the mount animation isn't skipped
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOffset(circumference * (1 - value / 100))
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [value, circumference, reduced])

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`Mastery: ${value}%`}
        role="img"
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-bg-muted, #E9EBEE)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: reduced ? 'none' : 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </svg>

      {/* Center label */}
      {showLabel && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span
            className="tabular-nums leading-none"
            style={{ fontSize: 'var(--fs-title-2)', fontWeight: 'var(--fw-title-2)' }}
          >
            {Math.round(value)}
            <span
              className="text-text-tertiary"
              style={{ fontSize: 'var(--fs-footnote)', fontWeight: 'var(--fw-footnote)' }}
            >%
            </span>
          </span>
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConceptBar — hairline mastery bar with label + attempts
// Sorted ascending by mastery (weakest first)
// ─────────────────────────────────────────────────────────────────────────────

interface ConceptBarData {
  concept: string
  masteryPct: number
  attempts: number
}

interface ConceptBarProps {
  concepts: ConceptBarData[]
  className?: string
}

export function ConceptBars({ concepts, className = '' }: ConceptBarProps) {
  // Sort ascending — weakest concepts first
  const sorted = [...concepts].sort((a, b) => a.masteryPct - b.masteryPct)
  const reduced = prefersReducedMotion()

  return (
    <div className={`space-y-2 ${className}`}>
      {sorted.map((c) => {
        const color = masteryColor(c.masteryPct)
        return (
          <ConceptBarRow
            key={c.concept}
            concept={c.concept}
            masteryPct={c.masteryPct}
            attempts={c.attempts}
            color={color}
            animate={!reduced}
          />
        )
      })}
    </div>
  )
}

function ConceptBarRow({
  concept,
  masteryPct,
  attempts,
  color,
  animate,
}: ConceptBarData & { color: string; animate: boolean }) {
  const [width, setWidth] = useState(animate ? 0 : masteryPct)

  useEffect(() => {
    if (!animate) {
      setWidth(masteryPct)
      return
    }
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setWidth(masteryPct))
    })
    return () => cancelAnimationFrame(raf)
  }, [masteryPct, animate])

  return (
    <div className="group rounded-lg border border-border-hairline bg-surface px-4 py-3 transition-colors duration-150 hover:bg-surface-subtle">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-label font-medium text-text">
          {concept}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-caption text-text-muted tabular-nums">
            {attempts} attempt{attempts !== 1 ? 's' : ''}
          </span>
          <span
            className="text-label font-bold tabular-nums"
            style={{ color }}
          >
            {masteryPct}%
          </span>
        </div>
      </div>
      {/* Hairline track */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${width}%`,
            backgroundColor: color,
            transition: animate ? 'width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
          }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QuizSparkline — hand-rolled SVG sparkline with area gradient fill
// ─────────────────────────────────────────────────────────────────────────────

interface QuizAttemptSummary {
  score: number
  total: number
  pct: number
  createdAt?: string
}

interface QuizSparklineProps {
  data: QuizAttemptSummary[]
  className?: string
  /** Chart width. Default: 120 */
  width?: number
  /** Chart height. Default: 40 */
  height?: number
}

export function QuizSparkline({
  data,
  className = '',
  width = 120,
  height = 40,
}: QuizSparklineProps) {
  const padding = 4
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  if (data.length === 0) return null

  // Single data point: render a dot
  if (data.length === 1) {
    const pct = data[0].pct
    const color = masteryColor(pct)
    const x = width / 2
    const y = height - padding - (pct / 100) * chartHeight

    return (
      <svg
        className={className}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        aria-label={`Quiz score: ${Math.round(pct)}%`}
        role="img"
      >
        {/* Dot */}
        <circle cx={x} cy={y} r={5} fill={color} stroke="white" strokeWidth={2} />
        {/* Soft glow */}
        <circle cx={x} cy={y} r={9} fill={color} opacity={0.15} />
      </svg>
    )
  }

  // Multiple points: line + area gradient
  const maxPct = Math.max(...data.map((d) => d.pct), 50)
  const minPct = Math.min(...data.map((d) => d.pct), 0)
  const range = Math.max(maxPct - minPct, 20)

  const xStep = chartWidth / (data.length - 1)

  const points = data.map((d, i) => ({
    x: padding + i * xStep,
    y: height - padding - ((d.pct - minPct) / range) * chartHeight,
    pct: d.pct,
  }))

  const lastPoint = points[points.length - 1]
  const color = masteryColor(lastPoint.pct)

  // Build lines
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ')

  // Build area polygon: line → bottom-right → bottom-left
  const areaPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height - padding}`,
    `${points[0].x},${height - padding}`,
  ].join(' ')

  // Unique gradient ID per instance
  const gradientId = nextGradientId()

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-label={`Quiz trend: ${data.length} attempts`}
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />

      {/* Line */}
      <polyline
        points={linePoints}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data dots */}
      {points.map((p, i) => {
        const isLast = i === points.length - 1
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isLast ? 4 : 2}
            fill={isLast ? color : 'var(--color-surface, #FCFCFD)'}
            stroke={isLast ? 'white' : color}
            strokeWidth={isLast ? 2 : 1}
            className={isLast ? '' : 'stroke-[1.5]'}
          />
        )
      })}
    </svg>
  )
}

// ─── Unique ID for SVG gradient defs ───
let gradientCounter = 0
function nextGradientId(): string {
  return `sparkline-grad-${++gradientCounter}`
}

export default MasteryRing
