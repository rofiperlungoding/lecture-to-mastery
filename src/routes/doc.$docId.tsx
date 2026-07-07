import { useState, useRef, useEffect, useCallback } from 'react'
import { createRoute, Link, useParams, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAppStore } from '../stores/useAppStore'
import { ragQuery, summarizeDocument, generateQuiz, fetchQuiz, generateFlashcards, fetchFlashcards, recordFlashcardReview, recordQuizAttempt, embedDocument, generateConceptMap, type SummaryResult, type QuizQuestionItem, type FlashcardItem } from '../lib/api'
import { onChatQuestion, checkNightOwl, onSessionCompleted, onDocumentStudied } from '../lib/gamification'
import { supabase } from '../lib/supabase'
import { ConceptMap } from "../components/ConceptMap"
import { showToast } from '../components/Toast'
import { Tabs } from '../components/Tabs'
import { PracticeExamPanel } from "../components/PracticeExamPanel"
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/Button'
import { NotesPanel } from '../components/NotesPanel'
import { Badge } from '../components/Badge'
import { ChevronLeft, RefreshCw, Check, Feather, GitBranch, Sparkles, Loader2, Send, Pencil, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import type { Tab } from '../components/Tabs'
import { useHighlightSelection } from '../components/HighlightTooltip'
import { ExportMenu } from '../components/ExportMenu'

const workspaceTabs: Tab[] = [
  { id: 'exam', label: 'Exam' },
  { id: 'summary', label: 'Summary' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'chat', label: 'Chat' },
  { id: 'notes', label: 'Notes' },
]

const tabIcons: Record<string, string> = {
  summary: '📝',
  flashcards: '🃏',
  quiz: '❓',
  chat: '💬',
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: { chunkIndex: number; snippet: string }[]
}

interface QuizState {
  questions: QuizQuestionItem[]
  current: number
  selected: number | null
  submitted: boolean
  answers: { selected: number; correct: number }[]
  phase: 'idle' | 'taking' | 'done'
}

function QuizPanel({ docId }: { docId: string }) {
  const [state, setState] = useState<QuizState>({
    questions: [],
    current: 0,
    selected: null,
    submitted: false,
    answers: [],
    phase: 'idle',
  })
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [persisting, setPersisting] = useState(false)

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      await generateQuiz(docId, 8)
      const questions = await fetchQuiz(docId)
      setState({
        questions,
        current: 0,
        selected: null,
        submitted: false,
        answers: [],
        phase: 'taking',
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [docId])

  const submitAnswer = () => {
    if (state.selected === null) return
    const q = state.questions[state.current]
    const newAnswers = [
      ...state.answers,
      { selected: state.selected, correct: q.correct_index },
    ]
    setState({ ...state, submitted: true, answers: newAnswers })
  }

  const nextQuestion = () => {
    if (state.current + 1 >= state.questions.length) {
      // Persist quiz result when quiz completes
      const correctCount = state.answers.filter((a) => a.selected === a.correct).length
      recordQuizAttempt(docId, correctCount, state.questions.length).catch(() => {})
      setState({ ...state, phase: 'done', submitted: false, selected: null })
    } else {
      setState({
        ...state,
        current: state.current + 1,
        selected: null,
        submitted: false,
      })
    }
  }

  const correctCount = state.answers.filter((a) => a.selected === a.correct).length
  const question = state.questions[state.current]

  if (state.phase === 'idle') {
    return (
      <div className="p-6">
        <EmptyState
          icon={<span className="text-5xl">❓</span>}
          title="Quiz not started"
          description="Generate a multiple-choice quiz based on this document."
          action={
            <Button onClick={generate} isLoading={generating} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Quiz'}
            </Button>
          }
        />
        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        )}
      </div>
    )
  }

  if (state.phase === 'done') {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-border bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-display text-brand-500">
            {correctCount}/{state.questions.length}
          </p>
          <p className="mt-2 text-body text-text-secondary">
            {correctCount === state.questions.length
              ? 'Perfect score!'
              : correctCount >= state.questions.length / 2
                ? 'Good job!'
                : 'Keep studying!'}
          </p>
        </div>

        <div className="space-y-3">
          {state.questions.map((q, i) => {
            const a = state.answers[i]
            const correct = a?.selected === a?.correct
            return (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 ${
                  correct
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-rose-200 bg-rose-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="flex-1 text-label text-text">
                    {i + 1}. {q.question}
                  </p>
                  <span className={`text-label font-semibold ${correct ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {correct ? '✓' : '✗'}
                  </span>
                </div>
                {!correct && a && (
                  <p className="mt-1 text-small text-text-muted">
                    Your answer: {q.options[a.selected]}{' · '}Correct: {q.options[a.correct]}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() =>
              setState({
                questions: state.questions,
                current: 0,
                selected: null,
                submitted: false,
                answers: [],
                phase: 'taking',
              })
            }
          >
            Retake
          </Button>
          <Button variant="ghost" onClick={generate} isLoading={generating} disabled={generating}>
            {generating ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        )}
      </div>
    )
  }

  if (!question) {
    return (
      <div className="p-6">
        <EmptyState
          title="No questions"
          description="Could not load quiz questions."
          action={<Button onClick={generate}>Generate Quiz</Button>}
        />
      </div>
    )
  }

  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="mx-auto max-w-[720px] p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-200 ease-out"
              style={{
                width: `${((state.current + (state.submitted ? 1 : 0)) / state.questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <span className="text-caption font-medium text-text-muted">
          {state.current + 1} / {state.questions.length}
        </span>
      </div>

      <h3 className="mb-5 text-h3 text-text">{question.question}</h3>

      <div className="space-y-3">
        {question.options.map((opt, i) => {
          const isSelected = state.selected === i
          const isCorrect = state.submitted && i === question.correct_index
          const isWrong = state.submitted && isSelected && i !== question.correct_index

          return (
            <button
              key={i}
              onClick={() => {
                if (!state.submitted) setState({ ...state, selected: i })
              }}
              disabled={state.submitted}
              className={`flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-body transition-all duration-150 ease-out ${
                state.submitted
                  ? isCorrect
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : isWrong
                      ? 'border-rose-400 bg-rose-50 text-rose-900'
                      : 'border-border bg-white text-text-muted'
                  : isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border bg-white text-text-secondary hover:border-border-strong hover:bg-bg-subtle'
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-caption font-bold ${
                  state.submitted
                    ? isCorrect
                      ? 'bg-status-success text-white'
                      : isWrong
                        ? 'bg-status-error text-white'
                        : 'bg-bg-muted text-text-muted'
                    : isSelected
                      ? 'bg-brand-500 text-white'
                      : 'bg-bg-muted text-text-muted'
                }`}
              >
                {state.submitted && isCorrect
                  ? '✓'
                  : state.submitted && isWrong
                    ? '✗'
                    : optionLabels[i]}
              </span>
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {state.submitted && (
        <div className="mt-5 rounded-lg bg-bg-subtle px-4 py-3">
          <p className="text-caption font-semibold text-text-muted">Explanation</p>
          <p className="mt-1 text-body text-text">{question.explanation}</p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        {state.submitted ? (
          <Button onClick={nextQuestion}>
            {state.current + 1 >= state.questions.length ? 'See Results' : 'Next Question'}
          </Button>
        ) : (
          <Button onClick={submitAnswer} disabled={state.selected === null}>
            Submit Answer
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
      )}
    </div>
  )
}

function PlaceholderPanel({ tabId, docTitle }: { tabId: string; docTitle: string }) {
  if (tabId === 'flashcards') {
    return <div className="hidden" />
  }
  const tab = workspaceTabs.find((t) => t.id === tabId)!
  const label = tab.label

  return (
    <div className="p-6">
      <EmptyState
        icon={<span className="text-5xl">{tabIcons[tabId]}</span>}
        title={`No ${label} yet`}
        description={`The ${label.toLowerCase()} panel will appear here once you generate content for "${docTitle}".`}
        action={<Button variant="outline" disabled>Generate {label}</Button>}
      />
    </div>
  )
}

type Rating = 'again' | 'hard' | 'good' | 'easy'

interface CardReview {
  flashcardId: string
  front: string
  rating: Rating
}

function FlashcardPanel({ docId }: { docId: string }) {
  const [cards, setCards] = useState<FlashcardItem[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'studying' | 'done'>('idle')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<CardReview[]>([])

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      await generateFlashcards(docId, 10)
      const fetched = await fetchFlashcards(docId)
      setCards(fetched)
      setCurrent(0)
      setFlipped(false)
      setReviews([])
      setPhase('studying')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [docId])

  const handleFlip = () => {
    if (!flipped) setFlipped(true)
  }

  const handleRate = (rating: Rating) => {
    const card = cards[current]
    setReviews((prev) => [...prev, { flashcardId: card.id, front: card.front, rating }])

    // Persist SM-2 review to database
    recordFlashcardReview(card.id, rating, card.ease, card.interval_days).catch(() => {})

    if (current + 1 >= cards.length) {
      setPhase('done')
      onSessionCompleted(cards.length, current + 1).catch(() => {})
    } else {
      setCurrent((c) => c + 1)
      setFlipped(false)
    }
  }

  const handleRetry = () => {
    const againIds = new Set(
      reviews.filter((r) => r.rating === 'again').map((r) => r.flashcardId),
    )
    const remaining = cards.filter((c) => againIds.has(c.id))
    if (remaining.length === 0) {
      setPhase('done')
      onSessionCompleted(cards.length, current + 1).catch(() => {})
      return
    }
    setCards(remaining)
    setCurrent(0)
    setFlipped(false)
    setReviews([])
    setPhase('studying')
  }

  if (phase === 'idle') {
    return (
      <div className="p-6">
        <EmptyState
          icon={<span className="text-5xl">🃏</span>}
          title="No flashcards yet"
          description="Generate flashcards to test your knowledge with spaced repetition."
          action={
            <Button onClick={generate} isLoading={generating} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Flashcards'}
            </Button>
          }
        />
        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    const againCount = reviews.filter((r) => r.rating === 'again').length
    const goodCount = reviews.filter((r) => r.rating === 'good' || r.rating === 'easy').length
    const hardCount = reviews.filter((r) => r.rating === 'hard').length

    return (
      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-border bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-h2 text-brand-500">
            {goodCount}/{reviews.length}
          </p>
          <p className="mt-2 text-body text-text-secondary">
            {goodCount === reviews.length
              ? 'All cards mastered!'
              : goodCount >= reviews.length / 2
                ? 'Good progress!'
                : 'Keep practicing!'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5 text-label">
            <span className="font-medium text-emerald-700">Good / Easy</span>
            <span className="font-bold text-emerald-700">{goodCount}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-2.5 text-label">
            <span className="font-medium text-amber-700">Hard</span>
            <span className="font-bold text-amber-700">{hardCount}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-2.5 text-label">
            <span className="font-medium text-rose-700">Again (restudy)</span>
            <span className="font-bold text-rose-700">{againCount}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {againCount > 0 && (
            <Button variant="outline" onClick={handleRetry}>
              Restudy {againCount} card{againCount > 1 ? 's' : ''}
            </Button>
          )}
          <Button onClick={generate} isLoading={generating} disabled={generating}>
            {generating ? 'Regenerating…' : 'Generate New Set'}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        )}
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="No cards"
          description="Could not load flashcards."
          action={<Button onClick={generate}>Generate Flashcards</Button>}
        />
      </div>
    )
  }

  const card = cards[current]
  const progress = ((current + (flipped ? 1 : 0)) / cards.length) * 100

  return (
    <div className="mx-auto max-w-[640px] p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-caption font-medium text-text-muted">
          {current + 1} / {cards.length}
        </span>
      </div>

      <div className="perspective-[800px]">
        <div
          onClick={handleFlip}
          style={{ transformStyle: 'preserve-3d' }}
          className={`relative min-h-[260px] cursor-pointer transition-transform duration-[250ms] ease-out ${
            flipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* Front face */}
          <div className="absolute inset-0 backface-hidden flex items-center justify-center rounded-xl border-2 border-border bg-white p-8 text-center shadow-md">
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-text-muted">Front</p>
              <p className="text-h3 text-text">{card.front}</p>
              <p className="mt-4 text-small text-text-muted">Click to reveal answer</p>
            </div>
          </div>
          {/* Back face */}
          <div className="absolute inset-0 backface-hidden flex items-center justify-center rounded-xl border-2 border-brand-500/30 bg-brand-50 p-8 text-center shadow-sm rotate-y-180">
            <div>
              <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-brand-500">Answer</p>
              <p className="text-body leading-relaxed text-text">{card.back}</p>
            </div>
          </div>
        </div>
      </div>

      {flipped && (
        <div className="mt-6">
          <p className="mb-3 text-center text-caption font-medium text-text-muted">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => handleRate('again')}
              className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-3 text-label font-medium text-rose-700 transition-colors duration-150 ease-out hover:bg-rose-100"
            >
              Again
            </button>
            <button
              onClick={() => handleRate('hard')}
              className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3 text-label font-medium text-amber-700 transition-colors duration-150 ease-out hover:bg-amber-100"
            >
              Hard
            </button>
            <button
              onClick={() => handleRate('good')}
              className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-3 text-label font-medium text-emerald-700 transition-colors duration-150 ease-out hover:bg-emerald-100"
            >
              Good
            </button>
            <button
              onClick={() => handleRate('easy')}
              className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-3 text-label font-medium text-brand-700 transition-colors duration-150 ease-out hover:bg-brand-100"
            >
              Easy
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
      )}
    </div>
  )
}

function SummaryPanel({ docId }: { docId: string }) {
  const [summary, setSummary] = useState<Record<string, SummaryResult>>({})
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [mode, setMode] = useState<'eli5' | 'detailed' | 'cheat-sheet'>('detailed')
  const [conceptMap, setConceptMap] = useState<ConceptMapData | null>(null)
  const [conceptMapLoading, setConceptMapLoading] = useState(false)
  const [conceptMapError, setConceptMapError] = useState<string | null>(null)
  const [summaryTab, setSummaryTab] = useState<'summary' | 'concept-map'>('summary')
  const fetchedRef = useRef(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const { handleMouseUp, highlightTooltip } = useHighlightSelection(docId, summaryRef)

  const modes = [
    { id: 'eli5' as const, label: 'ELI5', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'detailed' as const, label: 'Detailed', icon: <Feather className="h-3.5 w-3.5" /> },
    { id: 'cheat-sheet' as const, label: 'Cheat sheet', icon: <GitBranch className="h-3.5 w-3.5" /> },
  ]

  const fetchMode = useCallback(async (m: 'eli5' | 'detailed' | 'cheat-sheet') => {
    if (summary[m]) return
    setSummaryLoading((prev) => ({ ...prev, [m]: true }))
    setSummaryError(null)
    try {
      const result = await summarizeDocument(docId, m)
      setSummary((prev) => ({ ...prev, [m]: result }))
      if (!fetchedRef.current) {
        onDocumentStudied().catch(() => {})
        fetchedRef.current = true
      }
    } catch (err) {
      setSummaryError((err as Error).message)
    } finally {
      setSummaryLoading((prev) => ({ ...prev, [m]: false }))
    }
  }, [docId])

  const fetchConceptMap = useCallback(async () => {
    if (conceptMap) return
    setConceptMapLoading(true)
    setConceptMapError(null)
    try {
      const result = await generateConceptMap(docId)
      setConceptMap(result)
    } catch (err) {
      setConceptMapError((err as Error).message)
    } finally {
      setConceptMapLoading(false)
    }
  }, [docId])

  useEffect(() => { fetchMode(mode) }, [mode, fetchMode])
  useEffect(() => { if (summaryTab === 'concept-map') fetchConceptMap() }, [summaryTab, fetchConceptMap])

  const currentSummary = summary[mode]
  const isCurrentLoading = summaryLoading[mode]

  if (!currentSummary && isCurrentLoading && !Object.values(summary).some((s) => s)) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Spinner size="md" />
              <span className="text-body text-text-secondary">Generating {mode} summary...</span>
          </div>
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded-md bg-bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded-md bg-bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-md bg-bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  if (summaryError && !Object.values(summary).some((s) => s)) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{summaryError}</div>
        <div className="mt-4">
          <Button onClick={() => fetchMode(mode)} variant="outline" size="sm">Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex gap-1 rounded-lg bg-surface p-1">
        <button
          onClick={() => setSummaryTab('summary')}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors ' + (summaryTab === 'summary' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >Summary</button>
        <button
          onClick={() => setSummaryTab('concept-map')}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors ' + (summaryTab === 'concept-map' ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >Concept Map</button>
      </div>

      {summaryTab === 'summary' && (
        <>
          <div className="flex gap-1 rounded-lg bg-surface p-0.5">
            {modes.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} disabled={summaryLoading[m.id] && !summary[m.id]}
                className={'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors ' + (mode === m.id ? 'bg-white text-brand-700 shadow-sm' : 'text-text-muted hover:text-text-secondary') + ' disabled:cursor-not-allowed disabled:opacity-50'}
              >
                {summaryLoading[m.id] && !summary[m.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {currentSummary && (
            <>
              <div ref={summaryRef} onMouseUp={handleMouseUp}>
              <div className="flex items-center justify-between">
                <h2 className="text-h2 text-text">{mode === 'eli5' ? 'Simplified' : mode === 'detailed' ? 'Detailed' : 'Cheat Sheet'}</h2>
                <div className="flex items-center gap-2">
                  {currentSummary.cached && <span className="text-caption text-text-muted">Cached</span>}
                  <Button variant="ghost" size="sm" onClick={() => fetchMode(mode)} isLoading={isCurrentLoading} disabled={isCurrentLoading}
                    leadingIcon={!isCurrentLoading ? <RefreshCw className="h-4 w-4" /> : undefined}>Regenerate</Button>
                </div>
              </div>

              {isCurrentLoading && currentSummary && (
                <div className="flex items-center gap-2 text-small text-text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                </div>
              )}

              <div className="relative overflow-hidden rounded-xl bg-brand-50">
                <div className="absolute left-0 top-0 h-full w-1 bg-brand-500" />
                <div className="pl-6 pr-6 py-5">
                  <h3 className="text-label font-semibold text-brand-700 mb-2">TL;DR</h3>
                  <p className="text-body leading-relaxed text-text">{currentSummary.tldr}</p>
                </div>
              </div>

              <div>
                <h3 className="text-h3 text-text mb-4">Key Points</h3>
                <ul className="space-y-3">
                  {currentSummary.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50">
                        <Check className="h-2.5 w-2.5 text-brand-500" strokeWidth={3} />
                      </span>
              <span className="text-body text-text-secondary leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-h3 text-text mb-4">Key Terms</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {currentSummary.keyTerms.map((kt, i) => (
                    <Card key={i} className="!p-4">
                      <p className="mb-1 text-label font-semibold text-brand-700">{kt.term}</p>
                      <p className="text-small text-text-secondary">{kt.definition}</p>
                    </Card>
                  ))}
                </div>
              </div>
              </div>
              {highlightTooltip}
            </>
          )}
        </>
      )}

      {summaryTab === 'concept-map' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-h2 text-text">Concept Map</h2>
            {!conceptMap && !conceptMapLoading && (
              <Button variant="outline" size="sm" onClick={fetchConceptMap} isLoading={conceptMapLoading}>Generate</Button>
            )}
          </div>

          {conceptMapLoading && !conceptMap && (
            <div className="flex items-center gap-3 py-12">
              <Spinner size="md" />
              <span className="text-body text-text-secondary">Generating concept map...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton({ tabId }: { tabId: string }) {
  const tab = workspaceTabs.find((t) => t.id === tabId)!
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Spinner size="md" />
              <span className="text-body text-text-secondary">Loading {tab.label.toLowerCase()}...</span>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded-md bg-bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded-md bg-bg-muted" />
      </div>
    </div>
  )
}

function ChatPanel({ docId }: { docId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastQuestionRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuery = async (question: string) => {
    setError(null)
    setLoading(true)

    try {
      const result = await ragQuery(docId, question)
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    lastQuestionRef.current = question

    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    await sendQuery(question)
    onChatQuestion().catch(() => {})
    checkNightOwl().catch(() => {})
  }

  const handleRetry = async () => {
    const question = lastQuestionRef.current
    if (!question || loading) return
    await sendQuery(question)
    onChatQuestion().catch(() => {})
    checkNightOwl().catch(() => {})
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[720px] flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<span className="text-5xl">💬</span>}
              title="Ask about this document"
              description="Ask questions about the lecture material and get answers grounded in the document."
            />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-full rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-text-inverse'
                  : 'border border-border bg-white text-text'
              }`}
            >
              <p className="whitespace-pre-wrap text-body leading-relaxed">{msg.content}</p>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="mb-1.5 text-caption font-medium text-text-muted">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((src, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-caption text-text-muted"
                      >
                        <span className="font-medium text-text-secondary">[{src.chunkIndex}]</span>
                        {src.snippet}…
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3">
              <Spinner size="sm" />
              <span className="text-body text-text-secondary">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <div className="flex items-start justify-between gap-3">
              <span>{error}</span>
              <button
                onClick={handleRetry}
                disabled={loading}
                className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 disabled:opacity-50"
              >
                {loading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-6 py-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this document…"
            disabled={loading}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-body text-text placeholder-text-muted transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="md" leadingIcon={<Send className="h-4 w-4" />}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

function DocWorkspace() {
  const { docId } = useParams({ from: '/doc/$docId' })
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('summary')
  const documents = useAppStore((s) => s.documents)
  const fetchDocuments = useAppStore((s) => s.fetchDocuments)
  const doc = documents.find((d) => d.id === docId)
  const [loading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!doc) {
    return (
      <div className="p-8">
        <EmptyState title="Document not found" description="This document may have been deleted." />
      </div>
    )
  }

  const handleRename = async () => {
    const title = newTitle.trim()
    if (!title || title.length > 200) return
    setRenaming(true)
    try {
      const { error } = await supabase.from('documents').update({ title }).eq('id', docId)
      if (error) throw error
      await fetchDocuments()
      setShowMenu(false)
      showToast('success', 'Document renamed')
    } catch (err) {
      showToast('error', `Rename failed: ${(err as Error).message}`)
    } finally {
      setRenaming(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('documents').delete().eq('id', docId)
      if (error) throw error
      await fetchDocuments()
      showToast('success', 'Document deleted')
      navigate({ to: '/' })
    } catch (err) {
      showToast('error', `Delete failed: ${(err as Error).message}`)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleReindex = async () => {
    setReindexing(true)
    try {
      await embedDocument(docId)
      showToast('success', 'Re-indexing complete')
      setShowMenu(false)
    } catch (err) {
      showToast('error', `Re-index failed: ${(err as Error).message}`)
    } finally {
      setReindexing(false)
    }
  }

  const renderPanel = () => {
    if (loading) return <LoadingSkeleton tabId={activeTab} />

    if (activeTab === 'summary') {
      return <SummaryPanel key={docId} docId={docId} />
    }
    if (activeTab === 'quiz') {
      return <QuizPanel key={docId} docId={docId} />
    }
if (activeTab === 'exam') {
      return <PracticeExamPanel key={docId} />
    }
    if (activeTab === 'chat') {
      return <ChatPanel docId={docId} />
    }
    if (activeTab === 'notes') {
      return <NotesPanel docId={docId} />
    }
    if (activeTab === 'flashcards') {
      return <FlashcardPanel key={docId} docId={docId} />
    }

    return <PlaceholderPanel tabId={activeTab} docTitle={doc.title} />
  }

  return (
    <div className="flex h-full flex-col">
      {/* Document header */}
      <div className="border-b border-border bg-white">
        <PageContainer className="flex items-center justify-between py-5">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-muted hover:text-text transition-colors duration-150"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-pageTitle text-text truncate">{doc.title}</h1>
                <Badge variant="info">{doc.source_type}</Badge>
              </div>
              <p className="text-small text-text-muted">
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleReindex} isLoading={reindexing} disabled={reindexing} leadingIcon={!reindexing ? <RotateCcw className="h-4 w-4" /> : undefined}>
              {reindexing ? 'Re-indexing…' : 'Re-index'}
            </Button>
            <div ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-bg-muted hover:text-text-secondary transition-colors duration-150"
                aria-label="More actions"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
                  <button
                    onClick={() => { setNewTitle(doc.title); setShowMenu(false); setRenaming(true) }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-label text-text-secondary hover:bg-bg-muted hover:text-text transition-colors duration-150"
                  >
                    <Pencil className="h-4 w-4" />
                    Rename
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-label text-rose-600 hover:bg-rose-50 transition-colors duration-150"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </PageContainer>
      </div>

      {/* Rename inline dialog */}
      {renaming && (
        <div className="border-b border-border bg-bg-subtle px-6 md:px-8 py-3">
          <div className="mx-auto flex max-w-[1080px] items-center gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
              className="flex-1 rounded-md border border-border px-3 py-1.5 text-body text-text placeholder-text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="New title…"
              autoFocus
              disabled={renaming}
            />
            <Button size="sm" onClick={handleRename} isLoading={renaming} disabled={renaming || !newTitle.trim()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} disabled={renaming}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-label font-semibold text-text">Delete document?</h3>
                <p className="text-small text-text-muted">
                  All chunks, flashcards, and quiz questions will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
              <Button onClick={handleDelete} isLoading={deleting} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-700">
                {deleting ? 'Deleting…' : 'Delete document'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-border px-6 md:px-8 flex items-center justify-between gap-4">
        <Tabs tabs={workspaceTabs} activeTab={activeTab} onChange={setActiveTab} />
        <ExportMenu docId={docId} docTitle={doc?.title || docId} />
      </div>

      {/* Panel container */}
      <div className="flex-1 overflow-auto bg-white">
        <PageContainer className="py-0">
          {renderPanel()}
        </PageContainer>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/doc/$docId',
  component: DocWorkspace,
})



