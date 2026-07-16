import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";
import {
  IllusDocuments,
  IllusQuiz,
  IllusAllCaughtUp,
  IllusChat,
  IllusActivity,
  IllusSparkle,
} from "./EmptyIllustrations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmptyIllustration =
  | "documents"
  | "quiz"
  | "caught-up"
  | "chat"
  | "activity"
  | "sparkle"
  | "none";

interface EmptyStateProps {
  /** Which spot illustration to show (default: "sparkle") */
  illustration?: EmptyIllustration;
  /** Override the illustration with a custom React node */
  customIllustration?: ReactNode;
  /** Title text — concise, human, encouraging */
  title: string;
  /** One supportive sentence. Keep concise. */
  description?: string;
  /** Single primary action button */
  action?: ReactNode;
  /** Show the brand Wordmark instead of an illustration (for top-level pages) */
  showBrand?: boolean;
  /** Smaller variant for inline empty states (pads less) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Illustration map
// ---------------------------------------------------------------------------

function IllusSwitch({ illustration }: { illustration: EmptyIllustration }) {
  switch (illustration) {
    case "documents":
      return <IllusDocuments />;
    case "quiz":
      return <IllusQuiz />;
    case "caught-up":
      return <IllusAllCaughtUp />;
    case "chat":
      return <IllusChat />;
    case "activity":
      return <IllusActivity />;
    case "sparkle":
      return <IllusSparkle />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmptyState({
  illustration = "sparkle",
  customIllustration,
  title,
  description,
  action,
  showBrand = false,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16"
      } animate-fade-in`}
      style={{ animationDuration: '400ms' }}
    >
      {/* Brand wordmark (for top-level pages like dashboard) */}
      {showBrand && (
        <div className="mb-6 animate-scale-in" style={{ animationDuration: '400ms' }}>
          <Wordmark size="md" showTagline />
        </div>
      )}

      {/* Custom illustration or default */}
      {!showBrand && (customIllustration || illustration !== "none") && (
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/10 to-brand-500/5 transition-transform duration-300 hover:scale-110 group">
          <div className="transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
            {customIllustration || <IllusSwitch illustration={illustration} />}
          </div>
        </div>
      )}

      {/* Title */}
      <h3 className="text-title-3 text-text text-balance animate-stagger-enter" style={{ animationDelay: '60ms' }}>{title}</h3>

      {/* Description */}
      {description && (
        <p className="mt-1.5 max-w-sm text-callout text-text-secondary text-pretty animate-stagger-enter" style={{ animationDelay: '120ms' }}>
          {description}
        </p>
      )}

      {/* CTA */}
      {action && <div className="mt-6 animate-stagger-enter" style={{ animationDelay: '180ms' }}>{action}</div>}
    </div>
  );
}

export default EmptyState;
