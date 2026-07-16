// ============================================================================
// Minimal i18n scaffolding — lightweight t() helper with locale loading.
//
// This is intentionally minimal: no external i18n library, no ICU syntax.
// Supports simple key lookup with optional interpolation and plurals.
//
// To add a new locale: add a .json file in src/locales/ and register it below.
//
// NOTE: The UI is NOT fully translated yet. This scaffolding provides the
// mechanism so translations can be added incrementally.
// ============================================================================

import en from '../locales/en.json'
import es from '../locales/es.json'

export type LocaleCode = 'en' | 'es'

const LOCALES: Record<LocaleCode, Record<string, string>> = { en, es }

let currentLocale: LocaleCode = 'en'

/**
 * Set the active locale for the session.
 * Persists to localStorage for cross-session consistency.
 */
export function setLocale(code: LocaleCode): void {
  currentLocale = code
  try {
    localStorage.setItem('locale', code)
  } catch { /* ignore */ }
}

/**
 * Get the current active locale code.
 */
export function getLocale(): LocaleCode {
  return currentLocale
}

/**
 * Initialize locale from localStorage (call at app root).
 */
export function initLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem('locale') as LocaleCode | null
    if (saved && LOCALES[saved]) {
      currentLocale = saved
    }
  } catch { /* ignore */ }
  return currentLocale
}

/**
 * Translate a key to the current locale.
 *
 * Supports:
 * - Simple: t('dashboard.title')
 * - Interpolation: t('cards.due', { count: 5 })
 * - Plurals: t('cards.due', { count: 5 }) where the locale has
 *   "cards.due" = "{count} cards due" and "cards.due_plural" = "{count} card due"
 *
 * Falls back to the key itself if no translation is found.
 *
 * @example
 *   t('common.save')           // "Save"
 *   t('dashboard.dueCount', { count: 7 })  // "7 cards due"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = LOCALES[currentLocale]

  // Check for plural form
  if (params && typeof params.count === 'number' && params.count !== 1) {
    const pluralKey = `${key}_plural`
    if (locale[pluralKey]) {
      return interpolate(locale[pluralKey], params)
    }
  }

  const template = locale[key] ?? locale[key] ?? key
  return interpolate(template, params)
}

/**
 * Simple interpolation: replaces {key} with the corresponding param value.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const val = params[k]
    return val !== undefined ? String(val) : `{${k}}`
  })
}
