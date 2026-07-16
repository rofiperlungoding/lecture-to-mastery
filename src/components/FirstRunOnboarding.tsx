import { useState } from "react";
import { Button } from "./Button";
import { X, Upload, BookOpen, Zap, Sparkles, GraduationCap } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed";

const steps = [
  {
    icon: Upload,
    label: "Upload",
    description: "Add a lecture PDF, paste your notes, or try the demo.",
    gradient: "from-brand-500/10 to-brand-500/5",
    border: "border-brand-500/20",
    accent: "text-brand-500",
  },
  {
    icon: BookOpen,
    label: "Study",
    description: "Get an AI summary, generate flashcards, and take practice quizzes.",
    gradient: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
    accent: "text-violet-500",
  },
  {
    icon: Zap,
    label: "Master",
    description: "Review what's due, track your mastery, and fill knowledge gaps.",
    gradient: "from-amber-500/10 to-amber-500/5",
    border: "border-amber-500/20",
    accent: "text-amber-500",
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useOnboardingDismissed() {
  const [dismissed, setDismissedState] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissedState(true);
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    } catch { /* noop */ }
  };

  return { dismissed, dismiss };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FirstRunOnboardingProps {
  onLoadDemo: () => void;
  onAddDocument: () => void;
  demoLoading?: boolean;
  demoPhase?: string;
}

export function FirstRunOnboarding({
  onLoadDemo,
  onAddDocument,
  demoLoading = false,
  demoPhase = "idle",
}: FirstRunOnboardingProps) {
  const { dismissed, dismiss } = useOnboardingDismissed();
  const [visible, setVisible] = useState(true);

  if (dismissed || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
  };

  const handleDismissForever = () => {
    dismiss();
    setVisible(false);
  };

  return (
    <div className="relative mb-8 overflow-hidden rounded-xl border border-border bg-surface shadow-sm ring-1 ring-black/5">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-500/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/5 blur-3xl" />

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
        aria-label="Dismiss onboarding"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6 max-w-lg">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-xs">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
              Welcome
            </span>
          </div>
          <h2 className="text-title-2 text-text text-balance">
            Ready to study smarter?
          </h2>
          <p className="mt-1.5 text-callout text-text-secondary leading-relaxed">
            Upload a lecture or document, and Lecture-to-Mastery will transform it into 
            structured summaries, flashcards, quizzes, and interactive study tools.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.label}
              className={`rounded-lg border ${step.border} bg-gradient-to-br ${step.gradient} p-4 transition-all duration-200 hover:shadow-sm`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-text ${step.accent}`}>
                <step.icon className="h-4 w-4" />
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-caption font-semibold text-text-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-label font-semibold text-text">{step.label}</h3>
                </div>
                <p className="mt-1 text-small text-text-tertiary leading-snug text-pretty">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onLoadDemo}
            isLoading={demoLoading}
            disabled={demoLoading}
            leadingIcon={!demoLoading ? <Sparkles className="h-4 w-4" /> : undefined}
          >
            {demoLoading && demoPhase === "saving"
              ? "Saving..."
              : demoLoading && demoPhase === "indexing"
                ? "Indexing..."
                : demoPhase === "done"
                  ? "Done!"
                  : "Load Demo"}
          </Button>
          <Button variant="secondary" onClick={onAddDocument}>
            Add Your Own
          </Button>
          <button
            onClick={handleDismissForever}
            className="text-small text-text-tertiary underline underline-offset-2 transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Don't show this again
          </button>
        </div>
      </div>
    </div>
  );
}

export default FirstRunOnboarding;
