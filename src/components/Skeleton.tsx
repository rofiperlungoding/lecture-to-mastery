import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Base — shimmer-enabled skeleton block
// ---------------------------------------------------------------------------

interface SkeletonBaseProps {
  className?: string
}

/**
 * Base skeleton block with directional shimmer animation.
 * On `prefers-reduced-motion`, shimmer collapses to a static tint.
 */
export function Skeleton({ className = '' }: SkeletonBaseProps) {
  return (
    <div
      className={`skeleton-shimmer rounded-md ${className}`}
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// Stat Card — matches StatCard layout: icon (40×40) + label + value
// ---------------------------------------------------------------------------

export function SkeletonStatCard({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`} aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Document Card — matches DocumentCard layout:
// icon (48×48) + title + mastery bar + meta row
// ---------------------------------------------------------------------------

export function SkeletonDocumentCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex h-full min-h-[210px] flex-col rounded-xl border border-border-hairline bg-surface p-5 shadow-xs ${className}`}
      aria-hidden="true"
    >
      {/* Document icon */}
      <Skeleton className="mb-4 h-12 w-12 rounded-lg" />

      {/* Title — 2 lines */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Spacer */}
      <div className="mt-auto pt-4 space-y-3">
        {/* Mastery bar area */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary Block — mirrors the SummaryPanel structure:
// mode selector pills + TL;DR + key points + key terms grid
// ---------------------------------------------------------------------------

export function SkeletonSummaryBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className}`} aria-hidden="true">
      {/* Mode selector pills */}
      <div className="flex gap-1 rounded-lg bg-surface p-0.5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 flex-1 rounded-md" />
        ))}
      </div>

      {/* TL;DR block */}
      <div className="relative overflow-hidden rounded-xl bg-brand-50/50 p-5">
        <div className="absolute left-0 top-0 h-full w-1 skeleton-shimmer" />
        <Skeleton className="mb-2 h-4 w-16" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>

      {/* Key points */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="mt-1 h-4 w-4 rounded-full shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>

      {/* Key terms grid */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border-hairline bg-surface p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quiz Question — matches QuizPanel question layout:
// progress bar + question text + 4 option buttons
// ---------------------------------------------------------------------------

export function SkeletonQuizQuestion({ className = '' }: { className?: string }) {
  return (
    <div className={`mx-auto max-w-reading-panel space-y-5 ${className}`} aria-hidden="true">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-3 w-12" />
      </div>

      {/* Question */}
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-1/2" />

      {/* Options */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Flashcard Card — matches FlashcardPanel card layout:
// progress + front/back card + 4 rating buttons
// ---------------------------------------------------------------------------

export function SkeletonFlashcard({ className = '' }: { className?: string }) {
  return (
    <div className={`mx-auto max-w-narrow space-y-6 ${className}`} aria-hidden="true">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-2 flex-1 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>

      {/* Card */}
      <Skeleton className="h-[260px] w-full rounded-xl" />

      {/* Rating buttons */}
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity List — matches activity items: icon (32×32) + text + date
// ---------------------------------------------------------------------------

export function SkeletonActivityItem({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 ${className}`} aria-hidden="true">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Concept List — matches mastery panel concept items
// ---------------------------------------------------------------------------

export function SkeletonConceptItem({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border-hairline bg-surface p-4 space-y-2 ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-8" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary skeleton for panel container
// ---------------------------------------------------------------------------

export function SkeletonPanel({ children }: { children: ReactNode }) {
  return (
    <div className="p-6" aria-label="Loading content" role="status">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-brand-500" aria-hidden="true" />
        <span className="text-body text-text-secondary">{children}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generation Progress — staged progress indicator for long-running operations
// Shows a sequence of human-readable stages with animated dots on current.
// ---------------------------------------------------------------------------

interface GenerationStage {
  label: string
  key: string
}

interface GenerationProgressProps {
  stages: GenerationStage[]
  currentStage: string
  className?: string
}

export function GenerationProgress({
  stages,
  currentStage,
  className = '',
}: GenerationProgressProps) {
  const currentIdx = stages.findIndex((s) => s.key === currentStage)

  return (
    <div className={`rounded-lg border border-border-hairline bg-surface p-4 ${className}`} role="status" aria-label="Generating content">
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const isComplete = i < currentIdx
          const isCurrent = i === currentIdx
          const isPending = i > currentIdx

          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3 transition-opacity duration-300 ${
                isPending ? 'opacity-30' : 'opacity-100'
              }`}
            >
              {/* Status indicator */}
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold transition-all duration-300 ${
                  isComplete
                    ? 'bg-brand-500 text-white'
                    : isCurrent
                      ? 'border-2 border-brand-500 bg-brand-50'
                      : 'border-2 border-border bg-surface-muted'
                }`}
              >
                {isComplete ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : isCurrent ? (
                  <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-label transition-colors duration-300 ${
                  isComplete
                    ? 'text-text'
                    : isCurrent
                      ? 'text-text font-medium'
                      : 'text-text-tertiary'
                }`}
              >
                {stage.label}
              </span>

              {/* Spinner on current */}
              {isCurrent && (
                <span className="ml-auto">
                  <span className="flex h-4 w-4 items-center justify-center">
                    <span className="h-3 w-3 animate-spin rounded-full border-[2px] border-brand-500 border-t-transparent" />
                  </span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Skeleton
