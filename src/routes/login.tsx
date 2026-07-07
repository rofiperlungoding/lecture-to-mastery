import { useState } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAuthStore } from '../stores/useAuthStore'
import { Button } from '../components/Button'

type Tab = 'signin' | 'signup'

function LoginPage() {
  const navigate = useNavigate()
  const { signUp, signInWithPassword, signInAnonymously, loading, error, clearError } = useAuthStore()

  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const displayError = error || localError
  const passwordError = password.length > 0 && password.length < 6 ? 'Password must be at least 6 characters' : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (password.length < 6) return

    setLocalError(null)
    clearError()

    try {
      if (tab === 'signup') {
        await signUp(email.trim(), password)
        navigate({ to: '/' })
      } else {
        await signInWithPassword(email.trim(), password)
        navigate({ to: '/' })
      }
    } catch (err) {
      const msg = (err as { message?: string }).message || 'Something went wrong'
      setLocalError(msg)
    }
  }

  const handleGuest = async () => {
    setLocalError(null)
    clearError()
    try {
      await signInAnonymously()
      navigate({ to: '/' })
    } catch (err) {
      const msg = (err as { message?: string }).message || 'Failed to start guest session'
      setLocalError(msg)
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setLocalError(null)
    clearError()
    setEmail('')
    setPassword('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-500 shadow-md">
            <span className="text-h2 font-bold text-white">L</span>
          </div>
          <h1 className="text-pageTitle text-text">Lecture-to-Mastery</h1>
          <p className="mt-1 text-body text-text-secondary">
            {tab === 'signin' ? 'Welcome back' : 'Start your learning journey'}
          </p>
        </div>

        {/* Error banner */}
        {displayError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-small text-rose-700">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{displayError}</span>
              <button
                onClick={() => { clearError(); setLocalError(null) }}
                className="shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-caption font-medium text-rose-800 hover:bg-rose-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Auth card */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm ring-1 ring-black/5">
          {/* Tabs */}
          <div className="mb-6 flex rounded-lg bg-surface p-1">
            <button
              onClick={() => switchTab('signin')}
              className={`flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors duration-150 ${
                tab === 'signin'
                  ? 'bg-white text-text shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => switchTab('signup')}
              className={`flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors duration-150 ${
                tab === 'signup'
                  ? 'bg-white text-text shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-label font-medium text-text-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
                autoComplete={tab === 'signup' ? 'email' : 'username'}
                className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-body text-text placeholder-text-muted transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-label font-medium text-text-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                disabled={loading}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-body text-text placeholder-text-muted transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {passwordError && (
                <p className="mt-1 text-caption text-rose-500">{passwordError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="md"
              isLoading={loading}
              disabled={loading || !email.trim() || !password || password.length < 6}
            >
              {tab === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        {/* Guest mode */}
        <div className="mt-4 text-center">
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={handleGuest}
            isLoading={loading}
          >
            Try as guest
          </Button>
        </div>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/login',
  component: LoginPage,
})
