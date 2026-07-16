import { useState, useEffect, useCallback, useRef } from 'react'
import { createRoute, Link } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { fetchDueFlashcardsGlobal, reviewFlashcard, logEvent, type GlobalDueCard } from '../lib/api'
import { onSessionCompleted } from '../lib/gamification'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { PageContainer } from '../components/PageContainer'
import { Badge } from '../components/Badge'
import { ShareButton } from '../components/ShareButton'
import { ChevronLeft, BookOpen, Sparkles, Check } from 'lucide-react'

type Rating = 'again' | 'hard' | 'good' | 'easy'

interface CardReview {
  flashcardId: string
  front: string
  documentTitle: string
  rating: Rating
}

function GlobalReviewPage() {
  const [cards, setCards] = useState<GlobalDueCard[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'loading' | 'studying' | 'done' | 'empty'>('loading')
  const [reviews, setReviews] = useState<CardReview[]>([])
  const [lastReviewResult, setLastReviewResult] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadCards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dueCards = await fetchDueFlashcardsGlobal()
      if (dueCards.length === 0) {
        setPhase('empty')
      } else {
        setCards(dueCards)
        setCurrent(0)
        setFlipped(false)
        setReviews([])
        setPhase('studying')
      }
    } catch (err) {
      setError((err as Error).message)
      setPhase('empty')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  const handleFlip = () => {
    if (!flipped) setFlipped(true)
  }

  const handleRate = async (rating: Rating) => {
    const card = cards[current]
    setReviews((prev) => [
      ...prev,
      { flashcardId: card.id, front: card.front, documentTitle: card.document_title, rating },
    ])

    try {
      const result = await reviewFlashcard(card.id, rating)
      // Briefly show the next interval
      setLastReviewResult(`${card.document_title} — next ${result.nextReview}`)
      setTimeout(() => setLastReviewResult(null), 2500)
      logEvent(card.document_id, 'flashcard_review', {
        flashcardId: card.id,
        rating,
        source: 'global-queue',
      })
    } catch {
      // Fallback: log error silently
    }

    // Check if session is complete
    if (current + 1 >= cards.length) {
      setPhase('done')
      onSessionCompleted(cards.length, current + 1).catch(() => {})
    } else {
      setCurrent((c) => c + 1)
      setFlipped(false)
    }
  }

  // ===== Loading / Error / Empty states =====
  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center gap-3 py-12">
          <Spinner size="md" />
          <span className="text-body text-text-secondary">Loading your review queue...</span>
        </div>
      </PageContainer>
    )
  }

  if (error && phase !== 'studying') {
    return (
      <PageContainer>
        <EmptyState
          illustration="sparkle"
          title="Could not load review queue"
          description={error}
          action={
            <Button onClick={loadCards} variant="secondary">
              Retry
            </Button>
          }
        />
      </PageContainer>
    )
  }

  if (phase === 'empty') {
    return (
      <PageContainer className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          illustration="sparkle"
          title="You're all caught up! 🎉"
          description="No flashcards are due right now. Come back tomorrow or generate new flashcards from your documents."
          action={
            <Link to="/">
              <Button variant="secondary" leadingIcon={<BookOpen className="h-4 w-4" />}>
                Back to Library
              </Button>
            </Link>
          }
        />
      </PageContainer>
    )
  }

  // ===== Session Complete =====
  if (phase === 'done') {
    const againCount = reviews.filter((r) => r.rating === 'again').length
    const hardCount = reviews.filter((r) => r.rating === 'hard').length
    const goodCount = reviews.filter((r) => r.rating === 'good').length
    const easyCount = reviews.filter((r) => r.rating === 'easy').length
    const graduatedCount = reviews.filter((r) => r.rating === 'good' || r.rating === 'easy').length
    const resetCount = reviews.filter((r) => r.rating === 'again' || r.rating === 'hard').length

    return (
      <PageContainer className="py-6">
        <div className="mx-auto max-w-reading-panel space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary transition-colors"
              aria-label="Back to library"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-title-2 text-text">Review Complete</h1>
          </div>

          {/* Summary card */}
          <Card className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-8 w-8 text-emerald-500" strokeWidth={2.5} />
            </div>
            <p className="text-display text-brand-500">
              {graduatedCount}/{reviews.length}
            </p>
            <p className="mt-2 text-body text-text-secondary">
              {resetCount === 0
                ? 'All cards graduated!'
                : graduatedCount >= reviews.length / 2
                  ? 'Good progress!'
                  : 'Keep practicing!'}
            </p>
          </Card>

          {/* Session stats */}
          <div className="space-y-3">
            <h2 className="text-title-3 text-text">Session Summary</h2>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 flex items-center justify-between">
              <span className="text-label font-medium text-emerald-700">Graduated (Good/Easy)</span>
              <span className="text-label font-bold text-emerald-700">{graduatedCount}</span>
            </div>
            <div className="rounded-lg bg-rose-50 px-4 py-3 flex items-center justify-between">
              <span className="text-label font-medium text-rose-700">Reset (Again/Hard)</span>
              <span className="text-label font-bold text-rose-700">{resetCount}</span>
            </div>
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <div className="flex items-center justify-between text-small text-text-muted">
                <span>Again</span>
                <span className="tabular-nums">{againCount}</span>
              </div>
              <div className="flex items-center justify-between text-small text-text-muted">
                <span>Hard</span>
                <span className="tabular-nums">{hardCount}</span>
              </div>
              <div className="flex items-center justify-between text-small text-text-muted">
                <span>Good</span>
                <span className="tabular-nums">{goodCount}</span>
              </div>
              <div className="flex items-center justify-between text-small text-text-muted">
                <span>Easy</span>
                <span className="tabular-nums">{easyCount}</span>
              </div>
            </div>
          </div>

          {/* Cards reviewed list */}
          <div>
            <h2 className="text-title-3 text-text mb-3">Cards Reviewed</h2>
            <div className="space-y-2">
              {reviews.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${
                    r.rating === 'again' || r.rating === 'hard'
                      ? 'border-rose-100 bg-rose-50/50'
                      : 'border-emerald-100 bg-emerald-50/50'
                  }`}
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-label text-text truncate">{r.front}</p>
                    <p className="text-caption text-text-muted truncate">{r.documentTitle}</p>
                  </div>
                  <Badge
                    variant={
                      r.rating === 'again'
                        ? 'error'
                        : r.rating === 'hard'
                          ? 'warning'
                          : r.rating === 'good'
                            ? 'info'
                            : 'success'
                    }
                  >
                    {r.rating}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 items-center pt-2">
            <Button onClick={loadCards} leadingIcon={<Sparkles className="h-4 w-4" />}>
              Start New Review
            </Button>
            <Link to="/">
              <Button variant="secondary">Back to Library</Button>
            </Link>
            <ShareButton
              type="streak"
              value={graduatedCount}
              secondaryValue={`${graduatedCount}/${reviews.length} graduated`}
              title="Review Session"
              subtitle={
                resetCount === 0 ? 'All cards graduated!' : `${resetCount} cards need more practice`
              }
            />
          </div>
        </div>
      </PageContainer>
    )
  }

  // ===== Active review =====
  const card = cards[current]
  if (!card) return null

  const progress = ((current + (flipped ? 1 : 0)) / cards.length) * 100

  return (
    <PageContainer className="py-6">
      <div className="mx-auto max-w-narrow space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary transition-colors"
            aria-label="Back to library"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-title-3 text-text">Daily Review</h1>
          </div>
          <span className="text-caption text-text-muted tabular-nums">
            {cards.length} card{cards.length !== 1 ? 's' : ''} due
          </span>
        </div>

        {/* Last review result toast */}
        {lastReviewResult && (
          <div className="rounded-lg bg-brand-50 px-4 py-2 text-center text-small font-medium text-brand-700 animate-in fade-in slide-in-from-top-1">
            {lastReviewResult}
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="text-caption font-medium text-text-muted tabular-nums">
            {current + 1} / {cards.length}
          </span>
        </div>

        {/* Document label */}
        <div className="flex items-center justify-center gap-2">
          <BookOpen className="h-4 w-4 text-text-muted" />
          <span className="text-small text-text-muted truncate max-w-[300px]">
            {card.document_title}
          </span>
        </div>

        {/* Card */}
        <div className="perspective-[800px]">
          <div
            onClick={handleFlip}
            style={{ transformStyle: 'preserve-3d' }}
            className={`relative min-h-[300px] cursor-pointer transition-transform duration-[250ms] ease-out ${
              flipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* Front face */}
            <div className="absolute inset-0 backface-hidden flex items-center justify-center rounded-xl border-2 border-border bg-surface p-8 text-center shadow-md">
              <div>
                <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-text-muted">
                  Front
                </p>
                <p className="text-h3 text-text leading-relaxed">{card.front}</p>
                <p className="mt-4 text-small text-text-muted">Click to reveal answer</p>
              </div>
            </div>
            {/* Back face */}
            <div className="absolute inset-0 backface-hidden flex items-center justify-center rounded-xl border-2 border-brand-500/30 bg-brand-50 p-8 text-center shadow-sm rotate-y-180">
              <div>
                <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-brand-500">
                  Answer
                </p>
                <p className="text-body leading-relaxed text-text">{card.back}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rating buttons */}
        {flipped && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <p
              className="mb-3 text-center text-caption font-medium text-text-muted"
              id="global-review-rating-label"
            >
              How well did you know this?
            </p>
            <div
              className="grid grid-cols-4 gap-3"
              role="group"
              aria-labelledby="global-review-rating-label"
            >
              <button
                onClick={() => handleRate('again')}
                className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-3 text-label font-medium text-rose-700 transition-colors duration-150 ease-out hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                aria-label="Rate Again — card will show again soon"
              >
                Again
              </button>
              <button
                onClick={() => handleRate('hard')}
                className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 text-label font-medium text-amber-700 transition-colors duration-150 ease-out hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                aria-label="Rate Hard — card will show again later"
              >
                Hard
              </button>
              <button
                onClick={() => handleRate('good')}
                className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-label font-medium text-emerald-700 transition-colors duration-150 ease-out hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                aria-label="Rate Good — card will show on schedule"
              >
                Good
              </button>
              <button
                onClick={() => handleRate('easy')}
                className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-3 text-label font-medium text-brand-700 transition-colors duration-150 ease-out hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                aria-label="Rate Easy — card will show much later"
              >
                Easy
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/review',
  component: GlobalReviewPage,
})
