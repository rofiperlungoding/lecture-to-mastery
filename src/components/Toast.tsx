import { useEffect, useRef, useState, useCallback } from 'react'
import { X, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
}

// ── Type config ─────────────────────────────────
const typeConfig = {
  success: {
    icon: CheckCircle,
    iconColor: 'text-success',
    accentColor: 'bg-success',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-danger',
    accentColor: 'bg-error',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    accentColor: 'bg-warning',
  },
} as const

const DISPLAY_DURATION = 4000

// ── Individual Toast ────────────────────────────

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
  /** Index for stacking offset */
  index: number
}

function ToastItem({ toast, onDismiss, index }: ToastItemProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const pausedRef = useRef(false)
  const startTimeRef = useRef(Date.now())
  const rafRef = useRef<number | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cfg = typeConfig[toast.type]

  const doDismiss = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 250)
  }, [toast.id, onDismiss])

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // Auto-dismiss timer + progress animation
  useEffect(() => {
    startTimeRef.current = Date.now()
    let running = true

    const updateProgress = () => {
      if (!running) return
      if (!pausedRef.current) {
        const elapsed = Date.now() - startTimeRef.current
        const remaining = Math.max(0, 100 - (elapsed / DISPLAY_DURATION) * 100)
        setProgress(remaining)
        if (remaining <= 0) {
          doDismiss()
          return
        }
      }
      rafRef.current = requestAnimationFrame(updateProgress)
    }

    rafRef.current = requestAnimationFrame(updateProgress)

    // Backup timeout
    dismissTimerRef.current = setTimeout(doDismiss, DISPLAY_DURATION + 100)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [toast.id, doDismiss])

  const handleMouseEnter = () => {
    pausedRef.current = true
    // Pause: adjust start time so progress doesn't jump
    startTimeRef.current = Date.now() - (DISPLAY_DURATION * (100 - progress)) / 100
  }

  const handleMouseLeave = () => {
    pausedRef.current = false
    startTimeRef.current = Date.now()
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={[
        'pointer-events-auto overflow-hidden rounded-xl chrome-elevated elevated-4',
        'transition-all duration-[250ms] ease-spring',
        'max-w-sm w-[360px]',
        visible && !exiting
          ? 'translate-x-0 opacity-100'
          : exiting
            ? 'translate-x-full opacity-0'
            : 'translate-x-8 opacity-0',
      ].join(' ')}
      style={{
        marginTop: index > 0 ? `${index * 8}px` : undefined,
        zIndex: 1000 - index,
      }}
      role="alert"
    >
      {/* Progress hairline */}
      <div className="relative h-0.5 w-full bg-surface-muted overflow-hidden">
        <div
          className={[
            'absolute left-0 top-0 h-full transition-none',
            toast.type === 'success' ? 'bg-success' : toast.type === 'warning' ? 'bg-warning' : 'bg-error',
          ].join(' ')}
          style={{
            width: `${progress}%`,
            transition: pausedRef.current ? 'none' : undefined,
          }}
        />
      </div>

      {/* Content */}
      <div className="flex items-start gap-3 px-4 pb-3 pt-2.5">
        <cfg.icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.iconColor}`} aria-hidden="true" />
        <p className="flex-1 text-label text-text leading-snug">{toast.message}</p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            doDismiss()
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 ease-out hover:bg-surface-subtle hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Global toast state (static store) ──────────

let toastListeners: Array<(toasts: ToastMessage[]) => void> = []
let toastState: ToastMessage[] = []
let toastCounter = 0

function notify() {
  toastListeners.forEach((fn) => fn([...toastState]))
}

export function showToast(type: ToastType, message: string) {
  const id = `toast-${++toastCounter}`
  toastState = [...toastState, { id, type, message }]
  notify()
}

function dismissToast(id: string) {
  toastState = toastState.filter((t) => t.id !== id)
  notify()
}

// ── Container ──────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    toastListeners.push(setToasts)
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== setToasts)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-toast flex flex-col items-end gap-0"
      aria-live="polite"
    >
      {toasts.map((t, i) => (
        <ToastItem key={t.id} toast={t} index={i} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
