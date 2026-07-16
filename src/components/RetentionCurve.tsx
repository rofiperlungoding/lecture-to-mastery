import { useEffect, useState } from 'react'
import {
  generateRetentionCurve,
  RETENTION_THRESHOLD,
} from '../lib/retention'

// ── Props ───────────────────────────────────────────────────────────────

interface RetentionCurveProps {
  /** Memory stability in hours */
  stabilityHours: number
  /** Days to show on the x-axis (default 30) */
  daysToShow?: number
  /** Days when reviews happened (for showing bumps) */
  reviewDays?: number[]
  /** Width of the SVG in px (default 320) */
  width?: number
  /** Height of the SVG in px (default 140) */
  height?: number
  className?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Component ───────────────────────────────────────────────────────────

export function RetentionCurve({
  stabilityHours,
  daysToShow = 30,
  reviewDays = [],
  width = 320,
  height = 140,
  className = '',
}: RetentionCurveProps) {
  const data = generateRetentionCurve(stabilityHours, daysToShow, reviewDays)
  const reduced = prefersReducedMotion()
  const [animated, setAnimated] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  if (data.length === 0) return null

  // Chart dimensions
  const pad = { top: 16, right: 16, bottom: 28, left: 36 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom

  // Find data bounds
  const maxDay = Math.max(...data.map((d) => d.day), 1)
  const maxProb = 1.0

  // Scales
  const xScale = (day: number) => pad.left + (day / maxDay) * chartW
  const yScale = (prob: number) => pad.top + (1 - prob / maxProb) * chartH

  // Build path
  const safePoints = data.filter((d) => d.probability >= 0.01)
  const pathD = safePoints.length > 1
    ? safePoints.map((d, i) => {
        const x = xScale(d.day)
        const y = yScale(d.probability)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    : ''

  // Area fill path
  const areaD = safePoints.length > 1
    ? pathD
      + ` L${xScale(safePoints[safePoints.length - 1].day)},${pad.top + chartH}`
      + ` L${xScale(safePoints[0].day)},${pad.top + chartH} Z`
    : ''

  // Review bump markers
  const reviewMarkers = data
    .filter((d) => d.isReview)
    .map((d, i) => {
      const x = xScale(d.day)
      return (
        <g key={`review-${i}`}>
          {/* Vertical flash line */}
          <line
            x1={x}
            y1={pad.top}
            x2={x}
            y2={pad.top + chartH}
            stroke="var(--color-brand-300, #93C5FD)"
            strokeWidth={1.5}
            strokeDasharray="3,3"
            opacity={0.6}
          />
          {/* Star icon at review point */}
          <circle
            cx={x}
            cy={yScale(1)}
            r={4}
            fill="var(--color-brand-500, #3B82F6)"
            stroke="white"
            strokeWidth={1.5}
          />
        </g>
      )
    })

  // Threshold line
  const thresholdY = yScale(RETENTION_THRESHOLD)

  // Y-axis ticks (0, 0.25, 0.5, 0.75, 1.0)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0]

  // X-axis ticks (every 7 days)
  const xTicks = []
  for (let d = 0; d <= maxDay; d += 7) {
    xTicks.push(d)
  }

  const gradientId = `retention-grad-${stabilityHours.toString().replace('.', '')}`

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        role="img"
        aria-label={`Retention curve over ${daysToShow} days. Current stability: ${Math.round(stabilityHours)} hours.`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500, #3B82F6)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--color-brand-500, #3B82F6)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = yScale(tick)
          return (
            <g key={`ytick-${tick}`}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + chartW}
                y2={y}
                stroke="var(--color-border-hairline, #E5E7EB)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y + 4}
                textAnchor="end"
                fill="var(--color-text-muted, #9CA3AF)"
                fontSize="10"
                fontFamily="inherit"
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          )
        })}

        {/* X-axis ticks */}
        {xTicks.map((tick) => {
          const x = xScale(tick)
          return (
            <text
              key={`xtick-${tick}`}
              x={x}
              y={pad.top + chartH + 16}
              textAnchor="middle"
              fill="var(--color-text-muted, #9CA3AF)"
              fontSize="10"
              fontFamily="inherit"
            >
              {tick}d
            </text>
          )
        })}

        {/* Threshold line */}
        <line
          x1={pad.left}
          y1={thresholdY}
          x2={pad.left + chartW}
          y2={thresholdY}
          stroke="var(--color-mastery-low, #F97316)"
          strokeWidth={1.5}
          strokeDasharray="4,4"
          opacity={0.7}
        />
        <text
          x={pad.left + chartW + 2}
          y={thresholdY + 4}
          fill="var(--color-mastery-low, #F97316)"
          fontSize="9"
          fontFamily="inherit"
        >
          at risk
        </text>

        {/* Area fill */}
        <path
          d={areaD}
          fill={`url(#${gradientId})`}
          opacity={animated ? 0.8 : 0}
          style={{
            transition: reduced ? 'none' : 'opacity 0.5s ease-out',
          }}
        />

        {/* Review bump markers */}
        {reviewMarkers}

        {/* Decay curve */}
        <path
          d={pathD}
          stroke="var(--color-brand-500, #3B82F6)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={animated ? 1 : 0}
          style={{
            transition: reduced ? 'none' : 'opacity 0.6s ease-out',
          }}
        />

        {/* End dot */}
        {safePoints.length > 0 && (
          <circle
            cx={xScale(safePoints[safePoints.length - 1].day)}
            cy={yScale(safePoints[safePoints.length - 1].probability)}
            r={4}
            fill="var(--color-brand-500, #3B82F6)"
            stroke="white"
            strokeWidth={2}
            opacity={animated ? 1 : 0}
            style={{
              transition: reduced ? 'none' : 'opacity 0.4s ease-out',
            }}
          />
        )}
      </svg>
    </div>
  )
}

// ── Mini Retention dot (compact indicator) ───────────────────────────────

interface RetentionDotProps {
  probability: number
  size?: number
  className?: string
}

/**
 * A tiny colored dot showing recall probability at a glance.
 * Green ≥80%, Yellow ≥60%, Red <60%.
 */
export function RetentionDot({ probability, size = 8, className = '' }: RetentionDotProps) {
  const color =
    probability >= 0.8 ? 'var(--color-mastery-high, #10B981)'
    : probability >= 0.6 ? 'var(--color-mastery-mid, #8B5CF6)'
    : 'var(--color-mastery-low, #F97316)'

  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
      }}
      aria-label={`Retention: ${Math.round(probability * 100)}%`}
      title={`Retention: ${Math.round(probability * 100)}%`}
    />
  )
}

export default RetentionCurve
