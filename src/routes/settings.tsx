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
  ChevronRight,
  Target,
  Moon,
  Sun,
  Eye,
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

  const [profileLoading, setProfileLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameReason, setUsernameReason] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [dailyGoalChanged, setDailyGoalChanged] = useState(false)

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
    <PageContainer className="animate-page-enter py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-pageTitle text-text mb-8">Settings</h1>

        {/* Profile Section */}
        <Card padding="lg" className="mb-6 card-lift-hover relative overflow-hidden">
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 text-label font-bold text-white shadow-md">
                {initials || '?'}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-title-3 font-semibold text-text">{displayNameFallback}</p>
              {email && <p className="text-body text-text-secondary mt-0.5">{email}</p>}
              {isAnonymous && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-small font-medium text-amber-700">
                  Guest account
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleSignOut} isLoading={loading} leadingIcon={<LogOut className="h-4 w-4" />}>
              Sign out
            </Button>
            <Link to="/progress" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-small font-medium text-text-secondary transition-all duration-150 hover:bg-surface-subtle hover:text-text hover:border-border-strong">
              <BarChart3 className="h-4 w-4" />
              View progress
            </Link>
          </div>

          {!profileLoading && (
            <div className="mt-6 space-y-5 border-t border-border pt-6">
              <div>
                <label htmlFor="username" className="mb-1.5 flex items-center gap-1.5 text-footnote font-medium text-text-secondary">
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
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-body text-text placeholder-text-muted transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {usernameStatus === 'taken' && <XCircle className="h-4 w-4 text-rose-500" />}
                  </span>
                </div>
                {usernameStatus === 'available' && (
                  <p className="mt-1 text-smallest text-emerald-600">Username available!</p>
                )}
                {usernameStatus === 'taken' && (
                  <p className="mt-1 text-smallest text-rose-600">{usernameReason}</p>
                )}
                {usernameStatus === 'idle' && !username && (
                  <p className="mt-1 text-smallest text-text-muted">3-30 characters, letters/numbers/underscores</p>
                )}
              </div>

              <div>
                <label htmlFor="displayName" className="mb-1.5 text-footnote font-medium text-text-secondary">Display name</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 100))}
                  placeholder="Your display name"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-body text-text placeholder-text-muted transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label htmlFor="bio" className="mb-1.5 text-footnote font-medium text-text-secondary">Bio</label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  placeholder="A short description about yourself"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-body text-text placeholder-text-muted transition-all duration-150 resize-none focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-surface-muted/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-text-muted" />
                  <span className="text-small font-medium text-text">Public profile</span>
                </div>
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isPublic ? 'bg-brand-500' : 'bg-surface-muted'}`}
                  aria-label={isPublic ? 'Set profile to private' : 'Set profile to public'}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPublic ? 'translate-x-5' : ''}`} />
                </button>
              </div>

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
                  disabled={saving || usernameStatus === 'taken'}
                >
                  Save profile
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Study Settings */}
        <Card padding="lg" className="mb-6 card-lift-hover">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-500/5">
              <Target className="h-5 w-5 text-brand-500" />
            </div>
            <h2 className="text-title-3 text-text">Study Settings</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label font-medium text-text">Daily review goal</p>
                <p className="text-small text-text-secondary">How many flashcards to review each day</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setDailyGoal(Math.max(5, dailyGoal - 5)); setDailyGoalChanged(true); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-subtle"
                  aria-label="Decrease daily goal"
                >
                  -
                </button>
                <span className="w-10 text-center text-label font-semibold text-text tabular-nums">{dailyGoal}</span>
                <button
                  onClick={() => { setDailyGoal(Math.min(100, dailyGoal + 5)); setDailyGoalChanged(true); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-subtle"
                  aria-label="Increase daily goal"
                >
                  +
                </button>
              </div>
            </div>

            {dailyGoalChanged && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await upsertUserSettings({ daily_goal: dailyGoal })
                      setDailyGoalChanged(false)
                      showToast('success', `Daily goal set to ${dailyGoal}`)
                    } catch (err) {
                      showToast('error', `Failed: ${(err as Error).message}`)
                    }
                  }}
                >
                  Save goal
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Notifications */}
        {pushSupported && notifInitialized && (
          <Card padding="lg" className="mb-6 card-lift-hover">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5">
                <Bell className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="text-title-3 text-text">Notifications</h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-label font-medium text-text">Review reminders</p>
                <p className="text-small text-text-secondary">Get notified when flashcards are due</p>
              </div>
              <button
                onClick={async () => {
                  setNotifLoading(true)
                  try {
                    if (notifEnabled) {
                      await unsubscribeFromPush()
                      setNotifEnabled(false)
                      showToast('success', 'Notifications disabled')
                    } else {
                      const ok = await subscribeToPush()
                      if (ok) {
                        setNotifEnabled(true)
                        showToast('success', 'Notifications enabled')
                      } else {
                        showToast('error', 'Notification permission denied')
                      }
                    }
                  } catch (err) {
                    showToast('error', `Failed: ${(err as Error).message}`)
                  } finally {
                    setNotifLoading(false)
                  }
                }}
                disabled={notifLoading}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${notifEnabled ? 'bg-brand-500' : 'bg-surface-muted'} disabled:opacity-50`}
                aria-label={notifEnabled ? 'Disable notifications' : 'Enable notifications'}
              >
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${notifEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </Card>
        )}

        {/* Privacy & Data */}
        <Card padding="lg" className="mb-6 card-lift-hover">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5">
              <Shield className="h-5 w-5 text-violet-500" />
            </div>
            <h2 className="text-title-3 text-text">Privacy & Data</h2>
          </div>

          <div className="space-y-3 mb-5">
            <p className="text-small text-text-secondary leading-relaxed">
              Your documents, flashcards, and study data are private to your account. 
              Content is sent to Mistral AI for processing (summaries, flashcards, quiz generation, and RAG). 
              We do not share your data with third parties beyond what is necessary for the AI features.
            </p>
            {isAnonymous && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-small text-amber-800">
                <p className="font-medium mb-0.5">Guest account data is ephemeral</p>
                <p>Sign in with email to keep your study data permanently.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-all duration-150 hover:border-border-strong">
              <div className="flex items-center gap-3">
                <ArrowDownToLine className="h-4 w-4 text-text-muted" />
                <div>
                  <p className="text-label font-medium text-text">Export my data</p>
                  <p className="text-smallest text-text-secondary">Downloads all your data as JSON</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={handleExport} isLoading={exporting} disabled={exporting}>
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-all duration-150 hover:border-border-strong">
              <div className="flex items-center gap-3">
                <Trash2 className="h-4 w-4 text-rose-400" />
                <div>
                  <p className="text-label font-medium text-text">Delete account</p>
                  <p className="text-smallest text-text-secondary">Permanently remove all data</p>
                </div>
              </div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDeleteAccount} isLoading={deleting} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Confirm delete'}
                  </Button>
                </div>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>
                  <AlertTriangle className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/settings',
  component: SettingsPage,
})
