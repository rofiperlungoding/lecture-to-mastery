import { createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAppStore } from '../stores/useAppStore'
import { fetchDocProgress } from '../lib/api'
import { fetchEarnedAchievements, fetchUserStats, calcLevel, xpProgressInLevel } from '../lib/gamification'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { PageContainer } from '../components/PageContainer'
import { Card } from '../components/Card'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Flame, Trophy, Award, Target, Zap, Layers, TrendingUp, BookOpen, Clock, Sparkles, ChevronRight } from 'lucide-react'
import { ACHIEVEMENT_DEFS } from '../types/db'
import type { Achievement, UserStats } from '../types/db'

interface DocStats {
  totalCards: number
  dueToday: number
  mastered: number
  bestScore: { score: number; total: number } | null
  weeklyReviews: number
}

function StatCard({ icon, label, value, accent = 'brand' }: { icon: React.ReactNode; label: string; value: string | number; accent?: string }) {
  const accentColors: Record<string, string> = {
    brand: 'from-brand-500/10 to-brand-500/5 border-brand-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/20',
  }
  return (
    <Card className="card-lift-hover relative overflow-hidden border">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentColors[accent] || accentColors.brand} opacity-60`} />
      <div className="relative flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${
          accent === 'emerald' ? 'from-emerald-500/20 to-emerald-500/5' :
          accent === 'amber' ? 'from-amber-500/20 to-amber-500/5' :
          accent === 'violet' ? 'from-violet-500/20 to-violet-500/5' :
          'from-brand-500/20 to-brand-500/5'
        }`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-footnote font-medium text-text-secondary">{label}</p>
          <p className="text-title-2 font-bold text-text tabular-nums mt-0.5">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function ProgressPage() {
  const { documents, fetchDocuments, loadingDocs } = useAppStore()
  const [statsMap, setStatsMap] = useState<Record<string, DocStats>>({})
  const [loading, setLoading] = useState(true)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [userStats, setUserStats] = useState<UserStats | null>(null)

  useEffect(() => {
    fetchDocuments()
    fetchEarnedAchievements().then((earned) => {
      setAchievements(Array.from(earned).map((key) => ({ id: key, user_id: '', key, unlocked_at: '' })))
    })
    fetchUserStats().then(setUserStats)
  }, [])

  useEffect(() => {
    if (!loadingDocs && documents.length > 0) {
      Promise.all(
        documents.map(async (doc) => {
          const stats = await fetchDocProgress(doc.id)
          return { docId: doc.id, stats }
        }),
      ).then((results) => {
        const map: Record<string, DocStats> = {}
        results.forEach((r) => {
          map[r.docId] = r.stats
        })
        setStatsMap(map)
        setLoading(false)
      })
    } else if (!loadingDocs) {
      setLoading(false)
    }
  }, [loadingDocs, documents])

  if (loading || loadingDocs) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    )
  }

  if (documents.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Progress"
          meta="Track your study activity and achievements"
        />
        <EmptyState
          illustration="activity"
          title="No study data yet"
          description="Upload a document to start tracking your progress."
        />
      </PageContainer>
    )
  }

  const totalAcrossDocs = Object.values(statsMap).reduce(
    (acc, s) => ({
      totalCards: acc.totalCards + s.totalCards,
      dueToday: acc.dueToday + s.dueToday,
      mastered: acc.mastered + s.mastered,
      weeklyReviews: acc.weeklyReviews + s.weeklyReviews,
    }),
    { totalCards: 0, dueToday: 0, mastered: 0, weeklyReviews: 0 },
  )

  const quizBestAcrossDocs = Object.values(statsMap).reduce<{ score: number; total: number } | null>(
    (best, s) => {
      if (!s.bestScore) return best
      if (!best || s.bestScore.score / s.bestScore.total > best.score / best.total) return s.bestScore
      return best
    },
    null,
  )

  const unlockedKeys = new Set(achievements.map((a) => a.key))
  const xp = userStats?.xp ?? 0
  const level = userStats?.level ?? calcLevel(xp)
  const progress = xpProgressInLevel(xp)
  const streak = userStats?.current_streak ?? 0
  const longestStreak = userStats?.longest_streak ?? 0

  return (
    <PageContainer className="animate-page-enter">
      <PageHeader
        title="Progress"
        meta="Track your study activity and achievements"
      />

      {/* XP Overview — premium gradient card */}
      <div className="relative mb-8 overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 p-6 sm:p-8 shadow-lg ring-1 ring-white/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
        
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-9 items-center rounded-lg bg-white/20 px-3 text-label font-bold text-white backdrop-blur-sm">
                  Lv.{level}
                </div>
                <span className="text-label font-semibold text-white/90">{xp} Total XP</span>
              </div>
              <div className="flex items-center gap-3">
                {streak > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-footnote font-medium text-white/90 backdrop-blur-sm">
                    <Flame className="h-3.5 w-3.5 text-amber-300" />
                    <span>{streak} day streak</span>
                    {longestStreak > streak && (
                      <span className="text-white/60">(best: {longestStreak})</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-footnote">
              <span className="text-white/80">Next level</span>
              <span className="text-white/80 tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overview cards */}
      <div className="stagger-children mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Layers className="h-5 w-5 text-brand-500" />} label="Flashcards" value={totalAcrossDocs.totalCards} accent="brand" />
        <StatCard icon={<Clock className="h-5 w-5 text-amber-500" />} label="Due today" value={totalAcrossDocs.dueToday} accent="amber" />
        <StatCard icon={<Target className="h-5 w-5 text-emerald-500" />} label="Mastered" value={`${totalAcrossDocs.mastered}${totalAcrossDocs.totalCards > 0 ? ` (${Math.round((totalAcrossDocs.mastered / totalAcrossDocs.totalCards) * 100)}%)` : ''}`} accent="emerald" />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-violet-500" />} label="This week" value={totalAcrossDocs.weeklyReviews} accent="violet" />
      </div>

      {/* Best Quiz Score */}
      {quizBestAcrossDocs && (
        <div className="mb-6">
          <Card className="card-lift-hover relative overflow-hidden border-l-4 border-l-amber-500">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5">
                <Trophy className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-label font-semibold text-text">Best Quiz Score</p>
                <p className="text-body text-text-secondary mt-0.5">
                  {quizBestAcrossDocs.score} / {quizBestAcrossDocs.total}
                  {' '}-{' '}
                  {Math.round((quizBestAcrossDocs.score / quizBestAcrossDocs.total) * 100)}%
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Achievements Grid */}
      <div className="mb-8">
        <h2 className="text-title-2 text-text mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Achievements
          <span className="text-footnote font-normal text-text-muted ml-2">
            {achievements.length} / {ACHIEVEMENT_DEFS.length} unlocked
          </span>
        </h2>
        <div className="stagger-children grid grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {ACHIEVEMENT_DEFS.map((def) => {
            const unlocked = unlockedKeys.has(def.id)
            return (
              <Card
                key={def.id}
                className={`card-lift-hover relative overflow-hidden p-4 text-center transition-all duration-200 ${
                  unlocked
                    ? 'ring-1 ring-brand-200/50'
                    : 'opacity-40 grayscale hover:opacity-60'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">{def.icon}</span>
                  <p className={`text-footnote font-semibold leading-tight ${unlocked ? 'text-text' : 'text-text-muted'}`}>
                    {def.label}
                  </p>
                  <p className="text-smallest text-text-muted line-clamp-2">{def.description}</p>
                  {unlocked && (
                    <div className="mt-1 flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-smallest font-medium text-brand-600">
                      <Award className="h-3 w-3" />
                      <span>Unlocked</span>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Per-document breakdown */}
      <h2 className="text-title-2 text-text mb-5 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-brand-500" />
        By Document
      </h2>
      <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {documents.map((doc) => {
          const stats = statsMap[doc.id]
          return (
            <Link key={doc.id} to="/doc/$docId" params={{ docId: doc.id }}>
              <Card hoverable className="card-lift-hover relative overflow-hidden h-full">
                <p className="mb-3 truncate text-label font-semibold text-text group-hover:text-brand-600 transition-colors">
                  {doc.title}
                </p>
                <span className="mb-3 inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-smallest font-medium text-brand-600">
                  {doc.source_type}
                </span>
                {stats ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-small">
                    <div className="rounded-lg bg-surface-muted/50 p-2">
                      <p className="text-smallest text-text-muted">Cards</p>
                      <p className="text-subhead font-semibold text-text tabular-nums">{stats.totalCards}</p>
                    </div>
                    <div className="rounded-lg bg-surface-muted/50 p-2">
                      <p className="text-smallest text-text-muted">Due</p>
                      <p className="text-subhead font-semibold text-text tabular-nums">{stats.dueToday}</p>
                    </div>
                    <div className="rounded-lg bg-surface-muted/50 p-2">
                      <p className="text-smallest text-text-muted">Mastered</p>
                      <p className="text-subhead font-semibold text-text tabular-nums">{stats.mastered}</p>
                    </div>
                    <div className="rounded-lg bg-surface-muted/50 p-2">
                      <p className="text-smallest text-text-muted">Best quiz</p>
                      <p className="text-subhead font-semibold text-text tabular-nums">
                        {stats.bestScore ? `${stats.bestScore.score}/${stats.bestScore.total}` : '--'}
                      </p>
                    </div>
                    <div className="col-span-2 mt-1">
                      <div className="flex items-center gap-1.5 text-smallest text-text-muted">
                        <Clock className="h-3 w-3" />
                        <span>7-day reviews: {stats.weeklyReviews}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-small text-text-muted">Loading stats...</p>
                )}
                <div className="mt-3 flex items-center gap-1 text-smallest font-medium text-brand-500 opacity-0 transition-opacity group-hover:opacity-100">
                  Open document <ChevronRight className="h-3 w-3" />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/progress',
  component: ProgressPage,
})
