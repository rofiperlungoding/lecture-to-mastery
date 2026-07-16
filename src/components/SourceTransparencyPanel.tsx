import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, FileText } from 'lucide-react'
import { ConfidenceBadge } from './ConfidenceBadge'

export interface SourceTransparencyChunk {
  chunkIndex: number
  snippet: string
  score: number
  documentTitle?: string
  documentId?: string
}

interface SourceTransparencyPanelProps {
  /** Confidence label from the RAG system */
  confidence: 'high' | 'medium' | 'low'
  /** The chunks used to answer, with scores */
  sources: SourceTransparencyChunk[]
  /** Optional callback to open a specific chunk/document */
  onOpenDocument?: (docId: string, chunkIndex: number) => void
  /** Optional suggestion when confidence is low */
  suggestion?: string
}

/**
 * A collapsible "Why this answer" panel that shows:
 * - Confidence badge (retrieval-based, not model self-rating)
 * - Number of chunks used
 * - Each chunk with its relevance score and preview
 * - A gentle suggestion when confidence is low
 *
 * This makes grounding tangible for judges and demo viewers.
 */
export function SourceTransparencyPanel({
  confidence,
  sources,
  onOpenDocument,
  suggestion,
}: SourceTransparencyPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null)

  if (!sources || sources.length === 0) return null

  const avgScore = sources.reduce((s, c) => s + c.score, 0) / sources.length

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-surface-subtle overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="text-footnote font-medium text-text-muted">
            Why this answer
          </span>
          <span className="text-footnote text-text-muted/60">·</span>
          <span className="text-footnote text-text-muted">
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
          <span className="text-footnote text-text-muted/60">·</span>
          <ConfidenceBadge confidence={confidence} />
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          {/* Summary stats */}
          <div className="flex items-center gap-4 text-footnote text-text-muted">
            <span>Avg relevance: <strong className="text-text-secondary">{avgScore.toFixed(2)}</strong></span>
            <span>Best: <strong className="text-text-secondary">{Math.max(...sources.map(s => s.score)).toFixed(2)}</strong></span>
          </div>

          {/* Low confidence suggestion */}
          {confidence === 'low' && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-footnote text-amber-800">
              {suggestion || 'Try rephrasing your question or adding more detail — this answer may not be fully covered by the document.'}
            </div>
          )}

          {/* Source chunks */}
          <div className="space-y-1.5">
            {sources.map((src, i) => {
              const isExpanded = expandedChunk === i
              return (
                <div
                  key={i}
                  className="rounded-md border border-border/50 bg-surface overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedChunk(isExpanded ? null : i)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-medium text-text-muted shrink-0">
                        [{src.chunkIndex}]
                      </span>
                      <span className="text-[11px] text-text-muted truncate">
                        {src.snippet}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Score indicator bar */}
                      <div className="h-1.5 w-12 rounded-full bg-bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            src.score >= 0.7 ? 'bg-emerald-500'
                            : src.score >= 0.4 ? 'bg-amber-500'
                            : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.min(100, src.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-text-muted tabular-nums">
                        {src.score.toFixed(2)}
                      </span>
                      {onOpenDocument && src.documentId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDocument(src.documentId!, src.chunkIndex)
                          }}
                          className="text-text-muted hover:text-brand-500 transition-colors"
                          title="Open source"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/30 px-2.5 py-2">
                      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {src.snippet}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Method note */}
          <p className="text-[10px] text-text-muted/60 italic leading-tight">
            Confidence is derived from retrieval quality (chunk similarity scores, coverage) — not from an AI self-rating.
          </p>
        </div>
      )}
    </div>
  )
}
