import { useEffect, useState, useRef, useCallback } from 'react'

// ===========================================================================
// useAsyncQuery — cancellable async data fetching hook
//
// Handles:
//   - Cancellation on unmount / deps change (via AbortController)
//   - Loading / data / error state machine
//   - AbortError → silent (not surfaced to error state)
//   - Stale-response guard (ignores responses from superseded requests)
//
// Usage:
//   const { data, loading, error, refetch } = useAsyncQuery(
//     async (signal) => {
//       const { data } = await supabase.from('x').select('*').abortSignal(signal)
//       return data
//     },
//     [docId],          // deps — re-fetches when these change
//   )
// ===========================================================================

export interface AsyncQueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Check if an error is an intentional abort (component unmount, deps change).
 */
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    err.name === 'AbortError'
  )
}

/**
 * Wraps a Supabase PostgrestFilterBuilder to accept an AbortSignal.
 * Call like:  queryWithSignal(supabase.from('x').select('*'), signal)
 */
export function withSignal<T>(
  builder: { abortSignal: (s: AbortSignal) => T },
  signal: AbortSignal,
): T {
  return builder.abortSignal(signal)
}

export function useAsyncQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
): AsyncQueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track the most recent request id so stale responses are ignored
  const requestIdRef = useRef(0)
  // Track if the component is still mounted
  const mountedRef = useRef(true)

  const execute = useCallback(() => {
    const controller = new AbortController()
    const thisRequest = ++requestIdRef.current

    setLoading(true)
    setError(null)

    fetcher(controller.signal)
      .then((result) => {
        // Ignore if this request was superseded or the component unmounted
        if (requestIdRef.current !== thisRequest || !mountedRef.current) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== thisRequest || !mountedRef.current) return

        // AbortError is silent — expected cancellation, not a real error
        if (isAbortError(err)) {
          setLoading(false)
          return
        }

        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        setLoading(false)
      })

    // Return the controller so the cleanup effect can abort it
    return controller
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    const controller = execute()

    return () => {
      mountedRef.current = false
      // Abort the in-flight request — this is SILENT, not an error
      controller?.abort()
    }
  }, [execute])

  const refetch = useCallback(() => {
    mountedRef.current = true
    execute()
  }, [execute])

  return { data, loading, error, refetch }
}

export default useAsyncQuery
