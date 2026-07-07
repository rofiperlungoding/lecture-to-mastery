import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle } from 'lucide-react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  message: string
}

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 300)
    }, 4000)

    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className={`pointer-events-auto overflow-hidden rounded-lg border border-border bg-white shadow-md transition-all duration-200 ease-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <div className="flex items-stretch">
        {/* Status accent bar */}
        <div
          className={`w-1.5 shrink-0 ${
            toast.type === 'success' ? 'bg-success' : 'bg-error'
          }`}
        />
        {/* Content */}
        <div className="flex items-center gap-3 px-4 py-3">
          {toast.type === 'success' ? (
            <CheckCircle className="h-5 w-5 shrink-0 text-success" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-error" />
          )}
          <span className="flex-1 text-label text-text">{toast.message}</span>
          <button
            onClick={() => {
              setVisible(false)
              setTimeout(() => onDismiss(toast.id), 300)
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 ease-out hover:bg-bg-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

let toastListeners: Array<(toasts: ToastMessage[]) => void> = []
let toastState: ToastMessage[] = []
let toastCounter = 0

function notify() {
  toastListeners.forEach((fn) => fn([...toastState]))
}

export function showToast(type: 'success' | 'error', message: string) {
  const id = `toast-${++toastCounter}`
  toastState = [...toastState, { id, type, message }]
  notify()
}

function dismissToast(id: string) {
  toastState = toastState.filter((t) => t.id !== id)
  notify()
}

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
    <div      className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2"
        aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  )
}
