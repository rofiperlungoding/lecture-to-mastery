import { useState, useEffect, useCallback } from 'react'
import { Download, Smartphone, X, RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * BeforeInstallPromptEvent — not yet in standard TS types.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

/**
 * Hook that returns an update handler. When a new SW is detected,
 * it shows a toast and refreshes on confirmation.
 */
export function useSwUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const handleRefresh = useCallback(() => {
    updateServiceWorker(true)
  }, [updateServiceWorker])

  return { needRefresh, handleRefresh }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // SW update toast
  const { needRefresh, handleRefresh } = useSwUpdate()

  useEffect(() => {
    if (isStandalone()) return

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setShowInstall(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    if (isIOS() && !dismissed) {
      const iosTimer = setTimeout(() => setShowIOSHint(true), 8000)
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        clearTimeout(iosTimer)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [dismissed])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      setShowInstall(false)
      setShowIOSHint(false)
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setShowInstall(false)
    setShowIOSHint(false)
    setDismissed(true)
  }, [])

  if (isStandalone() || (!showInstall && !showIOSHint && !needRefresh)) return null

  return (
    <>
      {/* Android/Desktop install button */}
      {showInstall && deferredPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-toast mx-auto max-w-sm animate-slide-up">
          <div className="rounded-xl border border-border bg-surface-elevated p-4 elevated-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                <Download className="h-5 w-5 text-brand-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold text-text">Install L2M</p>
                <p className="text-small text-text-secondary">Add to your home screen for quick access</p>
              </div>
              <button
                onClick={handleDismiss}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle hover:text-text-secondary transition-colors"
                aria-label="Dismiss install prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={handleInstall}
              className="mt-3 w-full rounded-lg bg-brand-500 px-4 py-2 text-label font-medium text-white transition-colors hover:bg-brand-600"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* iOS hint */}
      {showIOSHint && !showInstall && (
        <div className="fixed bottom-4 left-4 right-4 z-toast mx-auto max-w-sm animate-slide-up">
          <div className="rounded-xl border border-border bg-surface-elevated p-4 elevated-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50">
                <Smartphone className="h-5 w-5 text-sky-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold text-text">Add to Home Screen</p>
                <p className="text-small text-text-secondary">
                  Tap <span className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-caption">Share</span> then{' '}
                  <strong>Add to Home Screen</strong> for the best experience.
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle hover:text-text-secondary transition-colors"
                aria-label="Dismiss iOS hint"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update available toast + button */}
      {needRefresh && (
        <div className="fixed bottom-4 left-4 right-4 z-toast mx-auto max-w-sm animate-slide-up">
          <div className="rounded-xl border border-border bg-surface-elevated p-4 elevated-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <RefreshCw className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold text-text">Update available</p>
                <p className="text-small text-text-secondary">A new version is ready. Refresh to get the latest features.</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className="mt-3 w-full rounded-lg bg-brand-500 px-4 py-2 text-label font-medium text-white transition-colors hover:bg-brand-600"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default InstallPrompt
