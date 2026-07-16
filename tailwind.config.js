/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        /* ── Apple HIG-inspired role-based type scale ── */
        display: [
          "var(--fs-display)",
          {
            lineHeight: "var(--lh-display)",
            letterSpacing: "var(--track-display)",
            fontWeight: "var(--fw-display)",
          },
        ],
        "title-1": [
          "var(--fs-title-1)",
          {
            lineHeight: "var(--lh-title-1)",
            letterSpacing: "var(--track-title-1)",
            fontWeight: "var(--fw-title-1)",
          },
        ],
        "title-2": [
          "var(--fs-title-2)",
          {
            lineHeight: "var(--lh-title-2)",
            letterSpacing: "var(--track-title-2)",
            fontWeight: "var(--fw-title-2)",
          },
        ],
        "title-3": [
          "var(--fs-title-3)",
          {
            lineHeight: "var(--lh-title-3)",
            letterSpacing: "var(--track-title-3)",
            fontWeight: "var(--fw-title-3)",
          },
        ],
        body: [
          "var(--fs-body)",
          {
            lineHeight: "var(--lh-body)",
            letterSpacing: "var(--track-body)",
            fontWeight: "var(--fw-body)",
          },
        ],
        callout: [
          "var(--fs-callout)",
          {
            lineHeight: "var(--lh-callout)",
            letterSpacing: "var(--track-callout)",
            fontWeight: "var(--fw-callout)",
          },
        ],
        subhead: [
          "var(--fs-subhead)",
          {
            lineHeight: "var(--lh-subhead)",
            letterSpacing: "var(--track-subhead)",
            fontWeight: "var(--fw-subhead)",
          },
        ],
        footnote: [
          "var(--fs-footnote)",
          {
            lineHeight: "var(--lh-footnote)",
            letterSpacing: "var(--track-footnote)",
            fontWeight: "var(--fw-footnote)",
          },
        ],
        caption: [
          "var(--fs-caption)",
          {
            lineHeight: "var(--lh-caption)",
            letterSpacing: "var(--track-caption)",
            fontWeight: "var(--fw-caption)",
          },
        ],
        /* ── Legacy aliases (map to new roles) ── */
        pageTitle: [
          "var(--fs-title-1)",
          {
            lineHeight: "var(--lh-title-1)",
            letterSpacing: "var(--track-title-1)",
            fontWeight: "var(--fw-title-1)",
          },
        ],
        h2: [
          "var(--fs-title-2)",
          {
            lineHeight: "var(--lh-title-2)",
            letterSpacing: "var(--track-title-2)",
            fontWeight: "var(--fw-title-2)",
          },
        ],
        h3: [
          "var(--fs-title-3)",
          {
            lineHeight: "var(--lh-title-3)",
            letterSpacing: "var(--track-title-3)",
            fontWeight: "var(--fw-title-3)",
          },
        ],
        sectionLabel: ["var(--fs-caption)", {
          lineHeight: "var(--lh-caption)",
          letterSpacing: "var(--track-caption)",
          fontWeight: "var(--fw-caption)",
        }],
        label: ["var(--fs-subhead)", {
          lineHeight: "var(--lh-subhead)",
          letterSpacing: "var(--track-subhead)",
          fontWeight: "600",
        }],
        small: ["var(--fs-footnote)", {
          lineHeight: "var(--lh-footnote)",
          letterSpacing: "var(--track-footnote)",
          fontWeight: "var(--fw-footnote)",
        }],
      },
      colors: {
        // ── Surface / background ──
        canvas: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          subtle: "var(--color-surface-subtle)",
          muted: "var(--color-surface-muted)",
          elevated: "var(--color-surface-elevated)",
        },
        bg: {
          base: "var(--color-surface)",
          subtle: "var(--color-surface-subtle)",
          muted: "var(--color-surface-muted)",
        },
        // ── Border ──
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
          hairline: "var(--color-border-hairline)",
        },
        // ── Text ──
        text: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-tertiary)",
          tertiary: "var(--color-text-tertiary)",
          inverse: "var(--color-text-inverse)",
        },
        // ── Accent / brand ──
        brand: {
          50: "var(--color-accent-subtle)",
          100: "var(--color-accent-100)",
          500: "var(--color-accent)",
          600: "var(--color-accent-hover)",
          700: "var(--color-accent-pressed)",
        },
        // ── Semantic ──
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--color-success-subtle)",
          onSubtle: "var(--color-success-on-subtle)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--color-warning-subtle)",
          onSubtle: "var(--color-warning-on-subtle)",
        },
        error: {
          DEFAULT: "var(--color-danger)",
          subtle: "var(--color-danger-subtle)",
          onSubtle: "var(--color-danger-on-subtle)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          subtle: "var(--color-danger-subtle)",
          onSubtle: "var(--color-danger-on-subtle)",
        },
        // ── Mastery ──
        mastery: {
          low: "var(--color-mastery-low)",
          mid: "var(--color-mastery-mid)",
          high: "var(--color-mastery-high)",
        },
        // ── Legacy shortcuts (mapped to tokens; unused legacy shades fall back to Tailwind defaults) ──
        emerald: {
          50: "var(--color-success-subtle)",
          500: "var(--color-success)",
          700: "var(--color-success-on-subtle)",
        },
        amber: {
          50: "var(--color-warning-subtle)",
          500: "var(--color-warning)",
          700: "var(--color-warning-on-subtle)",
          800: "var(--color-warning-on-subtle)",
        },
        rose: {
          50: "var(--color-danger-subtle)",
          500: "var(--color-danger)",
          600: "var(--color-danger)",
          700: "var(--color-danger-on-subtle)",
        },
        green: {
          50: "var(--color-success-subtle)",
          400: "var(--color-success)",
          500: "var(--color-success)",
          700: "var(--color-success-on-subtle)",
        },
      },
      spacing: {
        // 8pt grid tokens — additive to Tailwind defaults
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
        // Vertical rhythm
        "rhythm-1": "var(--rhythm-1)",
        "rhythm-2": "var(--rhythm-2)",
        "rhythm-3": "var(--rhythm-3)",
        "rhythm-4": "var(--rhythm-4)",
        "rhythm-5": "var(--rhythm-5)",
        "rhythm-6": "var(--rhythm-6)",
        "rhythm-7": "var(--rhythm-7)",
      },
      width: {
        content: "var(--width-content)",
        reading: "var(--width-reading)",
        narrow: "var(--width-narrow)",
      },
      maxWidth: {
        content: "var(--width-content)",
        reading: "var(--width-reading)",
        narrow: "var(--width-narrow)",
      },
      height: {
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
        "control-xl": "var(--control-xl)",
      },
      minHeight: {
        touch: "var(--control-lg)",
      },
      padding: {
        "page-mobile": "var(--pad-page-mobile)",
        "page-tablet": "var(--pad-page-tablet)",
        "page-desktop": "var(--pad-page-desktop)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        xs: "var(--shadow-1)",
        sm: "var(--shadow-2)",
        md: "var(--shadow-3)",
        lg: "var(--shadow-4)",
        "1": "var(--shadow-1)",
        "2": "var(--shadow-2)",
        "3": "var(--shadow-3)",
        "4": "var(--shadow-4)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
        spring: "var(--ease-spring)",
        // Override Tailwind defaults
        DEFAULT: "var(--ease-standard)",
        out: "var(--ease-standard)",
        "in-out": "var(--ease-standard)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      zIndex: {
        base: "var(--z-base)",
        sticky: "var(--z-sticky)",
        dropdown: "var(--z-dropdown)",
        dialog: "var(--z-dialog)",
        toast: "var(--z-toast)",
      },
    },
  },
  plugins: [],
};
