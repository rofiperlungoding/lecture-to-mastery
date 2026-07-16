import { useState, useEffect } from 'react'
import { createRoute, Link } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import {
  ArrowDownToLine,
  Trash2,
  Shield,
  AlertTriangle,
  LogOut,
  BarChart3,
  User,
  Bell,
  Loader2,
  AtSign,
  Globe,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  hasActiveSubscription,
  getMyProfile,
  updateProfile,
  checkUsernameAvailability,
  fetchUserSettings,
  upsertUserSettings,
} from '../lib/api'
import { PageContainer } from '../components/PageContainer'

function SettingsPage() {
  const { user, signOut, loading } = useAuthStore()
  const isAnonymous = user?.is_anonymous ?? false
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // ── Profile state ──────────────────────────────────────────────────────
  const [profileLoading, setProfileLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameReason, setUsernameReason] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [dailyGoalChanged, setDailyGoalChanged] = useState(false)

  // Notification state
  const pushSupported = isPushSupported()
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifInitialized, setNotifInitialized] = useState(false)

  useEffect(() => {
    if (!pushSupported) {
      setNotifInitialized(true)
      return
    }
    const check = async () => {
      const hasSub = await hasActiveSubscription()
      const perm = getNotificationPermission()
      setNotifEnabled(hasSub && perm === 'granted')
      setNotifInitialized(true)
    }
    check()
  }, [pushSupported])

  // ── Fetch profile on mount ────────────────────────────────────────────
  useEffect(() => {
    getMyProfile().then((p) => {
      if (p) {
        setDisplayName(p.display_name || '')
        setBio(p.bio || '')
        setUsername(p.username || '')
        setUsernameSaved(p.username || '')
        setIsPublic(p.is_public)
      }
    }).catch(() => {}).finally(() => setProfileLoading(false))

    fetchUserSettings().then((s) => {
      if (s) {
        setDailyGoal(s.daily_goal)
      }
    }).catch(() => {})
  }, [])

  // ── Handle username availability check ─────────────────────────────────
  useEffect(() => {
    if (!username || username === usernameSaved || username.length < 3) {
      setUsernameStatus('idle')
      setUsernameReason('')
      return
    }
    const timer = setTimeout(async () => {
      setUsernameStatus('checking')
      const result = await checkUsernameAvailability(username)
      setUsernameStatus(result.available ? 'available' : 'taken')
      setUsernameReason(result.reason || '')
    }, 400)
    return () => clearTimeout(timer)
  }, [username, usernameSaved])

  const displayNameFallback = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Guest'

  const email = user?.email || ''
  const initials = displayNameFallback
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.href = '/login'
    } catch {
      showToast('error', 'Failed to sign out')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const [documents, chunks, flashcards, quizQuestions] = await Promise.all([
        supabase.from('documents').select('*'),
        supabase.from('chunks').select('id, document_id, content, chunk_index'),
        supabase.from('flashcards').select('id, document_id, front, back'),
        supabase.from('quiz_questions').select('id, document_id, question, options, correct_index, explanation'),
      ])

      const payload = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user?.id,
          email: user?.email,
          isAnonymous,
        },
        documents: documents.data ?? [],
        chunks: chunks.data ?? [],
        flashcards: flashcards.data ?? [],
        quizQuestions: quizQuestions.data ?? [],
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lecture-to-mastery-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('success', 'Data exported successfully')
    } catch (err) {
      showToast('error', `Export failed: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', {})
      if (error) throw new Error(error.message)
      await signOut()
      showToast('success', 'Account and all data deleted')
      window.location.href = '/login'
    } catch (err) {
      showToast('error', `Deletion failed: ${(err as Error).message}`)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <PageContainer className="py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-pageTitle text-text mb-8">Settings</h1>

        {/* Profile Section */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <User className="h-5 w-5 text-brand-500" />
            </div>
            <h2 className="text-h3 text-text">Profile</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-label font-bold text-brand-700">
              {initials || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold text-text">{displayName}</p>
              {email && <p className="text-small text-text-muted">{email}</p>}
              {isAnonymous && <p className="text-small text-text-muted">Guest account</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={handleSignOut} isLoading={loading} leadingIcon={<LogOut className="h-4 w-4" />}>
              Sign out
            </Button>
            <Link to="/progress" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-small font-medium text-text-secondary hover:bg-bg-muted transition-colors duration-150">
              <BarChart3 className="h-4 w-4" />
              View progress
            </Link>
          </div>

          {/* Username / display name / bio form */}
          {!profileLoading && (
            <div className="mt-5 space-y-4 border-t border-border pt-5">
              {/* Username */}
              <div>
                <label htmlFor="username" className="mb-1.5 flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <AtSign className="h-3.5 w-3.5" />
                  Username
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))}
                    placeholder="your-username"
                    className="w-full rounded-lg border border-border px-3 py-2 pr-10 text-body text-text placeholder-text-muted transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {usernameStatus === 'taken' && <XCircle className="h-4 w-4 text-rose-500" />}
                  </span>
                </div>
                {usernameStatus === 'available' && (
                  <p className="mt-1 text-footnote text-emerald-600">Username available!</p>
                )}
                {usernameStatus === 'taken' && (
                  <p className="mt-1 text-footnote text-rose-600">{usernameReason}</p>
                )}
                {usernameStatus === 'idle' && !username && (
                  <p className="mt-1 text-footnote text-text-muted">3-30 characters, letters/numbers/underscores, must start with a letter</p>
                )}
              </div>

              {/* Display name */}
              <div>
                <label htmlFor="displayName" className="mb-1.5 text-caption font-medium text-text-secondary">Display name</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 100))}
                  placeholder="Your display name"
                  className="w-full rounded-lg border border-border px-3 py-2 text-body text-text placeholder-text-muted transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {/* Bio */}
              <div>
                <label htmlFor="bio" className="mb-1.5 text-caption font-medium text-text-secondary">Bio</label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  placeholder="A short description about yourself"
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2 text-body text-text placeholder-text-muted transition-colors resize-none focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              {/* Save button */}
              <div className="flex gap-3">
                <Button
                  size="sm"
                  onClick={async () => {
                    setSaving(true)
                    try {
                      await updateProfile({
                        username: username || null,
                        display_name: displayName || null,
                        bio: bio || null,
                        is_public: isPublic,
                      })
                      setUsernameSaved(username)
                      showToast('success', 'Profile saved!')
                    } catch (err) {
                      showToast('error', `Failed to save: ${(err as Error).message}`)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  isLoading={saving}
                  disabled={saving || usernameStatus === 'taken' || (username !== usernameSaved && usernameStatus !== 'available' && username.length >= 3)}
                >
                  Save profile
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Notifications Section */}
        {pushSupported && (
          <Card padding="lg" className="mb-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                <Bell className="h-5 w-5 text-brand-500" />
              </div>
              <h2 className="text-h3 text-text">Notifications</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-label font-medium text-text">Daily review reminder</p>
                  <p className="text-small text-text-secondary mt-0.5">
                    Get a notification when flashcards are due for review.
                  </p>
                </div>
                {!notifInitialized ? (
                  <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                ) : (
                  <button
                    onClick={async () => {
                      setNotifLoading(true)
                      try {
                        if (notifEnabled) {
                          const ok = await unsubscribeFromPush()
                          if (ok) {
                            setNotifEnabled(false)
                            showToast('success', 'Notifications disabled')
                          } else {
                            showToast('error', 'Failed to unsubscribe')
                          }
                        } else {
                          const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
                          if (!vapidKey) {
                            showToast('error', 'Notifications not configured yet — set VITE_VAPID_PUBLIC_KEY in your environment')
                            return
                          }
                          // Request permission first
                          const perm = await Notification.requestPermission()
                          if (perm !== 'granted') {
                            showToast('error', 'Notification permission denied. Enable it in your browser settings.')
                            return
                          }
                          const ok = await subscribeToPush(vapidKey)
                          if (ok) {
                            setNotifEnabled(true)
                            showToast('success', 'Notifications enabled! You\'ll get reminders for due cards.')
                          } else {
                            showToast('error', 'Failed to subscribe to push notifications')
                          }
                        }
                      } catch (err) {
                        showToast('error', `Notification setup failed: ${(err as Error).message}`)
                      } finally {
                        setNotifLoading(false)
                      }
                    }}
                    disabled={notifLoading || !notifInitialized}
                    className={`relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                      notifEnabled ? 'bg-brand-500' : 'bg-surface-muted'
                    }`}
                    role="switch"
                    aria-checked={notifEnabled}
                    aria-label="Toggle daily review reminders"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-standard ${
                        notifEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                )}
              </div>
              {!notifInitialized && (
                <p className="text-small text-text-muted">Checking notification status...</p>
              )}
              {getNotificationPermission() === 'denied' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-small text-amber-800">
                  <p className="font-medium">Notifications are blocked in your browser settings.</p>
                  <p className="mt-0.5">
                    Enable them in your browser's site settings to receive daily review reminders.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Study Preferences Section */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-h3 text-text">Study Preferences</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label font-medium text-text">Daily review goal</p>
                <p className="text-small text-text-secondary mt-0.5">
                  Number of flashcards to review each day.
                </p>
              </div>
              <input
                type="number"
                min={5}
                max={100}
                value={dailyGoal}
                onChange={(e) => {
                  const val = Math.max(5, Math.min(100, parseInt(e.target.value) || 20))
                  setDailyGoal(val)
                  setDailyGoalChanged(true)
                }}
                className="w-20 rounded-lg border border-border px-3 py-2 text-body text-text text-center tabular-nums transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            {dailyGoalChanged && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await upsertUserSettings({ daily_goal: dailyGoal })
                      setDailyGoalChanged(false)
                      showToast('success', 'Daily goal saved!')
                    } catch (err) {
                      showToast('error', `Failed to save: ${(err as Error).message}`)
                    }
                  }}
                >
                  Save goal
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Privacy & Data Section */}
        <div className="space-y-6">
          {/* What we store */}
          <Card padding="lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                <Shield className="h-5 w-5 text-brand-500" />
              </div>
              <h2 className="text-h3 text-text">Privacy & Data</h2>
            </div>

            {/* Public profile toggle */}
            {!profileLoading && (
              <div className="mb-5 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Globe className={`h-5 w-5 mt-0.5 ${isPublic ? 'text-brand-500' : 'text-text-muted'}`} />
                    <div>
                      <p className="text-label font-medium text-text">
                        Public profile
                      </p>
                      <p className="mt-0.5 text-small text-text-secondary">
                        {isPublic
                          ? 'Your profile and aggregate study stats are visible to anyone.'
                          : 'Your profile is private. Only you can see it.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!isPublic) {
                        // Show explanation before enabling
                        showToast('success', 'Toggle on to see what becomes visible')
                      }
                      setIsPublic(!isPublic)
                      setShowPrivacyInfo(!isPublic)
                    }}
                    className={`relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
                      isPublic ? 'bg-brand-500' : 'bg-surface-muted'
                    }`}
                    role="switch"
                    aria-checked={isPublic}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isPublic ? 'translate-x-[22px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </button>
                </div>

                {/* Explanation of what becomes visible */}
                {showPrivacyInfo && isPublic && (
                  <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-small">
                    <p className="font-medium text-brand-800 mb-2">When public, others can see:</p>
                    <ul className="space-y-1 text-brand-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Your username, display name, bio, and avatar</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Total documents studied (count only — no titles or content)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Current study streak</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Total cards reviewed</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Average mastery score</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Achievements unlocked</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Join date</span>
                      </li>
                    </ul>
                    <div className="mt-3 border-t border-brand-200 pt-2">
                      <p className="font-medium text-brand-800">Never visible publicly:</p>
                      <ul className="space-y-0.5 text-brand-600 mt-1">
                        <li>✗ Document titles, content, or source URLs</li>
                        <li>✗ Email address</li>
                        <li>✗ Individual study events or chat queries</li>
                        <li>✗ Raw flashcard or quiz content</li>
                        <li>✗ Any data not explicitly listed above</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4 text-body text-text-secondary leading-relaxed">
              <p>
                <strong className="text-text">What we store:</strong> Your documents, their
                text content, AI-generated summaries, flashcards, and quiz questions. We store
                only what is needed to power your study experience.
              </p>
              <p>
                <strong className="text-text">Privacy by design:</strong> Every document and
                study item is private to your account. No other user can view your materials.
                All data is scoped by Row-Level Security at the database level.
              </p>
              <p>
                <strong className="text-text">AI processing:</strong> When you upload a
                document, its text content is sent to Mistral AI's API for embedding,
                summarization, flashcard generation, quiz generation, and Q&A. Your data
                is not used to train Mistral's models.
              </p>
              {isAnonymous && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-small text-amber-800">
                  <p className="font-medium">Guest mode — data is ephemeral</p>
                  <p className="mt-1">
                    Your current session is anonymous. If you clear your browser data or sign
                    out, you will lose access to this account.{' '}
                    <button
                      onClick={() => { window.location.href = '/login' }}
                      className="font-medium underline underline-offset-2 hover:text-amber-900"
                    >
                      Sign in
                    </button>{' '}
                    with email to keep your work permanently.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Export Data */}
          <Card padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-label font-semibold text-text">Export my data</h3>
                <p className="mt-1 text-small text-text-secondary">
                  Download all your documents, flashcards, quiz questions, and study data
                  as a JSON file. Vectors are excluded from the export.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                isLoading={exporting}
                disabled={exporting}
                leadingIcon={!exporting ? <ArrowDownToLine className="h-4 w-4" /> : undefined}
              >
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            </div>
          </Card>

          {/* Delete Account */}
          <Card variant="outlined" padding="lg" className="border-rose-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-rose-500" />
                  <h3 className="text-label font-semibold text-rose-700">Delete account</h3>
                </div>
                <p className="mt-1 text-small text-text-secondary">
                  Permanently delete your account and all associated data. This action is
                  irreversible — your documents, flashcards, quiz results, and study
                  progress will be removed immediately.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-label font-semibold text-text">Delete account?</h3>
                  <p className="text-small text-text-muted">This cannot be undone</p>
                </div>
              </div>
              <p className="mb-6 text-body text-text-secondary">
                All your documents, flashcards, quiz results, and study data will be
                permanently removed from our servers. Your account will be deleted and
                you will not be able to log in again.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleting(false)
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  isLoading={deleting}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete my account'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/settings',
  component: SettingsPage,
})
