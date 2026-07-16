import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DialogSize = "sm" | "md" | "lg";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Dialog width: sm (400px), md (512px), lg (640px). Default: md */
  size?: DialogSize;
  /** Hide the close X button (e.g. for steppers where you want custom close) */
  hideClose?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect mobile (viewport < 768px) */
function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

/** Lock/unlock body scroll */
function useScrollLock(locked: boolean) {
  const scrollYRef = useRef(0);
  useEffect(() => {
    if (locked) {
      scrollYRef.current = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollYRef.current);
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      if (scrollYRef.current) window.scrollTo(0, scrollYRef.current);
    };
  }, [locked]);
}

/** Simple focus trap inside a container ref */
function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Focus the first focusable element on open
    const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
    // Don't steal focus from inputs that the user might be typing in
    const activeEl = document.activeElement;
    if (firstFocusable && activeEl?.tagName !== "INPUT" && activeEl?.tagName !== "TEXTAREA") {
      firstFocusable.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, ref]);
}

// ---------------------------------------------------------------------------
// Sizing map
// ---------------------------------------------------------------------------

const sizeMap: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  hideClose = false,
}: DialogProps) {
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `dialog-title-${useRef(Math.random().toString(36).slice(2)).current!}`;

  // Save & restore focus
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      // Restore focus after the component has had time to unmount
      requestAnimationFrame(() => {
        previousFocusRef.current?.focus();
      });
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useScrollLock(open);
  useFocusTrap(dialogRef, open);

  // Allow animations to play on every open
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      // Wait for exit animation to finish before unmounting
      timerRef.current = setTimeout(() => setMounted(false), 250);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-dialog flex items-end justify-center sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Scrim */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-[var(--dur-base)] ease-standard ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* Panel: bottom sheet on mobile, centered modal on desktop */}
      <div
        ref={dialogRef}
        className={[
          "relative z-10",
          "w-full",
          isMobile
            ? [
                "rounded-t-2xl",
                "bg-surface-elevated",
                "shadow-4",
                "max-h-[85vh]",
                "flex flex-col",
                "transition-transform duration-[var(--dur-slow)] ease-spring",
                visible ? "translate-y-0" : "translate-y-full",
              ].join(" ")
            : [
                sizeMap[size],
                "rounded-xl",
                "bg-surface-elevated",
                "border border-border",
                "shadow-4",
                "max-h-[85vh]",
                "flex flex-col",
                "transition-all duration-[var(--dur-slow)] ease-spring",
                visible
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-95 translate-y-4",
              ].join(" "),
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-hairline px-5 py-4 shrink-0">
          <h2
            id={titleId}
            className="text-title-3 text-text"
          >
            {title}
          </h2>
          {!hideClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default Dialog;
