import { useState, useEffect } from 'react'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAuthStore } from '../stores/useAuthStore'
import { Button } from '../components/Button'
import { Wordmark } from '../components/Wordmark'
import { Input } from '../components/Input'
import { Mail, Lock, Sparkles, ArrowRight, BookOpen, Zap, Target, GraduationCap } from 'lucide-react'

type AuthTab = 'password' | 'magiclink'

const BENEFITS = [
  { icon: BookOpen, text: 'AI-powered summaries' },
  { icon: Zap, text: 'Smart flashcards & spaced repetition' },
  { icon: Target, text: 'Personalized quizzes & practice' },
]

const BTN_PRIMARY_CLASS =
  'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm'

function LoginPage() {
  const navigate = useNavigate()
  const {
    signUp,
    signInWithPassword,
    signInWithOtp,
    signInAnonymously,
    loading,
    error,
    magicLinkSent,
    clearError,
    resetMagicLinkSent,
  } = useAuthStore()

  const [tab, setTab] = useState<AuthTab>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    resetMagicLinkSent()
    setLocalError(null)
    clearError()
  }, [tab, resetMagicLinkSent, clearError])

  const displayError = error || localError
  const passwordError =
    password.length > 0 && password.length < 6
      ? 'Password must be at least 6 characters'
      : null

  const canSubmit =
    !loading && email.trim().length > 0 &&
    (tab === 'magiclink' || (password.length >= 6))

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLocalError(null)
    clearError()
    try {
      await signInWithOtp(email.trim())
    } catch (err) {
      setLocalError((err as { message?: string }).message || 'Failed to send magic link')
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (password.length < 6) return
    setLocalError(null)
    clearError()
    try {
      if (isSignUp) {
        await signUp(email.trim(), password)
        navigate({ to: '/' })
      } else {
        await signInWithPassword(email.trim(), password)
        navigate({ to: '/' })
      }
    } catch (err) {
      setLocalError((err as { message?: string }).message || 'Something went wrong')
    }
  }

  const handleGuest = async () => {
    setLocalError(null)
    clearError()
    try {
      await signInAnonymously()
      navigate({ to: '/' })
    } catch (err) {
      setLocalError((err as { message?: string }).message || 'Failed to start guest session')
    }
  }

  if (magicLinkSent) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-sm text-center animate-scale-in">
          <div className="mb-8 flex flex-col items-center">
            <Wordmark size="md" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-8 shadow-sm ring-1 ring-black/5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950/20">
              <Mail className="h-7 w-7 text-brand-500" />
            </div>
            <h2 className="mt-4 text-title-2 text-text">Check your email</h2>
            <p className="mt-2 text-body text-text-secondary leading-relaxed">
              We sent a magic sign-in link to{' '}
              <span className="font-medium text-text">{email}</span>
            </p>
            <p className="mt-1 text-small text-text-muted">
              No account? A new one will be created automatically when you click the link.
            </p>
            <div className="mt-6 space-y-3">
              <Button
                variant="secondary"
                className="w-full"
                size="md"
                onClick={() => resetMagicLinkSent()}
              >
                Use a different email
              </Button>
              <button
                onClick={handleMagicLink}
                disabled={loading}
                className="text-small text-brand-500 hover:text-brand-600 underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
              >
                {loading ? 'Resending...' : 'Resend link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] bg-canvas">
      {/* ─── Left Panel: Brand & Value Prop ─── */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-800 p-12 xl:p-16">
        {/* Decorative mesh gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.08),transparent_50%)] pointer-events-none" />

        {/* Subtle floating decorative elements */}
        <div className="absolute top-1/4 right-8 opacity-[0.08]">
          <GraduationCap className="h-32 w-32 text-white" />
        </div>
        <div className="absolute bottom-1/3 left-8 opacity-[0.06]">
          <BookOpen className="h-24 w-24 text-white" />
        </div>
        <div className="absolute top-1/3 left-1/3 opacity-[0.04]">
          <Sparkles className="h-16 w-16 text-white" />
        </div>

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm text-white shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-label font-semibold text-white/90">Lecture-to-Mastery</span>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-display text-white font-semibold leading-tight text-balance">
            Turn lectures into mastery
          </h1>
          <p className="mt-4 text-title-3 text-white/80 leading-relaxed max-w-sm text-pretty">
            Upload any lecture material and get AI-powered summaries, flashcards, quizzes, and interactive study tools.
          </p>

          <div className="mt-10 space-y-4">
            {BENEFITS.map((benefit, i) => (
              <div
                key={i}
                className="flex items-center gap-4 animate-fade-in"
                style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'both' }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm text-white">
                  <benefit.icon className="h-4 w-4" />
                </div>
                <span className="text-body text-white/85 font-medium">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-small text-white/40">
            Built with Supabase, Mistral AI &middot; Free for students
          </p>
        </div>
      </div>

      {/* ─── Right Panel: Auth Form ─── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 lg:p-12 xl:p-16">
        <div className="w-full max-w-sm animate-scale-in">
          {/* Mobile wordmark */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Wordmark size="md" />
            <p className="mt-2 text-body text-text-secondary">
              Turn lectures into mastery
            </p>
          </div>

          {/* Desktop wordmark (hidden on mobile) */}
          <div className="hidden lg:flex lg:mb-10">
            <Wordmark size="sm" />
          </div>

          {/* Error banner */}
          {displayError && (
            <div className="mb-5 animate-slide-up rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-small text-rose-700 dark:text-rose-400">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{displayError}</span>
                <button
                  onClick={() => { clearError(); setLocalError(null) }}
                  className="shrink-0 rounded-md bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 text-caption font-medium text-rose-800 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Auth card */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm ring-1 ring-black/5">
            {/* Tab switcher */}
            <div className="mb-6 flex rounded-lg bg-surface-subtle p-1">
              <button
                onClick={() => { setTab('password'); setLocalError(null); clearError() }}
                className={`flex-1 rounded-md px-4 py-2 text-label font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  tab === 'password'
                    ? 'bg-surface-elevated text-text shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Password
              </button>
              <button
                onClick={() => { setTab('magiclink'); setLocalError(null); clearError() }}
                className={`flex-1 rounded-md px-4 py-2 text-label font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  tab === 'magiclink'
                    ? 'bg-surface-elevated text-text shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                Magic Link
              </button>
            </div>

            {/* Animated form wrapper */}
            <div className="transition-all duration-300 ease-standard">
              {tab === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-3">
                    <Input
                      label="Email"
                      id="email-pw"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      disabled={loading}
                      autoComplete={isSignUp ? 'email' : 'username'}
                    />

                    <Input
                      label="Password"
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      disabled={loading}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      error={passwordError || undefined}
                    />
                  </div>

                  <Button
                    type="submit"
                    className={`w-full ${BTN_PRIMARY_CLASS}`}
                    size="md"
                    isLoading={loading}
                    disabled={!canSubmit}
                    leadingIcon={!loading ? <Lock className="h-4 w-4" /> : undefined}
                  >
                    {isSignUp ? 'Create account' : 'Sign in'}
                  </Button>

                  <p className="text-center text-small text-text-secondary">
                    {isSignUp ? (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => { setIsSignUp(false); setLocalError(null); clearError() }}
                          className="font-medium text-brand-500 hover:text-brand-600 underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          Sign in
                        </button>
                      </>
                    ) : (
                      <>
                        Don't have an account?{' '}
                        <button
                          type="button"
                          onClick={() => { setIsSignUp(true); setLocalError(null); clearError() }}
                          className="font-medium text-brand-500 hover:text-brand-600 underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                        >
                          Create one
                        </button>
                      </>
                    )}
                  </p>
                </form>
              )}

              {tab === 'magiclink' && (
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <p className="text-small text-text-secondary leading-relaxed">
                    Enter your email and we'll send you a sign-in link. No password needed.
                  </p>
                  <Input
                    label="Email"
                    id="email-ml"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                  <Button
                    type="submit"
                    className={`w-full ${BTN_PRIMARY_CLASS}`}
                    size="md"
                    isLoading={loading}
                    disabled={!canSubmit}
                    leadingIcon={!loading ? <Mail className="h-4 w-4" /> : undefined}
                  >
                    Send magic link
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* Guest mode */}
          <div className="mt-4 relative">
            <div className="absolute inset-x-0 top-0 flex items-center">
              <div className="flex-1 border-t border-border-hairline" />
            </div>
            <div className="relative flex justify-center">
              <Button
                variant="ghost"
                size="md"
                className="w-full"
                onClick={handleGuest}
                isLoading={loading}
                leadingIcon={<Sparkles className="h-4 w-4 text-brand-500" />}
              >
                Try as guest - no account needed
              </Button>
            </div>
          </div>
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
