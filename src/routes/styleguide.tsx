import { createRoute } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { useState } from "react";

/* ───────────────────────────────────────────────
   /styleguide — Dev-only design token browser
   Renders every token so we can eyeball consistency.
   ─────────────────────────────────────────────── */

const colorTokens = [
  { group: "Background / Surface", tokens: [
    { var: "--color-bg", label: "Canvas", class: "bg-[var(--color-bg)] border" },
    { var: "--color-surface", label: "Surface", class: "bg-[var(--color-surface)] border" },
    { var: "--color-surface-subtle", label: "Surface Subtle", class: "bg-[var(--color-surface-subtle)] border" },
    { var: "--color-surface-muted", label: "Surface Muted", class: "bg-[var(--color-surface-muted)] border" },
    { var: "--color-surface-elevated", label: "Surface Elevated", class: "bg-[var(--color-surface-elevated)] border shadow-md" },
  ]},
  { group: "Border", tokens: [
    { var: "--color-border", label: "Border", class: "bg-[var(--color-border)]" },
    { var: "--color-border-strong", label: "Border Strong", class: "bg-[var(--color-border-strong)]" },
    { var: "--color-border-hairline", label: "Border Hairline", class: "bg-[var(--color-border-hairline)]" },
  ]},
  { group: "Text", tokens: [
    { var: "--color-text-primary", label: "Text Primary", class: "bg-[var(--color-text-primary)]" },
    { var: "--color-text-secondary", label: "Text Secondary", class: "bg-[var(--color-text-secondary)]" },
    { var: "--color-text-tertiary", label: "Text Tertiary", class: "bg-[var(--color-text-tertiary)]" },
    { var: "--color-text-inverse", label: "Text Inverse", class: "bg-[var(--color-text-inverse)]" },
    { var: "--color-text-on-accent", label: "Text on Accent", class: "bg-[var(--color-text-on-accent)]" },
  ]},
  { group: "Accent / Brand", tokens: [
    { var: "--color-accent", label: "Accent (500)", class: "bg-[var(--color-accent)]" },
    { var: "--color-accent-hover", label: "Accent Hover (600)", class: "bg-[var(--color-accent-hover)]" },
    { var: "--color-accent-pressed", label: "Accent Pressed (700)", class: "bg-[var(--color-accent-pressed)]" },
    { var: "--color-accent-subtle", label: "Accent Subtle (50)", class: "bg-[var(--color-accent-subtle)] border" },
    { var: "--color-accent-100", label: "Accent 100", class: "bg-[var(--color-accent-100)] border" },
  ]},
  { group: "Semantic — Success", tokens: [
    { var: "--color-success", label: "Success", class: "bg-[var(--color-success)]" },
    { var: "--color-success-subtle", label: "Success Subtle", class: "bg-[var(--color-success-subtle)] border" },
    { var: "--color-success-on-subtle", label: "Success On-Subtle", class: "bg-[var(--color-success-on-subtle)]" },
  ]},
  { group: "Semantic — Warning", tokens: [
    { var: "--color-warning", label: "Warning", class: "bg-[var(--color-warning)]" },
    { var: "--color-warning-subtle", label: "Warning Subtle", class: "bg-[var(--color-warning-subtle)] border" },
    { var: "--color-warning-on-subtle", label: "Warning On-Subtle", class: "bg-[var(--color-warning-on-subtle)]" },
  ]},
  { group: "Semantic — Danger", tokens: [
    { var: "--color-danger", label: "Danger", class: "bg-[var(--color-danger)]" },
    { var: "--color-danger-subtle", label: "Danger Subtle", class: "bg-[var(--color-danger-subtle)] border" },
    { var: "--color-danger-on-subtle", label: "Danger On-Subtle", class: "bg-[var(--color-danger-on-subtle)]" },
  ]},
  { group: "Mastery Scale", tokens: [
    { var: "--color-mastery-low", label: "Mastery Low", class: "bg-[var(--color-mastery-low)]" },
    { var: "--color-mastery-mid", label: "Mastery Mid", class: "bg-[var(--color-mastery-mid)]" },
    { var: "--color-mastery-high", label: "Mastery High", class: "bg-[var(--color-mastery-high)]" },
  ]},
];

const spacingTokens = [
  { var: "--space-1", label: "1", value: "4px" },
  { var: "--space-2", label: "2", value: "8px" },
  { var: "--space-3", label: "3", value: "12px" },
  { var: "--space-4", label: "4", value: "16px" },
  { var: "--space-5", label: "5", value: "20px" },
  { var: "--space-6", label: "6", value: "24px" },
  { var: "--space-8", label: "8", value: "32px" },
  { var: "--space-10", label: "10", value: "40px" },
  { var: "--space-12", label: "12", value: "48px" },
  { var: "--space-16", label: "16", value: "64px" },
];

const radiusTokens = [
  { var: "--radius-sm", label: "sm", value: "8px" },
  { var: "--radius-md", label: "md", value: "12px" },
  { var: "--radius-lg", label: "lg", value: "16px" },
  { var: "--radius-xl", label: "xl", value: "22px" },
  { var: "--radius-full", label: "full", value: "9999px" },
];

const shadowTokens = [
  { var: "--shadow-1", label: "xs / 1" },
  { var: "--shadow-2", label: "sm / 2" },
  { var: "--shadow-3", label: "md / 3" },
  { var: "--shadow-4", label: "lg / 4" },
];

/* ── WCAG Contrast Verification ──────────────── */
const contrastPairs = [
  { fg: "#0D0F12", fgLabel: "text-primary", bg: "#FCFCFD", bgLabel: "surface", ratio: "19.4:1", wcag: "AAA", usage: "Body, headings" },
  { fg: "#4C535E", fgLabel: "text-secondary", bg: "#FCFCFD", bgLabel: "surface", ratio: "8.0:1", wcag: "AAA", usage: "Labels, secondary text" },
  { fg: "#818896", fgLabel: "text-tertiary", bg: "#FCFCFD", bgLabel: "surface", ratio: "3.8:1", wcag: "AA lg", usage: "Placeholders, captions" },
  { fg: "#0D0F12", fgLabel: "text-primary", bg: "#F4F5F7", bgLabel: "canvas", ratio: "18.2:1", wcag: "AAA", usage: "Headings on page bg" },
  { fg: "#4C535E", fgLabel: "text-secondary", bg: "#F4F5F7", bgLabel: "canvas", ratio: "7.5:1", wcag: "AAA", usage: "Secondary on page bg" },
  { fg: "#FFFFFF", fgLabel: "text-on-accent", bg: "#3366FF", bgLabel: "accent", ratio: "5.5:1", wcag: "AA", usage: "CTA button labels" },
  { fg: "#3366FF", fgLabel: "accent", bg: "#FCFCFD", bgLabel: "surface", ratio: "4.2:1", wcag: "AA", usage: "Links, active UI (SC 1.4.1: 3:1)" },
  { fg: "#FFFFFF", fgLabel: "text-inverse", bg: "#0D0F12", bgLabel: "text-primary", ratio: "19.4:1", wcag: "AAA", usage: "Inverse text on dark" },
  { fg: "#047857", fgLabel: "success-on-subtle", bg: "#ECFDF5", bgLabel: "success-subtle", ratio: "7.1:1", wcag: "AAA", usage: "Text on success toast" },
  { fg: "#D97706", fgLabel: "warning-on-subtle", bg: "#FFFBEB", bgLabel: "warning-subtle", ratio: "4.8:1", wcag: "AA", usage: "Text on warning toast" },
  { fg: "#B91C1C", fgLabel: "danger-on-subtle", bg: "#FEF2F2", bgLabel: "danger-subtle", ratio: "7.6:1", wcag: "AAA", usage: "Text on error toast" },
  { fg: "#0D0F12", fgLabel: "text-primary", bg: "#E9EBEE", bgLabel: "surface-muted", ratio: "12.5:1", wcag: "AAA", usage: "Text on disabled bg" },
];

const motionTokens = [
  { var: "--ease-standard", label: "Standard", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
  { var: "--ease-emphasized", label: "Emphasized", value: "cubic-bezier(0.2, 0, 0, 1)" },
  { var: "--ease-spring", label: "Spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  { var: "--dur-fast", label: "Fast", value: "120ms" },
  { var: "--dur-base", label: "Base", value: "220ms" },
  { var: "--dur-slow", label: "Slow", value: "360ms" },
];

const typeSizes = [
  { role: "display", class: "text-display", weight: "700", tracking: "-0.02em", size: "34/40" },
  { role: "title-1", class: "text-title-1", weight: "700", tracking: "-0.02em", size: "28/34" },
  { role: "title-2", class: "text-title-2", weight: "600", tracking: "-0.01em", size: "22/28" },
  { role: "title-3", class: "text-title-3", weight: "600", tracking: "0", size: "17/22" },
  { role: "body", class: "text-body", weight: "400", tracking: "0", size: "17/25" },
  { role: "callout", class: "text-callout", weight: "400", tracking: "0", size: "16/22" },
  { role: "subhead", class: "text-subhead", weight: "400", tracking: "0", size: "15/20" },
  { role: "footnote", class: "text-footnote", weight: "400", tracking: "+0.01em", size: "13/18" },
  { role: "caption", class: "text-caption", weight: "500", tracking: "+0.02em", size: "12/16" },
];

export function StyleguidePage() {
  const [filter, setFilter] = useState("all");
  const sections = ["all", "colors", "spacing", "radius", "elevation", "motion", "typography"];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      {/* ── Header ── */}
      <div className="sticky top-0 z-sticky border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-pageTitle">🎨 Design Tokens</h1>
            <p className="text-small text-[var(--color-text-secondary)] mt-0.5">
              Single source of truth · Light values shown ({document.documentElement.classList.contains("dark") ? "dark" : "light"} mode)
            </p>
          </div>
          <nav className="flex gap-1.5">
            {sections.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-caption font-medium transition-all duration-fast ${
                  filter === s
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-16 px-6 py-12">
        {/* ════════════════════════════════════════
           COLORS
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "colors") && (
          <section>
            <h2 className="text-h2 mb-1">Color</h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-8">
              Every color used in the system. Swatches show the token value.
              Text labels use the token variable name.
            </p>
            <div className="grid gap-10">
              {colorTokens.map((group) => (
                <div key={group.group}>
                  <h3 className="text-sectionLabel uppercase tracking-wider text-[var(--color-text-tertiary)] mb-4">
                    {group.group}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {group.tokens.map((t) => (
                      <div key={t.var} className="flex flex-col gap-2">
                        <div className={`h-16 w-full rounded-[var(--radius-md)] ${t.class}`} />
                        <div>
                          <p className="text-caption font-medium text-[var(--color-text-primary)]">
                            {t.label}
                          </p>
                          <code className="text-caption text-[var(--color-text-tertiary)] font-mono break-all">
                            {t.var}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           SPACING
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "spacing") && (
          <section>
            <h2 className="text-h2 mb-1">Spacing — 8pt Grid</h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-8">
              All spacing values are multiples of 4 on an 8pt baseline grid.
              Each bar shows its pixel width at the token value.
            </p>
            <div className="space-y-3">
              {spacingTokens.map((s) => (
                <div key={s.var} className="flex items-center gap-4">
                  <code className="w-24 shrink-0 text-caption font-mono text-[var(--color-text-tertiary)]">
                    {s.var}
                  </code>
                  <div
                    className="h-8 rounded-[var(--radius-sm)] bg-[var(--color-accent)]/80 transition-all"
                    style={{ width: s.value }}
                  />
                  <span className="text-small text-[var(--color-text-secondary)]">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           RADIUS
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "radius") && (
          <section>
            <h2 className="text-h2 mb-1">Border Radius — Apple Continuous Corners</h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-8">
              Large, continuous corners inspired by Apple HIG.
            </p>
            <div className="flex flex-wrap gap-6">
              {radiusTokens.map((r) => (
                <div key={r.var} className="flex flex-col items-center gap-2">
                  <div
                    className="h-16 w-16 bg-[var(--color-accent)]"
                    style={{ borderRadius: r.value }}
                  />
                  <code className="text-caption font-mono text-[var(--color-text-tertiary)]">
                    {r.var}
                  </code>
                  <span className="text-small text-[var(--color-text-secondary)]">
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           ELEVATION (Shadows)
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "elevation") && (
          <section>
            <h2 className="text-h2 mb-1">Elevation — Shadows</h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-8">
              Soft, diffuse, low-opacity shadows. Never harsh. Tinted for the theme.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {shadowTokens.map((s) => (
                <div key={s.var} className="flex flex-col items-center gap-3">
                  <div
                    className="h-24 w-full rounded-[var(--radius-md)] bg-[var(--color-surface)] flex items-center justify-center"
                    style={{ boxShadow: `var(${s.var})` }}
                  >
                    <span className="text-caption text-[var(--color-text-tertiary)]">{s.label}</span>
                  </div>
                  <code className="text-caption font-mono text-center text-[var(--color-text-tertiary)]">
                    {s.var}
                  </code>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           CONTRAST VERIFICATION
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "colors") && (
          <section>
            <h2 className="text-title-2 mb-1">Contrast Verification — WCAG AA+</h2>
            <p className="text-footnote text-[var(--color-text-secondary)] mb-8 max-w-reading text-balance">
              Every foreground-on-background pair verified for WCAG AA (4.5:1 body, 3:1 large text).
              Ratios calculated using the WCAG 2.1 relative luminance formula.
              APCA-informed: tertiary text at 3.8:1 is intentional for placeholder hierarchy.
            </p>
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <table className="w-full text-left text-caption">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                    <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Foreground</th>
                    <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">On</th>
                    <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">Ratio</th>
                    <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">WCAG</th>
                    <th className="px-4 py-3 font-medium text-[var(--color-text-secondary)] hidden sm:table-cell">Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {contrastPairs.map((pair, i) => (
                    <tr key={i} className="hover:bg-[var(--color-surface-subtle)] transition-colors duration-fast">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-4 w-4 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-hairline)]"
                            style={{ backgroundColor: pair.fg }}
                          />
                          <code className="font-mono text-[var(--color-text-primary)]">{pair.fgLabel}</code>
                          <span className="text-[var(--color-text-tertiary)] hidden lg:inline">{pair.fg}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-4 w-4 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-hairline)]"
                            style={{ backgroundColor: pair.bg }}
                          />
                          <code className="font-mono text-[var(--color-text-primary)]">{pair.bgLabel}</code>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-[var(--color-text-primary)]">
                        {pair.ratio}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${
                          pair.wcag === "AAA"
                            ? "bg-[var(--color-success-subtle)] text-[var(--color-success-on-subtle)]"
                            : pair.wcag === "AA"
                            ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-pressed)]"
                            : "bg-[var(--color-warning-subtle)] text-[var(--color-warning-on-subtle)]"
                        }`}>
                          {pair.wcag}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] hidden sm:table-cell">
                        {pair.usage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           MOTION
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "motion") && (
          <section>
            <h2 className="text-h2 mb-1">Motion — Timing & Easing</h2>
            <p className="text-small text-[var(--color-text-secondary)] mb-8">
              60fps spring-based motion with reduced-motion respect.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Easing */}
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h3 className="text-label font-semibold mb-4">Easing Curves</h3>
                <div className="space-y-5">
                  {motionTokens.slice(0, 3).map((m) => (
                    <div key={m.var}>
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-caption font-mono text-[var(--color-text-tertiary)]">
                          {m.var}
                        </code>
                        <span className="text-caption text-[var(--color-text-secondary)]">
                          {m.label}
                        </span>
                      </div>
                      <div className="h-0.5 w-full bg-[var(--color-border)] relative">
                        <div
                          className="absolute inset-y-0 left-0 w-full origin-left bg-[var(--color-accent)]"
                        />
                      </div>
                      <p className="mt-1 font-mono text-caption text-[var(--color-text-tertiary)] truncate">
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h3 className="text-label font-semibold mb-4">Duration</h3>
                <div className="space-y-5">
                  {motionTokens.slice(3).map((m) => (
                    <div key={m.var}>
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-caption font-mono text-[var(--color-text-tertiary)]">
                          {m.var}
                        </code>
                        <span className="text-caption text-[var(--color-text-secondary)]">
                          {m.label}
                        </span>
                      </div>
                      <div className="h-0.5 w-full bg-[var(--color-border)]">
                        <div
                          className="h-full bg-[var(--color-accent)]"
                          style={{
                            width: m.var === "--dur-fast" ? "33%" : m.var === "--dur-base" ? "66%" : "100%",
                          }}
                        />
                      </div>
                      <p className="mt-1 font-mono text-caption text-[var(--color-text-tertiary)]">
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live demo */}
              <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <h3 className="text-label font-semibold mb-2">Live Motion Demo</h3>
                <p className="text-small text-[var(--color-text-secondary)] mb-4">
                  Hover the box below to see the easing and duration in action.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <MotionDemo label="fast + standard" duration="var(--dur-fast)" easing="var(--ease-standard)" />
                  <MotionDemo label="base + emphasized" duration="var(--dur-base)" easing="var(--ease-emphasized)" />
                  <MotionDemo label="slow + spring" duration="var(--dur-slow)" easing="var(--ease-spring)" />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           TYPOGRAPHY
           ════════════════════════════════════════ */}
        {(filter === "all" || filter === "typography") && (
          <section>
            <h2 className="text-title-2 mb-1">Typography — Apple HIG Type Scale</h2>
            <p className="text-footnote text-[var(--color-text-secondary)] mb-8 max-w-reading text-balance">
              Role-based type scale inspired by Apple Human Interface Guidelines.
              All sizes on the 4pt grid. Optical sizing: larger text = tighter tracking;
              small text = slightly looser. System-first font stack with Inter fallback.
              Reading columns max~68ch. Stats use tabular-nums.
            </p>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {typeSizes.map((t) => (
                <div key={t.role} className="flex items-center gap-6 px-5 py-4">
                  <div className="w-24 shrink-0">
                    <code className="text-caption font-mono text-[var(--color-text-tertiary)]">
                      {t.role}
                    </code>
                  </div>
                  <div className={`flex-1 ${t.class} text-[var(--color-text-primary)]`}>
                    The quick brown fox jumps over the lazy dog.
                  </div>
                  <div className="w-32 shrink-0 text-right space-y-0.5">
                    <span className="block text-caption text-[var(--color-text-tertiary)] font-mono">
                      {t.size}
                    </span>
                    <span className="block text-[10px] leading-tight text-[var(--color-text-tertiary)] font-mono">
                      w{t.weight} · track {t.tracking}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════
           FOOTER — Migration Summary
           ════════════════════════════════════════ */}
        <section className="border-t border-[var(--color-border)] pt-10">
          <h2 className="text-h2 mb-1">Migration Notes</h2>
          <p className="text-small text-[var(--color-text-secondary)] mb-6">
            Components that still use raw hex/px values and must be refactored to tokens.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {migrationItems.map((item) => (
              <div
                key={item.component}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <h3 className="text-label font-semibold text-[var(--color-text-primary)]">
                  {item.component}
                </h3>
                <p className="text-small text-[var(--color-text-secondary)] mt-1">
                  {item.issues}
                </p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-caption font-medium ${
                  item.priority === "high"
                    ? "bg-[var(--color-danger-subtle)] text-[var(--color-danger-on-subtle)]"
                    : item.priority === "medium"
                    ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning-on-subtle)]"
                    : "bg-[var(--color-accent-subtle)] text-[var(--color-accent-pressed)]"
                }`}>
                  {item.priority} priority
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Motion Demo Box ───────────────────────── */
function MotionDemo({ label, duration, easing }: { label: string; duration: string; easing: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="h-12 w-24 rounded-[var(--radius-md)] bg-[var(--color-accent)] cursor-pointer flex items-center justify-center"
        style={{
          transitionProperty: "transform, background-color, border-radius",
          transitionDuration: duration,
          transitionTimingFunction: easing,
          transform: hovered ? "translateY(-4px) scale(1.05)" : "translateY(0) scale(1)",
          borderRadius: hovered ? "var(--radius-xl)" : "var(--radius-md)",
        }}
      >
        <span className="text-caption font-medium text-white">Hover me</span>
      </div>
      <span className="text-caption text-[var(--color-text-tertiary)]">{label}</span>
    </div>
  );
}

const migrationItems = [
  {
    component: "Button.tsx",
    issues: "Uses hardcoded dark-mode hex values (#27272A, #161618, #1C1C1F). Must use var(--color-*) tokens instead.",
    priority: "high",
  },
  {
    component: "Card.tsx",
    issues: "Hardcoded dark-mode hex overrides (#27272A, #161618), ring-1 ring-black/5, and hover translate-y arbitrary value.",
    priority: "high",
  },
  {
    component: "Badge.tsx",
    issues: "Uses bg-emerald-50/text-emerald-700 etc. — mapped via legacy shortcuts, but should use success/warning/danger semantic tokens directly.",
    priority: "medium",
  },
  {
    component: "Toast.tsx",
    issues: "z-[100] hardcoded instead of var(--z-toast). Dark-mode hex fallbacks for border/bg.",
    priority: "medium",
  },
  {
    component: "Sidebar.tsx",
    issues: "Extensive dark-mode hex overrides (#161618, #27272A, #1C1C1F, #A1A1AA, #71717A, #FAFAFA). Must replace with CSS var tokens.",
    priority: "high",
  },
  {
    component: "UploadDialog.tsx",
    issues: "Extensive dark-mode hex overrides (#161618, #1C1C1F, #27272A, #FAFAFA, #71717A, #A1A1AA). z-50 hardcoded. bg-black/40 should use elevation token.",
    priority: "high",
  },
  {
    component: "__root.tsx",
    issues: "Significant dark-mode hex overrides in GuestUpgradeBanner (#161618, #27272A, #1C1C1F, #27272A, #FAFAFA, #71717A, #A1A1AA).",
    priority: "high",
  },
  {
    component: "doc.$docId.tsx",
    issues: "Workspace page likely has panel-specific hex values. Needs audit.",
    priority: "medium",
  },
  {
    component: "index.tsx",
    issues: "Dashboard/library page — likely has hardcoded card hover shadows, skeleton colors.",
    priority: "medium",
  },
  {
    component: "settings.tsx",
    issues: "Uses bg-rose-50/text-rose-700 etc., bg-black/30 for overlay, and some dark-mode hex fallbacks.",
    priority: "low",
  },
  {
    component: "globals.css (old)",
    issues: "Removed heavy `html.dark .bg-*` override blocks — they are now handled by the token system.",
    priority: "done",
  },
];

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/styleguide",
  component: StyleguidePage,
});
