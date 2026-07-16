import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Detects online/offline status and renders a subtle banner when the
 * user is offline. Also exposes an `isOffline` export for other
 * components to conditionally disable network actions.
 */

let offlineListeners: Array<(offline: boolean) => void> = []

export function notifyOfflineChange(offline: boolean) {
  offlineListeners.forEach((fn) => fn(offline))
}

/**
 * Hook to check if the browser is currently offline.
 * Use this in components that need to conditionally disable network actions.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => { setOnline(true); notifyOfflineChange(false) }
    const handleOffline = () => { setOnline(false); notifyOfflineChange(true) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Poll as a fallback for environments where events are unreliable
    const interval = setInterval(() => {
      const isOnline = navigator.onLine
      setOnline((prev) => {
        if (prev !== isOnline) notifyOfflineChange(!isOnline)
        return isOnline
      })
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, []) // empty deps — events + interval set up once; functional updater avoids stale closures

  return online
}

export function OfflineBanner() {
  const online = useOnlineStatus()

  if (online) return null

  return (
    <div
      className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-small text-amber-800"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        You're offline. Previously loaded content is still available, but actions
        that need the network (generating, uploading, chat) are disabled.
      </span>
    </div>
  )
}

export default OfflineBanner
