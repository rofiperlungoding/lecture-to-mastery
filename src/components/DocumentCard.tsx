import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Target, RotateCcw, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocShape {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
}

interface DocumentCardProps {
  doc: DocShape;
  /** Number of due flashcards (shown as warning badge) */
  dueCount?: number;
  /** Mastery percentage 0–100 (shown as progress bar) */
  mastery?: number;
  /** Number of weak-spot concepts identified */
  weakSpotsCount?: number;
  /** Number of at-risk retention concepts */
  atRiskCount?: number;
  /** Whether a targeted-generation request is in flight */
  studyingWeak?: boolean;
  /** Whether a reindex request is in flight */
  isReindexing?: boolean;
  /** Whether there are failed (unembedded) chunks */
  hasFailedChunks?: boolean;
  /** Fired when user clicks "Study N weak spots" */
  onStudyWeakSpots?: (docId: string, mode: "quiz" | "flashcards") => void;
  /** Fired when user clicks "Re-index" */
  onReindex?: (docId: string) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ value }: { value: number }) {
  const color =
    value >= 80
      ? "bg-mastery-high"
      : value >= 50
        ? "bg-mastery-mid"
        : "bg-mastery-low";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function DocumentIcon() {
  return (
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/20 shadow-xs">
      <svg
        className="h-6 w-6 text-brand-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    </div>
  );
}

function HoverActions({
  onStudy,
  onReindex,
  docId,
}: {
  onStudy?: (docId: string, mode: "quiz" | "flashcards") => void;
  onReindex?: (docId: string) => void;
  docId: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center rounded-xl bg-gradient-to-t from-black/[0.06] to-transparent p-4 opacity-0 transition-opacity duration-base ease-standard group-hover:opacity-100">
      <div className="flex gap-2">
        {onStudy && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStudy(docId, "quiz");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onStudy?.(docId, "quiz");
              }
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-surface/90 px-3 py-1.5 text-footnote font-medium text-brand-700 shadow-xs backdrop-blur-sm transition-colors hover:bg-surface hover:text-brand-600"
            aria-label="Study weak spots"
          >
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Study
          </span>
        )}
        {onReindex && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onReindex(docId);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onReindex?.(docId);
              }
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-surface/90 px-3 py-1.5 text-footnote font-medium text-text-secondary shadow-xs backdrop-blur-sm transition-colors hover:bg-surface"
            aria-label="Re-index document"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Re-index
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/90 px-3 py-1.5 text-footnote font-medium text-white shadow-xs backdrop-blur-sm transition-colors hover:bg-brand-500">
          Open →
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status chip statusDot
// ---------------------------------------------------------------------------

function StatusChip({
  children,
  variant = "ready",
}: {
  children: ReactNode;
  variant?: "ready" | "warning";
}) {
  const dotColor =
    variant === "ready"
      ? "bg-success"
      : "bg-mastery-low";
  const bg =
    variant === "ready"
      ? "bg-brand-50 dark:bg-brand-950/20 text-brand-700 dark:text-brand-400"
      : "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400";
  return (
    <span
      className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-footnote font-medium ${bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentCard({
  doc,
  dueCount,
  mastery,
  weakSpotsCount,
  atRiskCount,
  studyingWeak,
  isReindexing,
  hasFailedChunks,
  onStudyWeakSpots,
  onReindex,
}: DocumentCardProps) {
  const showActions =
    !!onStudyWeakSpots || !!onReindex || (hasFailedChunks && !!onReindex);

  return (
    <Link
      to="/doc/$docId"
      params={{ docId: doc.id }}
      className="group block"
      data-testid="doc-link"
    >
      <Card
        hoverable
        className="relative flex h-full min-h-[210px] flex-col overflow-hidden"
      >
        {/* Hover-revealed quick actions overlay */}
        {showActions && (
          <HoverActions
            onStudy={onStudyWeakSpots ? (id) => onStudyWeakSpots(id, "quiz") : undefined}
            onReindex={onReindex}
            docId={doc.id}
          />
        )}

        <DocumentIcon />

        {/* Title */}
        <h3 className="text-title-3 text-text line-clamp-2 leading-snug">
          {doc.title}
        </h3>

        {/* Bottom section — pushed down by mt-auto */}
        <div className="mt-auto pt-4 space-y-3">
          {/* Mastery bar (always present to reserve space) */}
          <div className={mastery === undefined ? "invisible" : ""}>
            <div className="mb-1 flex items-center justify-between text-footnote">
              <span className="text-text-secondary">Mastery</span>
              <span
                className={`tabular-nums ${
                  mastery !== undefined
                    ? mastery >= 80
                      ? "text-mastery-high"
                      : mastery >= 50
                        ? "text-mastery-mid"
                        : "text-mastery-low"
                    : "text-text-muted"
                }`}
              >
                {mastery !== undefined ? mastery : "—"}%
              </span>
            </div>
            <ProgressBar value={mastery ?? 0} />
          </div>

          {/* Meta row: source chip, date, status */}
          <div className="flex items-center gap-3">
            <Badge variant="info">{doc.source_type}</Badge>
            <span className="text-footnote text-text-muted">
              {new Date(doc.created_at).toLocaleDateString()}
            </span>

            {dueCount ? (
              <StatusChip variant="warning">{dueCount} due</StatusChip>
            ) : hasFailedChunks ? (
              <StatusChip variant="warning">Failed</StatusChip>
            ) : (
              <StatusChip>Ready</StatusChip>
            )}
          </div>
        </div>

        {/* Weak spots / Re-index buttons */}
        {(weakSpotsCount || hasFailedChunks) && (
          <div className="mt-3 space-y-2">
            {/* At-risk retention badge */}
          {atRiskCount && (
            <div className="flex items-center gap-1.5 rounded-md bg-violet-50 px-3 py-1.5">
              <RefreshCw className="h-3 w-3 text-violet-500" />
              <span className="text-footnote font-medium text-violet-700">
                <span className="tabular-nums">{atRiskCount}</span> refresh soon
              </span>
            </div>
          )}

          {weakSpotsCount && onStudyWeakSpots && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStudyWeakSpots(doc.id, "quiz");
                }}
                disabled={studyingWeak}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-50 px-3 py-1.5 text-footnote font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {studyingWeak ? (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="h-3 w-3 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Target className="h-3 w-3" /> Study{" "}
                    <span className="tabular-nums">{weakSpotsCount}</span> weak
                    spot{weakSpotsCount !== 1 ? "s" : ""}
                  </span>
                )}
              </button>
            )}
            {hasFailedChunks && onReindex && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onReindex(doc.id);
                }}
                disabled={isReindexing}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-footnote font-medium text-amber-700 transition-colors duration-150 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isReindexing ? (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="h-3 w-3 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Re-indexing...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="h-3 w-3" />
                    Re-index
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

export default DocumentCard;
