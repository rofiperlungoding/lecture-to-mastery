/**
 * errorMonitor — lightweight, zero-dependency client error reporter.
 *
 * Captures:
 *   - Unhandled exceptions (window.onerror)
 *   - Unhandled promise rejections (window.onunhandledrejection)
 *   - Manual error logs (logClientError)
 *
 * Error payload shape stored in `client_errors`:
 *   id          uuid (default gen_random_uuid())
 *   message     text
 *   stack       text
 *   url         text
 *   user_agent  text
 *   context     text (optional — component/page description)
 *   created_at  timestamptz
 *
 * The Supabase insert is fire-and-forget — never throws, never blocks the UI.
 */

// ── Supabase client (lazy import to avoid circular deps) ─────────────
type SupabaseClient = import('@supabase/supabase-js').SupabaseClient
let _supabase: SupabaseClient | null = null

async function getSupabase() {
  if (!_supabase) {
    try {
      const mod = await import('./supabase')
      _supabase = mod.supabase as SupabaseClient
    } catch {
      // Supabase not available — silently degrade (e.g. in SSR/test)
    }
  }
  return _supabase
}

// ── Throttle: deduplicate identical errors within a 5s window ───────
const recentErrors = new Map<string, number>()

function shouldReport(message: string): boolean {
  const now = Date.now()
  const last = recentErrors.get(message)
  if (last && now - last < 5_000) return false
  recentErrors.set(message, now)
  // Clean old entries every 20 inserts
  if (recentErrors.size > 100) {
    const cutoff = now - 60_000
    for (const [key, ts] of recentErrors) {
      if (ts < cutoff) recentErrors.delete(key)
    }
  }
  return true
}

// ── Core report function ────────────────────────────────────────────

interface ErrorPayload {
  message: string
  stack: string
  url: string
  user_agent: string
  context: string
}

function buildPayload(
  error: Error,
  context: string,
): ErrorPayload {
  return {
    message: error.message || String(error),
    stack: error.stack || '',
    url: typeof window !== 'undefined' ? window.location.href : '',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    context,
  }
}

async function report(payload: ErrorPayload): Promise<void> {
  if (!shouldReport(payload.message)) return

  try {
    const supabase = await getSupabase()
    if (!supabase) return

    await supabase.from('client_errors').insert({
      message: payload.message,
      stack: payload.stack,
      url: payload.url,
      user_agent: payload.user_agent,
      context: payload.context,
    })
  } catch {
    // Fire-and-forget: never throw from the error reporter
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Log a caught error manually (e.g. from catch blocks or ErrorBoundary).
 * Fire-and-forget; never throws.
 */
export function logClientError(error: Error, context = 'unknown'): void {
  const payload = buildPayload(error, context)
  report(payload)

  // In development, log to console
  if (import.meta.env.DEV) {
    console.warn(`[errorMonitor] ${context}:`, error.message)
  }
}

/**
 * Initialize global error handlers.
 * Call once at app bootstrap. Returns a cleanup function.
 */
export function initErrorMonitor(): () => void {
  // ── window.onerror ────────────────────────────────────────────
  const originalOnError = window.onerror

  window.onerror = (
    event: Event | string,
    source?: string,
    _lineno?: number,
    _colno?: number,
    error?: Error,
  ): boolean => {
    const message = typeof event === 'string' ? event : (error?.message ?? 'Unknown script error')
    const err = error ?? new Error(message)
    logClientError(err, 'window.onerror')
    originalOnError?.call(window, event, source, _lineno, _colno, error)
    return true // Prevent default browser error handling
  }

  // ── window.onunhandledrejection ───────────────────────────────
  const originalOnRejection = window.onunhandledrejection

  window.onunhandledrejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled Promise rejection'

    const error = reason instanceof Error ? reason : new Error(message)
    logClientError(error, 'unhandledrejection')
    originalOnRejection?.call(window, event)
  }

  // ── Cleanup ──────────────────────────────────────────────────
  return () => {
    window.onerror = originalOnError
    window.onunhandledrejection = originalOnRejection
  }
}

export default { initErrorMonitor, logClientError }
