import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'

type Confidence = 'high' | 'medium' | 'low'

interface ConfidenceBadgeProps {
  confidence: Confidence
  size?: 'sm' | 'md'
}

const CONFIG: Record<Confidence, { label: string; color: string; dotColor: string }> = {
  high: {
    label: 'High confidence',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  medium: {
    label: 'Medium confidence',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  low: {
    label: 'Low confidence',
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    dotColor: 'bg-rose-500',
  },
}

/**
 * A small badge/indicator that shows the confidence level of a RAG answer.
 * Confidence is derived from retrieval quality (chunk similarity, scores, coverage),
 * NOT from the model's self-assessment.
 */
export function ConfidenceBadge({ confidence, size = 'sm' }: ConfidenceBadgeProps) {
  const cfg = CONFIG[confidence]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-caption'
      } ${cfg.color}`}
      title={`Answer confidence: ${confidence}. Based on retrieval quality (chunk similarity scores, not an AI self-rating).`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {cfg.label}
    </span>
  )
}

interface ConfidenceIconProps {
  confidence: Confidence
  className?: string
}

/**
 * A compact icon-only confidence indicator for inline use.
 */
export function ConfidenceIcon({ confidence, className = 'h-4 w-4' }: ConfidenceIconProps) {
  const colorMap: Record<Confidence, string> = {
    high: 'text-emerald-500',
    medium: 'text-amber-500',
    low: 'text-rose-500',
  }

  const Icon = confidence === 'high' ? ShieldCheck
    : confidence === 'medium' ? ShieldAlert
    : ShieldQuestion

  return <Icon className={`${className} ${colorMap[confidence]}`} />
}
