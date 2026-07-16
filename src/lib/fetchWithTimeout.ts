/**
 * fetchWithTimeout — a lightweight, typed fetch wrapper.
 *
 * - Configurable timeout (default 30s)
 * - Catches network failures, JSON parse failures, non-2xx responses
 * - Returns { data, error } — never throws
 * - Works seamlessly with both browser fetch and edge-function calls
 */

export interface SafeFetchResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

export interface SafeFetchOptions extends RequestInit {
  /** Timeout in milliseconds. Default 30_000. */
  timeout?: number
}

/**
 * Wrap any fetch call with a timeout and structured error return.
 * The returned promise never rejects.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult<T>> {
  const { timeout = 30_000, ...fetchOptions } = options

  // Build an AbortController for the timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Merge the caller's signal if provided
  const signal =
    fetchOptions.signal instanceof AbortSignal
      ? anySignal([fetchOptions.signal, controller.signal])
      : controller.signal

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
    })

    clearTimeout(timeoutId)

    // Non-2xx → try to parse the error body
    if (!response.ok) {
      let message = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errBody = await response.json()
        if (errBody?.error) message = String(errBody.error)
        else if (errBody?.message) message = String(errBody.message)
      } catch {
        // ignore parse failures — use the HTTP status message
      }
      return { data: null, error: { message } }
    }

    // Empty body (204) or no JSON content-type
    const contentType = response.headers.get('content-type')
    if (response.status === 204 || !contentType || !contentType.includes('json')) {
      return { data: null as T | null, error: null }
    }

    // Parse JSON body
    const body: T = await response.json()
    return { data: body, error: null }
  } catch (err: unknown) {
    clearTimeout(timeoutId)

    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        data: null,
        error: { message: `Request timed out after ${timeout}ms` },
      }
    }

    const message =
      err instanceof Error ? err.message : 'An unknown network error occurred'
    return { data: null, error: { message } }
  }
}

/**
 * Combine multiple AbortSignals into one.
 * If any signal is aborted, the composite signal is aborted.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true },
    )
  }

  return controller.signal
}

export default safeFetch
