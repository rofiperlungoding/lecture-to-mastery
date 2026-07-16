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
import { Flame, Trophy, Award } from 'lucide-react'
import { ACHIEVEMENT_DEFS } from '../types/db'
import type { Achievement, UserStats } from '../types/db'

interface DocStats {
  totalCards: number
  dueToday: number
  mastered: number
  bestScore: { score: number; total: number } | null
  weeklyReviews: number
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

  // Aggregate across all documents
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

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        meta="Track your study activity and achievements"
      />

      {/* XP Overview */}
      <Card className="mb-6 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 items-center rounded-md bg-brand-500 px-3 text-label font-bold text-white">
              Lv.{level}
            </div>
            <span className="text-label font-medium text-text">{xp} Total XP</span>
          </div>
          {userStats && userStats.current_streak > 0 && (
            <div className="flex items-center gap-1.5 text-label font-medium text-orange-500">
              <Flame className="h-4 w-4" />
              <span>{userStats.current_streak} day streak</span>
              {userStats.longest_streak > userStats.current_streak && (
                <span className="text-caption text-text-muted">(best: {userStats.longest_streak})</span>
              )}
            </div>
          )}
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-bg-muted">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
        <p className="mt-1.5 text-small text-text-muted">
          Level {level + 1} at {((level) ** 2 * 100).toLocaleString()} XP &mdash;{' '}
          formula: floor(sqrt(xp / 100)) + 1
        </p>
      </Card>

      {/* Overview cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-caption font-medium text-text-muted mb-1">Flashcards</p>
          <p className="text-display font-bold text-text">{totalAcrossDocs.totalCards}</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption font-medium text-text-muted mb-1">Due today</p>
          <p className="text-display font-bold text-text">{totalAcrossDocs.dueToday}</p>
        </Card>
        <Card className="p-4">
          <p className="text-caption font-medium text-text-muted mb-1">
            Mastered
          </p>
          <p className="text-display font-bold text-text">
            {totalAcrossDocs.mastered}
            {totalAcrossDocs.totalCards > 0 && (
              <span className="ml-1 text-h3 font-medium text-text-muted">
                ({Math.round((totalAcrossDocs.mastered / totalAcrossDocs.totalCards) * 100)}%)
              </span>
            )}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-caption font-medium text-text-muted mb-1">This week</p>
          <p className="text-display font-bold text-text">{totalAcrossDocs.weeklyReviews}</p>
        </Card>
      </div>

      {/* Best Quiz Score */}
      {quizBestAcrossDocs && (
        <Card className="mb-6 p-4">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-label font-medium text-text">Best Quiz Score</p>
              <p className="text-small text-text-muted">
                {quizBestAcrossDocs.score} / {quizBestAcrossDocs.total}
                {' '}&mdash;{' '}
                {Math.round((quizBestAcrossDocs.score / quizBestAcrossDocs.total) * 100)}%
              </p>
            </div>
          </div>
        </Card>
      )}


      {/* Achievements Grid */}
      <div className="mb-6">
        <h2 className="text-h3 font-semibold text-text mb-4">Achievements</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ACHIEVEMENT_DEFS.map((def) => {
            const unlocked = unlockedKeys.has(def.id)
            return (
              <Card
                key={def.id}
                className={`p-3 transition-all duration-150 ${
                  unlocked
                    ? 'ring-1 ring-brand-200'
                    : 'opacity-40 grayscale'
                }`}
              >
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-2xl">{def.icon}</span>
                  <p className={`text-label font-medium ${unlocked ? 'text-text' : 'text-text-muted'}`}>
                    {def.label}
                  </p>
                  <p className="text-caption text-text-muted">{def.description}</p>
                  {unlocked && (
                    <div className="mt-1 flex items-center gap-1 text-caption text-brand-600">
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
      <h2 className="text-h3 font-semibold text-text mb-4">By Document</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {documents.map((doc) => {
          const stats = statsMap[doc.id]
          return (
            <Link key={doc.id} to="/doc/$docId" params={{ docId: doc.id }}>
              <Card className="group cursor-pointer p-4 transition-all duration-150 ease-out hover:shadow-md">
                <p className="mb-3 truncate text-label font-semibold text-text group-hover:text-brand-600 transition-colors">
                  {doc.title}
                </p>
                <span className="mb-3 inline-block rounded-md bg-bg-muted px-2 py-0.5 text-caption font-medium text-text-muted">
                  {doc.source_type}
                </span>
                {stats ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-small">
                    <div>
                      <p className="text-text-muted">Cards</p>
                      <p className="font-medium text-text">{stats.totalCards}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Due</p>
                      <p className="font-medium text-text">{stats.dueToday}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Mastered</p>
                      <p className="font-medium text-text">{stats.mastered}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Best quiz</p>
                      <p className="font-medium text-text">
                        {stats.bestScore
                          ? `${stats.bestScore.score}/${stats.bestScore.total}`
                          : '--'}
                      </p>
                    </div>
                    <div className="col-span-2 mt-1">
                      <p className="text-text-muted">7-day reviews: {stats.weeklyReviews}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-small text-text-muted">Loading stats...</p>
                )}
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
