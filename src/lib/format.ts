// ============================================================================
// Locale-aware formatting utilities.
//
// Uses the browser's Intl API (no dependencies) for date, number, and
// relative-time formatting. Falls back gracefully when Intl APIs are
// unavailable or when the locale is not supported.
// ============================================================================

// ── Date formatting ──────────────────────────────────────────────────────

/**
 * Format a date string or timestamp into a human-readable date.
 * Uses the user's browser locale by default.
 *
 * @example formatDate('2024-01-15') // "Jan 15, 2024" (en-US)
 * @example formatDate('2024-01-15', 'es') // "15 ene 2024" (es-ES)
 */
export function formatDate(
  date: string | number | Date,
  locale: string = navigator.language,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
    return new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'medium' }).format(d)
  } catch {
    return String(date)
  }
}

/**
 * Format a date string or timestamp as a short date (MM/DD or DD/MM).
 */
export function formatShortDate(
  date: string | number | Date,
  locale: string = navigator.language,
): string {
  return formatDate(date, locale, { month: 'short', day: 'numeric' })
}

/**
 * Format a date with time.
 */
export function formatDateTime(
  date: string | number | Date,
  locale: string = navigator.language,
): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
  } catch {
    return String(date)
  }
}

// ── Relative time ────────────────────────────────────────────────────────

/**
 * Format a date as a human-readable relative time string ("2 hours ago").
 * Falls back to a simple day/hour/minute calculation if Intl.RelativeTimeFormat
 * is not available.
 */
export function formatRelativeTime(
  date: string | number | Date,
  locale: string = navigator.language,
): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
    const now = Date.now()
    const diffMs = now - d.getTime()
    const diffSec = Math.round(diffMs / 1000)

    if (diffSec < 60) return 'Just now'
    const diffMin = Math.round(diffSec / 60)
    if (diffMin < 60) return formatRelativeUnit(-diffMin, 'minute', locale)
    const diffHour = Math.round(diffMin / 60)
    if (diffHour < 24) return formatRelativeUnit(-diffHour, 'hour', locale)
    const diffDay = Math.round(diffHour / 24)
    if (diffDay < 30) return formatRelativeUnit(-diffDay, 'day', locale)
    const diffMonth = Math.round(diffDay / 30)
    if (diffMonth < 12) return formatRelativeUnit(-diffMonth, 'month', locale)
    return formatDate(d, locale)
  } catch {
    return String(date)
  }
}

function formatRelativeUnit(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: string,
): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
  } catch {
    // Fallback for unsupported locales
    const abs = Math.abs(value)
    const label = unit === 'minute' ? 'min' : unit === 'hour' ? 'hour' : unit === 'day' ? 'day' : 'month'
    const plural = abs !== 1 ? 's' : ''
    return `${abs} ${label}${plural} ago`
  }
}

// ── Number formatting ────────────────────────────────────────────────────

/**
 * Format a number with locale-aware separators.
 *
 * @example formatNumber(1234567) // "1,234,567" (en-US)
 * @example formatNumber(1234567, 'de') // "1.234.567" (de-DE)
 */
export function formatNumber(
  value: number,
  locale: string = navigator.language,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options ?? {}).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Format a number as a percentage.
 */
export function formatPercent(
  value: number,
  locale: string = navigator.language,
): string {
  return formatNumber(value / 100, locale, { style: 'percent', maximumFractionDigits: 0 })
}

/**
 * Format a number with compact notation (e.g., "1.2K").
 */
export function formatCompact(
  value: number,
  locale: string = navigator.language,
): string {
  return formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 })
}

// ── Duration formatting ──────────────────────────────────────────────────

/**
 * Format a duration in seconds to a human-readable string.
 *
 * @example formatDuration(3661) // "1h 1m 1s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}
