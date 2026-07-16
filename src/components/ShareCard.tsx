import { forwardRef, type ReactNode } from 'react'
import { GraduationCap, Flame, Zap } from 'lucide-react'
import type { ShareAspectRatio } from '../hooks/useShareImage'

// ── Types ─────────────────────────────────────────────────────────

export type ShareCardType = 'mastery' | 'quiz' | 'streak'

interface ShareCardBaseProps {
  type: ShareCardType
  /** Large primary value to display (e.g. 82 for 82% mastery) */
  value: number
  /** Optional secondary value (e.g. "5/7" for quiz score) */
  secondaryValue?: string
  /** Document title or achievement context */
  title: string
  /** Optional subtitle (e.g. "Keep going!" or "Great job!") */
  subtitle?: string
  /** Aspect ratio: square (1:1) or story (9:16). Default: square */
  aspectRatio?: ShareAspectRatio
  className?: string
}

// ── Config per card type ──────────────────────────────────────────

interface CardTypeConfig {
  icon: ReactNode
  label: string
  accentColor: string
  bgGradient: string
  message: string
}

const typeConfig: Record<ShareCardType, CardTypeConfig> = {
  mastery: {
    icon: <Zap className="h-5 w-5" />,
    label: 'Mastery Score',
    accentColor: 'text-brand-500',
    bgGradient: 'from-brand-50 via-white to-brand-50/30',
    message: 'of the material mastered',
  },
  quiz: {
    icon: <GraduationCap className="h-5 w-5" />,
    label: 'Quiz Score',
    accentColor: 'text-emerald-500',
    bgGradient: 'from-emerald-50 via-white to-emerald-50/30',
    message: 'correct on this quiz',
  },
  streak: {
    icon: <Flame className="h-5 w-5" />,
    label: 'Study Streak',
    accentColor: 'text-amber-500',
    bgGradient: 'from-amber-50 via-white to-amber-50/30',
    message: 'consecutive days studied',
  },
}

// ── Value color helpers ───────────────────────────────────────────

function valueColor(type: ShareCardType, value: number): string {
  if (type === 'streak') return 'text-amber-500'
  if (value >= 80) return 'text-emerald-500'
  if (value >= 50) return 'text-brand-500'
  return 'text-amber-500'
}

function valueBgColor(type: ShareCardType, value: number): string {
  if (type === 'streak') return 'bg-amber-50'
  if (value >= 80) return 'bg-emerald-50'
  if (value >= 50) return 'bg-brand-50'
  return 'bg-amber-50'
}

// ── Progress ring (SVG) ───────────────────────────────────────────

function ProgressRing({
  value,
  size = 140,
  strokeWidth = 10,
  color,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - value / 100)
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#E9EBEE"
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
      />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────

/**
 * ShareCard — an on-brand, screenshot-worthy card that renders in square
 * or story aspect ratio. Designed to be captured as a PNG via html-to-image.
 *
 * Use the `cardRef` from `useShareImage()` to capture this card.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardBaseProps>(
  function ShareCard(
    {
      type,
      value,
      secondaryValue,
      title,
      subtitle,
      aspectRatio = 'square',
      className = '',
    },
    ref,
  ) {
    const config = typeConfig[type]
    const isStory = aspectRatio === 'story'
    const color = valueColor(type, value)
    const bgColor = valueBgColor(type, value)

    return (
      <div
        ref={ref}
        className={[
          'relative flex flex-col overflow-hidden rounded-2xl',
          'bg-surface shadow-2xl',
          isStory ? 'w-[600px] h-[1067px] p-10' : 'w-[600px] h-[600px] p-8',
          className,
        ].join(' ')}
        style={{
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Background gradient */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${config.bgGradient}`}
        />

        {/* Subtle decorative circles */}
        <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-brand-500/5" />
        <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-brand-500/5" />

        {/* Content container — z-index above decorative elements */}
        <div className="relative z-10 flex flex-1 flex-col">
          {/* Header: Wordmark */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-900 leading-tight">
                Lecture-to-Mastery
              </p>
              <p className="text-small text-gray-500 leading-tight">
                Study smarter
              </p>
            </div>
          </div>

          {/* Card type label */}
          <div className={`mt-${isStory ? '8' : '6'} flex items-center gap-2`}>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bgColor}`}>
              <span className={color}>{config.icon}</span>
            </div>
            <span className="text-small font-semibold uppercase tracking-wider text-gray-400">
              {config.label}
            </span>
          </div>

          {/* Main value area */}
          <div className={`flex flex-1 flex-col items-center justify-center ${isStory ? 'gap-4' : 'gap-3'}`}>
            {/* Large value */}
            <div className="flex items-baseline gap-2">
              {type === 'mastery' ? (
                /* Progress ring for mastery */
                <div className="relative flex items-center justify-center">
                  <ProgressRing value={value} size={isStory ? 180 : 140} strokeWidth={isStory ? 12 : 10} color={color} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-5xl font-bold tabular-nums leading-none ${color}`}>
                      {Math.round(value)}
                      <span className="text-2xl font-normal text-gray-400">%</span>
                    </span>
                  </div>
                </div>
              ) : type === 'quiz' ? (
                /* Large number + optional secondary */
                <div className="text-center">
                  <span className={`text-7xl font-bold tabular-nums leading-none ${color}`}>
                    {secondaryValue ?? Math.round(value)}
                  </span>
                  {secondaryValue && (
                    <span className="ml-2 text-3xl font-normal text-gray-400">
                      correct
                    </span>
                  )}
                </div>
              ) : (
                /* Streak: flame + days */
                <div className="flex items-center gap-4">
                  <Flame className={`h-16 w-16 ${color}`} />
                  <span className={`text-7xl font-bold tabular-nums leading-none ${color}`}>
                    {value}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            <p className="text-center text-lg text-gray-500 leading-snug max-w-xs">
              {type === 'streak'
                ? config.message
                : `${Math.round(value)}% ${config.message}`}
            </p>
          </div>

          {/* Footer: Document title + date */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-800 truncate">
                  {title}
                </p>
                {subtitle && (
                  <p className="text-small text-gray-400 mt-0.5">{subtitle}</p>
                )}
              </div>
              <span className="shrink-0 text-small text-gray-400 tabular-nums ml-4">
                {new Date().toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

export default ShareCard
