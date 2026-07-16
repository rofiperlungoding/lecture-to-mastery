// ---------------------------------------------------------------------------
// Lightweight on-brand SVG spot illustrations for empty states.
// Monochrome-accent, two-tone (accent + muted), inline SVGs — zero deps.
// ---------------------------------------------------------------------------

interface IllusProps {
  className?: string;
}

function IllusWrapper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-5 flex items-center justify-center ${className}`}>
      {children}
    </div>
  );
}

/**
 * Books / documents — stacked books with an accent bookmark
 */
export function IllusDocuments({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="96" height="80" viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Back book */}
        <rect x="28" y="12" width="44" height="56" rx="4" fill="var(--color-surface-muted)" />
        <rect x="48" y="20" width="4" height="40" rx="2" fill="var(--color-accent-subtle)" />
        {/* Front book */}
        <rect x="24" y="16" width="48" height="56" rx="4" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
        <rect x="44" y="24" width="4" height="40" rx="2" fill="var(--color-accent)" />
        {/* Page lines */}
        <rect x="34" y="32" width="22" height="1.5" rx="0.75" fill="var(--color-border)" />
        <rect x="34" y="38" width="26" height="1.5" rx="0.75" fill="var(--color-border)" />
        <rect x="34" y="44" width="18" height="1.5" rx="0.75" fill="var(--color-border)" />
        {/* Sparkle */}
        <circle cx="72" cy="18" r="3" fill="var(--color-accent-100)" />
        <path d="M72 15v6M69 18h6" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </IllusWrapper>
  );
}

/**
 * Quiz / question marks — a speech bubble with a question mark
 */
export function IllusQuiz({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="88" height="80" viewBox="0 0 88 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bubble body */}
        <rect x="8" y="8" width="64" height="48" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
        {/* Tail */}
        <path d="M36 56l-8 12 16-12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1" />
        {/* Question mark */}
        <circle cx="40" cy="38" r="2" fill="var(--color-accent)" />
        <path d="M40 32v-2a4 4 0 10-4-4" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
        {/* Dots */}
        <circle cx="30" cy="22" r="2" fill="var(--color-accent-100)" />
        <circle cx="50" cy="22" r="2" fill="var(--color-accent-100)" />
      </svg>
    </IllusWrapper>
  );
}

/**
 * All caught up — a checkmark in a circle with confetti-like dots
 */
export function IllusAllCaughtUp({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="88" height="80" viewBox="0 0 88 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Circle */}
        <circle cx="44" cy="36" r="24" fill="var(--color-success-subtle)" />
        <circle cx="44" cy="36" r="24" stroke="var(--color-success)" strokeWidth="2" />
        {/* Check */}
        <path d="M34 37l7 7 13-16" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Confetti dots */}
        <circle cx="28" cy="14" r="2.5" fill="var(--color-accent-100)" />
        <circle cx="64" cy="18" r="2" fill="var(--color-success-subtle)" stroke="var(--color-success)" strokeWidth="1" />
        <circle cx="20" cy="48" r="1.5" fill="var(--color-accent)" />
        <circle cx="68" cy="52" r="2.5" fill="var(--color-accent-100)" />
      </svg>
    </IllusWrapper>
  );
}

/**
 * Chat / messages — two speech bubbles
 */
export function IllusChat({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="88" height="80" viewBox="0 0 88 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Back bubble (muted) */}
        <rect x="20" y="10" width="52" height="40" rx="10" fill="var(--color-surface-muted)" />
        <path d="M40 50l-8 10 14-10" fill="var(--color-surface-muted)" />
        {/* Front bubble (accent) */}
        <rect x="14" y="18" width="52" height="40" rx="10" fill="var(--color-accent-subtle)" />
        <path d="M34 58l-8 10 14-10" fill="var(--color-accent-subtle)" />
        {/* Message lines */}
        <rect x="24" y="28" width="30" height="2" rx="1" fill="var(--color-accent-100)" />
        <rect x="24" y="35" width="24" height="2" rx="1" fill="var(--color-accent-100)" />
        <rect x="24" y="42" width="16" height="2" rx="1" fill="var(--color-accent-100)" />
      </svg>
    </IllusWrapper>
  );
}

/**
 * Activity / clock — a clock face with an activity pulse
 */
export function IllusActivity({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="88" height="80" viewBox="0 0 88 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Clock */}
        <circle cx="44" cy="38" r="22" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
        {/* Clock hands */}
        <path d="M44 38V26" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M44 38l8 6" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
        {/* Center dot */}
        <circle cx="44" cy="38" r="3" fill="var(--color-accent)" />
        {/* Pulse dots */}
        <circle cx="66" cy="22" r="2" fill="var(--color-accent-subtle)" />
        <circle cx="72" cy="30" r="4" fill="var(--color-accent-subtle)" />
      </svg>
    </IllusWrapper>
  );
}

/**
 * Generic / sparkle — a star/sparkle for general empty states
 */
export function IllusSparkle({ className }: IllusProps) {
  return (
    <IllusWrapper className={className}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Large sparkle */}
        <path
          d="M40 12l4.5 13.5H60l-11 8 4.5 14.5L40 44l-13.5 4.5L31 34l-11-8h15.5L40 12z"
          fill="var(--color-accent-subtle)"
          stroke="var(--color-accent)"
          strokeWidth="1"
        />
        {/* Small sparkles */}
        <path
          d="M20 58l1.5 4.5H27l-3.5 2.5 1.5 5L20 66l-5 4.5 1.5-5-3.5-2.5h5.5L20 58z"
          fill="var(--color-accent-100)"
        />
        <path
          d="M62 48l1 3h3.5l-2.5 2 1 3.5-3-2-3 2 1-3.5-2.5-2H61l1-3z"
          fill="var(--color-accent-100)"
        />
      </svg>
    </IllusWrapper>
  );
}
