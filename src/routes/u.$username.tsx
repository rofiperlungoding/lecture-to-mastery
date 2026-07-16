import { useState, useEffect } from 'react'
import { createRoute, Link, useParams, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { getPublicProfile, getMyProfile, updateProfile } from '../lib/api'
import { MasteryRing } from '../components/Charts'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { showToast } from '../components/Toast'
import {
  Flame,
  BookOpen,
  Award,
  CalendarDays,
  Trophy,
  Settings,
  Globe,
  Eye,
  ChevronLeft,
  Share2,
} from 'lucide-react'
import type { PublicProfileStats } from '../types/db'
import { ACHIEVEMENT_DEFS } from '../types/db'

// ═══════════════════════════════════════════════════════════════════════════
// Profile Page Components
// ═══════════════════════════════════════════════════════════════════════════

function ProfilePage() {
  const { username } = useParams({ from: '/u/$username' })
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfileStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Owner controls state ──────────────────────────────────────────────
  const [isOwner, setIsOwner] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  // ── Fetch profile data ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getPublicProfile(username)
        if (cancelled) return

        if (!data) {
          setError('not_found')
          setLoading(false)
          return
        }

        setProfile(data)
        setIsPublic(true) // If we got data, it's public

        // Check if current user owns this profile
        const myProfile = await getMyProfile()
        if (!cancelled && myProfile && myProfile.username === username) {
          setIsOwner(true)
          setIsPublic(myProfile.is_public)
        }
      } catch (err) {
        if (!cancelled) {
          setError('not_found')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [username])

  // ── Toggle visibility (owner only) ────────────────────────────────────
  const toggleVisibility = async () => {
    if (!isOwner) return
    setTogglingVisibility(true)
    try {
      const updated = await updateProfile({ is_public: !isPublic })
      setIsPublic(updated.is_public)
      showToast('success', updated.is_public ? 'Profile is now public' : 'Profile is now private')
      // Reload public data for fresh stats
      const data = await getPublicProfile(username)
      // Owner always sees their data — keep existing profile if public function returns null (private)
      if (data) {
        setProfile(data)
      } else if (updated.is_public) {
        // Only show 'not found' for public profiles that have no data (shouldn't happen)
        setError('not_found')
      }
      // When private, owner keeps seeing their existing profile data
    } catch (err) {
      showToast('error', `Failed to update: ${(err as Error).message}`)
    } finally {
      setTogglingVisibility(false)
    }
  }

  // ── Share profile URL ─────────────────────────────────────────────────
  const shareProfile = () => {
    const url = window.location.href
    const title = `${profile?.display_name || username} (@${username}) — Study profile on Lecture to Mastery`
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showToast('success', 'Profile URL copied!')
      }).catch(() => {})
    }
  }

  // ── Share achievement URL ─────────────────────────────────────────────
  const shareAchievement = (achievementId: string, label: string) => {
    const url = `${window.location.origin}/u/${encodeURIComponent(username)}/achievement/${encodeURIComponent(achievementId)}`
    const title = `I unlocked "${label}" on Lecture to Mastery!`
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showToast('success', `Achievement link copied: ${label}`)
      }).catch(() => {})
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Loading state
  // ═════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-2xl px-4 py-12">
          {/* Back button skeleton */}
          <div className="mb-6 h-8 w-20 animate-pulse rounded-lg bg-bg-muted" />

          {/* Profile header skeleton */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="h-24 w-24 animate-pulse rounded-full bg-bg-muted" />
            <div className="h-8 w-48 animate-pulse rounded-lg bg-bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded-md bg-bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded-md bg-bg-muted" />
          </div>

          {/* Stats row skeleton */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-bg-muted" />
            ))}
          </div>

          {/* Achievements skeleton */}
          <div className="mb-6">
            <div className="mb-4 h-7 w-40 animate-pulse rounded-md bg-bg-muted" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════
  // Error / Not Found state
  // ═════════════════════════════════════════════════════════════════════
  if (error === 'not_found' || !profile) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-bg-muted">
            <Globe className="h-10 w-10 text-text-muted" />
          </div>
          <h1 className="mb-2 text-h2 text-text">Profile not found</h1>
          <p className="mb-2 text-body text-text-secondary">
            This profile doesn't exist or is set to private.
          </p>
          {isOwner && !isPublic && (
            <p className="mb-6 text-small text-amber-600">
              Your profile is currently private. Toggle it to public in settings to make it visible.
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate({ to: '/' })}>
              Go home
            </Button>
            {isOwner && (
              <Button onClick={() => navigate({ to: '/settings' })}>
                Profile settings
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════
  // Public Profile View
  // ═════════════════════════════════════════════════════════════════════
  const unlockedKeys = new Set((profile.achievements || []).map((a) => a.key))

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate({ to: '/' })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium text-text-secondary hover:bg-surface-subtle transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {/* Share button */}
            <button
              onClick={shareProfile}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium text-text-secondary hover:bg-surface-subtle transition-colors"
              title="Share profile"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Owner controls */}
            {isOwner && (
              <>
                <Link
                  to="/settings"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium text-text-secondary hover:bg-surface-subtle transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Link>
                <button
                  onClick={toggleVisibility}
                  disabled={togglingVisibility}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-small font-medium transition-colors ${
                    isPublic
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                  }`}
                  title={isPublic ? 'Make private' : 'Make public'}
                >
                  {togglingVisibility ? (
                    <Spinner size="sm" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {isPublic ? 'Public' : 'Private'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            Profile Header
            ══════════════════════════════════════════════════════════════ */}
        <div className="mb-8 flex flex-col items-center text-center">
          {/* Avatar */}
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-h2 font-bold text-brand-600 shadow-sm ring-4 ring-white">
            {(profile.display_name || profile.username).charAt(0).toUpperCase()}
          </div>

          {/* Display name */}
          <h1 className="mb-1 text-h1 text-text font-bold">
            {profile.display_name || profile.username}
          </h1>

          {/* @username */}
          <p className="mb-2 text-body font-medium text-text-muted">
            @{profile.username}
          </p>

          {/* Bio */}
          {profile.bio && (
            <p className="mb-4 max-w-md text-body text-text-secondary leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Join date */}
          <div className="flex items-center gap-1.5 text-small text-text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Joined {new Date(profile.join_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            Hero Stat Row
            ══════════════════════════════════════════════════════════════ */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Avg Mastery Ring */}
          <Card padding="sm" className="flex flex-col items-center justify-center py-5">
            <MasteryRing value={profile.avg_mastery} size={80} strokeWidth={6} />
          </Card>

          {/* Current streak */}
          <Card padding="sm" className="flex flex-col items-center justify-center py-5">
            <Flame className={`mb-1.5 h-6 w-6 ${profile.current_streak > 0 ? 'text-orange-500' : 'text-text-muted'}`} />
            <p className="text-display font-bold text-text tabular-nums">{profile.current_streak}</p>
            <p className="text-caption text-text-muted">Day streak</p>
          </Card>

          {/* Total cards reviewed */}
          <Card padding="sm" className="flex flex-col items-center justify-center py-5">
            <Trophy className="mb-1.5 h-6 w-6 text-brand-500" />
            <p className="text-display font-bold text-text tabular-nums">{profile.total_cards}</p>
            <p className="text-caption text-text-muted">Cards reviewed</p>
          </Card>

          {/* Total documents */}
          <Card padding="sm" className="flex flex-col items-center justify-center py-5">
            <BookOpen className="mb-1.5 h-6 w-6 text-violet-500" />
            <p className="text-display font-bold text-text tabular-nums">{profile.total_documents}</p>
            <p className="text-caption text-text-muted">Documents</p>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            Achievements Grid
            ══════════════════════════════════════════════════════════════ */}
        <div className="mb-6">
          <h2 className="mb-4 text-title-2 text-text font-semibold">Achievements</h2>
          {ACHIEVEMENT_DEFS.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-8 text-center">
              <Award className="mx-auto mb-2 h-8 w-8 text-text-muted" />
              <p className="text-body text-text-secondary">No achievements yet. Start studying to unlock them!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {ACHIEVEMENT_DEFS.map((def) => {
                const unlocked = unlockedKeys.has(def.id)
                return (
                  <Card
                    key={def.id}
                    padding="sm"
                    className={`flex flex-col items-center gap-1 py-4 text-center transition-all ${
                      unlocked
                        ? 'ring-1 ring-brand-200'
                        : 'opacity-40 grayscale'
                    }`}
                  >
                    <span className="text-2xl">{def.icon}</span>
                    <p className={`text-label font-medium ${unlocked ? 'text-text' : 'text-text-muted'}`}>
                      {def.label}
                    </p>
                    <p className="text-caption text-text-muted">{def.description}</p>
                    {unlocked && (
                      <div className="mt-1 flex items-center gap-1.5 text-caption text-brand-600">
                        <Award className="h-3 w-3" />
                        <span>Unlocked</span>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); shareAchievement(def.id, def.label) }}
                          className="ml-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-caption text-text-muted hover:text-text hover:bg-surface-subtle transition-colors"
                          title="Share this achievement"
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            Owner: Live Preview of "what others see"
            ══════════════════════════════════════════════════════════════ */}
        {isOwner && (
          <div className="mt-8 rounded-xl border border-brand-200 bg-brand-50/50 p-5">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex w-full items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand-600" />
                <p className="text-label font-medium text-brand-800">
                  {showPreview ? 'Hide' : 'Show'} what others see
                </p>
              </div>
              <span className="text-caption text-brand-600">
                {isPublic ? 'Profile is public' : 'Profile is private'}
              </span>
            </button>

            {showPreview && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-brand-200 dark:border-brand-900/40 bg-white dark:bg-surface p-4">
                  <p className="text-caption font-medium text-text-muted mb-2">Public data visible to others:</p>
                  <ul className="space-y-1.5 text-small text-text-secondary">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Username, display name, bio, avatar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Total documents: {profile.total_documents}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Study streak: {profile.current_streak} days</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Cards reviewed: {profile.total_cards}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Average mastery: {profile.avg_mastery}%</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Achievements: {profile.achievements?.length || 0} unlocked</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span>Joined: {new Date(profile.join_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-small font-medium text-amber-800 flex items-center gap-1.5">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    Never visible: document titles, content, emails, chat queries, flashcard/quiz content
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <Link to="/" className="text-small text-text-muted hover:text-text-secondary transition-colors">
            <span className="font-medium">Lecture to Mastery</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/u/$username',
  component: ProfilePage,
})
