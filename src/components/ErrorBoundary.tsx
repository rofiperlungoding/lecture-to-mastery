import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { logClientError } from '../lib/errorMonitor'

export interface ErrorBoundaryProps {
  children: ReactNode
  context?: string
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode)
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

const fallbackStyles = {
  container:
    'flex items-center justify-center p-8 min-h-[200px]',
  card:
    'w-full max-w-md rounded-xl border border-border bg-surface-elevated p-6 shadow-sm text-center',
  icon:
    'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle',
  iconInner: 'h-6 w-6 text-danger',
  title: 'mt-4 text-title-3 font-semibold text-text',
  message:
    'mt-2 text-body text-text-secondary leading-relaxed max-w-sm mx-auto',
  actions: 'mt-6 flex items-center justify-center gap-3',
  retryBtn:
    'inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-label font-medium text-white transition-colors duration-150 hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
} as const

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logClientError(error, this.props.context ?? 'ErrorBoundary')

    if (import.meta.env.DEV) {
      console.group(`%c[ErrorBoundary] %c${this.props.context ?? 'unknown'}`, 'color: #ef4444; font-weight: bold', 'color: inherit')
      console.error('Error:', error)
      console.error('Component stack:', errorInfo.componentStack)
      console.groupEnd()
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error!, this.handleRetry)
        }
        return this.props.fallback
      }

      return (
        <div className={fallbackStyles.container} role="alert">
          <div className={fallbackStyles.card}>
            <div className={fallbackStyles.icon}>
              <AlertTriangle className={fallbackStyles.iconInner} aria-hidden="true" />
            </div>
            <h2 className={fallbackStyles.title}>Something went wrong</h2>
            <p className={fallbackStyles.message}>
              {this.props.context
                ? `The "${this.props.context}" section encountered an unexpected error.`
                : 'An unexpected error occurred. Please try again.'}
            </p>
            <div className={fallbackStyles.actions}>
              <button
                onClick={this.handleRetry}
                className={fallbackStyles.retryBtn}
                aria-label="Retry — reload this section"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
