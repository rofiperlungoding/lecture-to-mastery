import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { createRoute, Link, useParams, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAsyncQuery } from '../lib/useAsyncQuery'
import { useAppStore } from '../stores/useAppStore'
import { ragQueryStream, summarizeDocument, generateQuiz, fetchQuiz, generateFlashcards, fetchFlashcards, fetchDueFlashcards, reviewFlashcard, recordFlashcardReview, recordQuizAttempt, embedDocument, resetDocumentEmbeddings, getFailedChunksCount, generateConceptMap, logEvent, getConceptMastery, getDocumentMastery, generateTargetedPractice, fetchChatMessages, insertChatMessage, type SummaryResult, type ConceptMapData, type QuizQuestionItem, type FlashcardItem, type ConceptMasteryRow } from '../lib/api'
import { computeConceptRetentions, RETENTION_THRESHOLD, type ConceptRetention } from '../lib/retention'
import { RetentionCurve, RetentionDot } from '../components/RetentionCurve'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { SourceTransparencyPanel } from '../components/SourceTransparencyPanel'
import { onChatQuestion, checkNightOwl, onSessionCompleted, onDocumentStudied } from '../lib/gamification'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Card } from '../components/Card'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/Button'
import { SkeletonSummaryBlock, SkeletonQuizQuestion, SkeletonFlashcard, SkeletonConceptItem, SkeletonPanel, SkeletonActivityItem, GenerationProgress } from '../components/Skeleton'
import { MasteryRing } from '../components/Charts'
import { Celebration } from '../components/Celebration'
import { ShareButton } from '../components/ShareButton'
import { MasteryGrowth } from '../components/MasteryGrowth'
import { Stagger } from '../components/motion'
import { NotesPanel } from '../components/NotesPanel'
import { Badge } from '../components/Badge'
import { ChevronLeft, RefreshCw, Check, Feather, GitBranch, Sparkles, Loader2, Send, Pencil, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import type { Tab } from '../components/Tabs'
import { useHighlightSelection } from '../components/HighlightTooltip'
import { ExportMenu } from '../components/ExportMenu'

// Lazy-loaded heavy components
const ConceptMapPanel = lazy(() => import('../components/ConceptMapPanel')) // @xyflow/react ~179kB
const PracticeExamPanel = lazy(() => import('../components/PracticeExamPanel').then(m => ({ default: m.PracticeExamPanel })))

const workspaceTabs: Tab[] = [
  { id: 'exam', label: 'Exam' },
  { id: 'summary', label: 'Summary' },
  { id: 'map', label: 'Map' },
  { id: 'mastery', label: 'Mastery' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'chat', label: 'Chat' },
  { id: 'notes', label: 'Notes' },
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: { chunkIndex: number; snippet: string }[]
  confidence?: 'high' | 'medium' | 'low'
  enhancedSources?: Array<{ chunkIndex: number; snippet: string; score: number }>
}

interface QuizState {
  questions: QuizQuestionItem[]
  current: number
  selected: number | null
  submitted: boolean
  answers: { selected: number; correct: number }[]
  phase: 'idle' | 'taking' | 'done'
}

function QuizPanel({ docId, docTitle }: { docId: string; docTitle?: string }) {
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
  const [_persisting, _setPersisting] = useState(false)
  const [quizCelebration, setQuizCelebration] = useState(false)

    // Staged progress state for quiz generation
  const [quizStage, setQuizStage] = useState<'idle' | 'reading' | 'writing' | 'done'>('idle')

  const quizStages = [
    { key: 'reading', label: 'Reading document...' },
    { key: 'writing', label: 'Creating questions...' },
  ]

  // On mount, check if quiz already exists (e.g. from prefetch)
  useEffect(() => {
    fetchQuiz(docId).then((questions) => {
      if (questions && questions.length > 0) {
        setState({
          questions,
          current: 0,
          selected: null,
          submitted: false,
          answers: [],
          phase: 'taking',
        })
      }
    }).catch(() => {})
  }, [docId])

  const generate = useCallback(async () => {
    setGenerating(true)
    setQuizStage('reading')
    setError(null)
    // Simulate staged progress — the actual generation moves through stages
    const stageTimer = setTimeout(() => setQuizStage('writing'), 2000)
    try {
      await generateQuiz(docId)
      clearTimeout(stageTimer)
      setQuizStage('done')
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
      clearTimeout(stageTimer)
      setError((err as Error).message)
    } finally {
      setGenerating(false)
      setQuizStage('idle')
    }
  }, [docId])

  const submitAnswer = () => {
    if (state.selected === null) return
    const q = state.questions[state.current]
    const isCorrect = state.selected === q.correct_index
    const newAnswers = [
      ...state.answers,
      { selected: state.selected, correct: q.correct_index },
    ]
    setState({ ...state, submitted: true, answers: newAnswers })
    logEvent(docId, 'quiz_answer', { question: q.question, concept: q.concept, is_correct: isCorrect, selected_index: state.selected, correct_index: q.correct_index })
  }

  const nextQuestion = () => {
    if (state.current + 1 >= state.questions.length) {
      // Persist quiz result when quiz completes
      const correctCount = state.answers.filter((a) => a.selected === a.correct).length
      recordQuizAttempt(docId, correctCount, state.questions.length).catch(() => {})
      logEvent(docId, 'quiz_completed', { score: correctCount, total: state.questions.length })
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

  // Celebration trigger for good quiz scores
  const isGoodScore = state.phase === 'done' && state.answers.length === state.questions.length &&
    (correctCount / state.questions.length) >= 0.7 && state.answers.length > 0

  useEffect(() => {
    if (isGoodScore) {
      const t = setTimeout(() => setQuizCelebration(true), 300)
      return () => clearTimeout(t)
    } else {
      setQuizCelebration(false)
    }
  }, [isGoodScore])

  if (state.phase === 'idle') {
    return (
      <div className="p-6">
        <EmptyState
          illustration="quiz"
          title="No quiz yet"
          description="Generate a multiple-choice quiz to check your understanding of this material."
          action={
            <Button onClick={generate} isLoading={generating} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Quiz'}
            </Button>
          }
        />

        {generating && (
          <div className="mt-6">
            <GenerationProgress stages={quizStages} currentStage={quizStage} />
          </div>
        )}
        
        {error && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{error}</span>
            <button
              onClick={generate}
              disabled={generating}
              className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
              aria-label={generating ? 'Retrying quiz generation' : 'Retry quiz generation'}
            >
              {generating ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (state.phase === 'done') {
    return (
      <div className="space-y-6 p-6">
        {quizCelebration && (
          <Celebration
            show={quizCelebration}
            message={correctCount === state.questions.length ? 'Perfect score! 🎉' : 'Great job! Keep it up!'}
            onDone={() => setQuizCelebration(false)}
            duration={1500}
          />
        )}
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm ring-1 ring-black/5">
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

        <div className="flex flex-wrap gap-3 items-center">
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
          <ShareButton
            type="quiz"
            value={Math.round((correctCount / state.questions.length) * 100)}
            secondaryValue={`${correctCount}/${state.questions.length}`}
            title={docTitle ?? 'Quiz'}
            subtitle={correctCount === state.questions.length ? 'Perfect score!' : correctCount >= state.questions.length / 2 ? 'Good job!' : 'Keep studying!'}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{error}</span>
            <button
              onClick={generate}
              disabled={generating}
              className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
              aria-label={generating ? 'Retrying quiz generation' : 'Retry quiz generation'}
            >
              {generating ? 'Retrying...' : 'Retry'}
            </button>
          </div>
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
    <div className="mx-auto max-w-reading-panel p-6">
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
              aria-selected={isSelected}
              className={`flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-body transition-all duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                state.submitted
                  ? isCorrect
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : isWrong
                      ? 'border-rose-400 bg-rose-50 text-rose-900'
                      : 'border-border bg-surface text-text-muted'
                  : isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border bg-surface text-text-secondary hover:border-border-strong hover:bg-bg-subtle'
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
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
          <span>{error}</span>
          <button
            onClick={generate}
            disabled={generating}
            className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 disabled:opacity-50"
          >
            {generating ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  )
}

function MasteryPanel({ docId, docTitle, onStudyWeakSpots }: { docId: string; docTitle?: string; onStudyWeakSpots?: (mode: 'quiz' | 'flashcards') => void }) {
  const [concepts, setConcepts] = useState<ConceptMasteryRow[]>([])
  const [overallMastery, setOverallMastery] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const prevMasteryRef = useRef<number | null>(null)

  // Retention state
  const [retentions, setRetentions] = useState<ConceptRetention[]>([])
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)

  const fetchMastery = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Save current mastery as previous before fetching new data
      prevMasteryRef.current = overallMastery
      const [conceptRows, docMastery, fcList] = await Promise.all([
        getConceptMastery(docId),
        getDocumentMastery(docId),
        fetchFlashcards(docId).catch(() => [] as FlashcardItem[]),
      ])
      setConcepts(conceptRows)
      setOverallMastery(docMastery)

      // Compute predicted retention for each concept
      const retentions = computeConceptRetentions(conceptRows, fcList)
      setRetentions(retentions)

      // Select the most at-risk concept by default
      const mostAtRisk = retentions.find((r) => r.atRisk)
      if (mostAtRisk) {
        setSelectedConcept(mostAtRisk.concept)
      } else if (retentions.length > 0) {
        setSelectedConcept(retentions[0].concept)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    fetchMastery()
  }, [fetchMastery])

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Spinner size="md" />
            <span className="text-body text-text-secondary">Loading mastery data...</span>
          </div>
          <SkeletonConceptItem />
          <SkeletonConceptItem />
          <SkeletonConceptItem />
          <SkeletonConceptItem />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
          <span>{error}</span>
          <button onClick={fetchMastery} className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 hover:bg-rose-200 transition-colors">Retry</button>
        </div>
      </div>
    )
  }

  if (concepts.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          illustration="quiz"
          title="No mastery data yet"
          description="Take a quiz to see which concepts you've mastered and which need more review."
          action={onStudyWeakSpots ? (
            <Button variant="secondary" disabled>
              Study weak spots
            </Button>
          ) : undefined}
        />
      </div>
    )
  }

  const weakCount = concepts.filter((c) => c.masteryPct < 70).length
  const atRiskCount = retentions.filter((r) => r.atRisk).length

  // Find selected concept retention data for the curve
  const selectedRetention = retentions.find((r) => r.concept === selectedConcept)

  return (
    <MasteryGrowth
      justStudied={prevMasteryRef.current !== null && overallMastery !== null && overallMastery !== prevMasteryRef.current}
      previousMastery={prevMasteryRef.current}
      currentMastery={overallMastery ?? 0}
    >
    <div className="mx-auto max-w-reading-panel space-y-6 p-6">
      {/* Overall mastery score — Fitness-style ring */}
      {overallMastery !== null && (
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-3">Overall Mastery</p>
          <MasteryRing value={overallMastery} size={140} strokeWidth={10} />
          <div className="mt-4">
            <ShareButton
              type="mastery"
              value={overallMastery}
              title={docTitle ?? 'Mastery'}
              subtitle={`${concepts.length} concept${concepts.length !== 1 ? 's' : ''} tracked`}
            />
          </div>
        </div>
      )}

      {/* Weak-spot detection alert */}
      {weakCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-label font-medium text-amber-800">{weakCount} weak spot{weakCount !== 1 ? 's' : ''} identified</p>
              <p className="mt-0.5 text-small text-amber-700">
                Concepts below 70% mastery. Generate targeted practice to improve.
              </p>
            </div>
            {onStudyWeakSpots && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onStudyWeakSpots('quiz')}>
                  Quiz
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onStudyWeakSpots('flashcards')}>
                  Flashcards
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* At-risk retention alert */}
      {atRiskCount > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-label font-medium text-violet-800">{atRiskCount} concept{atRiskCount !== 1 ? 's' : ''} at risk of forgetting</p>
              <p className="mt-0.5 text-small text-violet-600">
                Predicted retention below {Math.round(RETENTION_THRESHOLD * 100)}%. Review soon to reinforce memory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Concept bars with retention indicators */}
      <div>
        <h3 className="text-title-3 text-text mb-3 flex items-center gap-2">
          Concepts
          <span className="text-footnote font-normal text-text-muted">
            — mastery (bar) · retention (dot)
          </span>
        </h3>
        <div className="space-y-2">
          {concepts.map((concept, idx) => {
            const retention = retentions.find((r) => r.concept === concept.concept)
            const isSelected = selectedConcept === concept.concept
            return (
              <button
                key={concept.concept}
                onClick={() => setSelectedConcept(concept.concept)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? 'border-brand-300 bg-brand-50/50 ring-1 ring-brand-500/20'
                    : 'border-border hover:border-border-strong hover:bg-surface-subtle'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-footnote text-text-muted tabular-nums w-5 shrink-0">{idx + 1}.</span>
                  <span className="text-label text-text flex-1 truncate">{concept.concept}</span>
                  {retention && (
                    <>
                      <RetentionDot probability={retention.recallProbability} size={8} />
                      {retention.atRisk && (
                        <span className="text-footnote font-medium text-violet-600 shrink-0">
                          Refresh
                        </span>
                      )}
                    </>
                  )}
                </div>
                {/* Mastery bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        concept.masteryPct >= 80 ? 'bg-emerald-500'
                        : concept.masteryPct >= 50 ? 'bg-amber-500'
                        : 'bg-rose-500'
                      }`}
                      style={{ width: `${concept.masteryPct}%` }}
                    />
                  </div>
                  <span className="text-footnote tabular-nums text-text-muted">{concept.masteryPct}%</span>
                  {retention && (
                    <span className={`text-footnote tabular-nums ${
                      retention.recallProbability >= 0.8 ? 'text-emerald-600'
                      : retention.recallProbability >= 0.6 ? 'text-violet-600'
                      : 'text-amber-600'
                    }`}>
                      R:{Math.round(retention.recallProbability * 100)}%
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Retention curve for selected concept */}
      {selectedRetention && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-title-3 text-text flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-500" />
              Retention curve
            </h3>
            <span className="text-caption text-text-muted">
              <span className="italic">Estimated</span> for &quot;{selectedRetention.concept.slice(0, 30)}&quot;
            </span>
          </div>
          <RetentionCurve
            stabilityHours={selectedRetention.stabilityHours}
            daysToShow={30}
            reviewDays={[]}
            width={400}
            height={140}
            className="w-full"
          />
          <p className="mt-2 text-footnote text-text-muted italic flex items-center gap-1">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Predictions are estimates. Individual recall varies.
          </p>
        </div>
      )}
    </div>
    </MasteryGrowth>
  )
}

function PlaceholderPanel({ tabId }: { tabId: string }) {
  if (tabId === 'flashcards') {
    return <div className="hidden" />
  }
  if (tabId === 'mastery') {
    return <div className="hidden" />
  }
  if (tabId === 'map') {
    return <div className="hidden" />
  }
  const tab = workspaceTabs.find((t) => t.id === tabId)!
  const label = tab.label

  return (
    <div className="p-6">
      <EmptyState
        illustration="sparkle"
        title={`No ${label} yet`}
        description="Generate content for this document to see it here."
        action={<Button variant="secondary" disabled>Generate {label}</Button>}
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

function FlashcardPanel({ docId, docTitle, onReviewComplete }: { docId: string; docTitle?: string; onReviewComplete?: () => void }) {
  const [cards, setCards] = useState<FlashcardItem[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'studying' | 'done'>('idle')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<CardReview[]>([])
  const [filterMode, setFilterMode] = useState<'due' | 'all'>('all')
  const [lastReviewResult, setLastReviewResult] = useState<string | null>(null)

  // On mount, check if flashcards already exist (e.g. from prefetch)
  useEffect(() => {
    fetchFlashcards(docId).then((fetched) => {
      if (fetched && fetched.length > 0) {
        setCards(fetched)
        setCurrent(0)
        setFlipped(false)
        setReviews([])
        setPhase('studying')
      }
    }).catch(() => {})
  }, [docId])

  // Staged progress for flashcard generation
  const [fcStage, setFcStage] = useState<'idle' | 'reading' | 'writing' | 'done'>('idle')

  const fcStages = [
    { key: 'reading', label: 'Reading document...' },
    { key: 'writing', label: 'Creating flashcards...' },
  ]

  const generate = useCallback(async (mode?: 'due' | 'all') => {
    const targetMode = mode || filterMode
    setGenerating(true)
    setFcStage('reading')
    setError(null)
    const stageTimer = setTimeout(() => setFcStage('writing'), 2000)
    try {
      await generateFlashcards(docId)
      clearTimeout(stageTimer)
      setFcStage('done')
      const fetched = targetMode === 'due'
        ? await fetchDueFlashcards(docId)
        : await fetchFlashcards(docId)
      setCards(fetched)
      setCurrent(0)
      setFlipped(false)
      setReviews([])
      setPhase('studying')
    } catch (err) {
      clearTimeout(stageTimer)
      setError((err as Error).message)
    } finally {
      setGenerating(false)
      setFcStage('idle')
    }
  }, [docId, filterMode])

  const handleFlip = () => {
    if (!flipped) setFlipped(true)
  }

  const handleRate = async (rating: Rating) => {
    const card = cards[current]
    setReviews((prev) => [...prev, { flashcardId: card.id, front: card.front, rating }])

    try {
      const result = await reviewFlashcard(card.id, rating)
      // Briefly show the next interval
      setLastReviewResult(result.nextReview)
      setTimeout(() => setLastReviewResult(null), 2500)
      logEvent(docId, 'flashcard_review', { flashcardId: card.id, rating })
      onReviewComplete?.()
    } catch {
      // Fallback: client-side SM-2
      recordFlashcardReview(card.id, rating, card.ease, card.interval_days).catch(() => {})
    }

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
          illustration="sparkle"
          title="No flashcards yet"
          description="Generate flashcards to test your knowledge with spaced repetition."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => generate('due')} isLoading={generating} disabled={generating}>
                {generating ? 'Generating…' : 'Generate Flashcards'}
              </Button>
            </div>
          }
        />

        {generating && (
          <div className="mt-6">
            <GenerationProgress stages={fcStages} currentStage={fcStage} />
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{error}</span>
            <button
              onClick={() => generate()}
              disabled={generating}
              className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
              aria-label={generating ? 'Retrying flashcard generation' : 'Retry flashcard generation'}
            >
              {generating ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    const againCount = reviews.filter((r) => r.rating === 'again').length
    const hardCount = reviews.filter((r) => r.rating === 'hard').length
    const goodCount = reviews.filter((r) => r.rating === 'good').length
    const easyCount = reviews.filter((r) => r.rating === 'easy').length
    const graduatedCount = reviews.filter((r) => r.rating === 'good' || r.rating === 'easy').length
    const resetCount = reviews.filter((r) => r.rating === 'again' || r.rating === 'hard').length

    return (
      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-h2 text-brand-500">
            {graduatedCount}/{reviews.length}
          </p>
          <p className="mt-2 text-body text-text-secondary">
            {resetCount === 0
              ? 'All cards graduated!'
              : graduatedCount >= reviews.length / 2
                ? 'Good progress!'
                : 'Keep practicing!'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2.5 text-label">
            <span className="font-medium text-emerald-700">Graduated (Good/Easy)</span>
            <span className="font-bold text-emerald-700">{graduatedCount}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-2.5 text-label">
            <span className="font-medium text-rose-700">Reset (Again/Hard)</span>
            <span className="font-bold text-rose-700">{resetCount}</span>
          </div>
          <div className="border-t border-border pt-2 mt-2 space-y-2">
            <div className="flex items-center justify-between text-small text-text-muted">
              <span>Again</span>
              <span>{againCount}</span>
            </div>
            <div className="flex items-center justify-between text-small text-text-muted">
              <span>Hard</span>
              <span>{hardCount}</span>
            </div>
            <div className="flex items-center justify-between text-small text-text-muted">
              <span>Good</span>
              <span>{goodCount}</span>
            </div>
            <div className="flex items-center justify-between text-small text-text-muted">
              <span>Easy</span>
              <span>{easyCount}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {againCount > 0 && (
            <Button variant="secondary" onClick={handleRetry}>
              Restudy {againCount} card{againCount > 1 ? 's' : ''}
            </Button>
          )}
          <Button onClick={() => generate('all')} isLoading={generating} disabled={generating}>
            {generating ? 'Regenerating…' : 'Generate New Set'}
          </Button>
          <ShareButton
            type="streak"
            value={graduatedCount}
            secondaryValue={`${graduatedCount}/${reviews.length} graduated`}
            title={docTitle ?? 'Flashcards'}
            subtitle={resetCount === 0 ? 'All cards graduated!' : graduatedCount >= reviews.length / 2 ? 'Good progress!' : 'Keep practicing!'}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{error}</span>
            <button
              onClick={() => generate()}
              disabled={generating}
              className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
              aria-label={generating ? 'Retrying flashcard generation' : 'Retry flashcard generation'}
            >
              {generating ? 'Retrying...' : 'Retry'}
            </button>
          </div>
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
          action={<Button onClick={() => generate()}>Generate Flashcards</Button>}
        />
      </div>
    )
  }

  const card = cards[current]
  const progress = ((current + (flipped ? 1 : 0)) / cards.length) * 100

  return (
    <div className="mx-auto max-w-narrow p-6">
      {/* Filter mode toggle */}
      <div className="mb-4 flex items-center justify-between">          <div className="flex gap-1 rounded-lg bg-surface p-0.5" role="tablist" aria-label="Flashcard filter mode">
          <button
            onClick={() => {
              setFilterMode('due')
              fetchDueFlashcards(docId).then((due) => {
                setCards(due)
                setCurrent(0)
                setFlipped(false)
                setReviews([])
              }).catch(() => {})
            }}
            role="tab"
            aria-selected={filterMode === 'due'}
            className={`rounded-md px-3 py-1 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              filterMode === 'due'
                ? 'bg-surface-elevated text-text shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Due today
          </button>
          <button
            onClick={() => {
              setFilterMode('all')
              fetchFlashcards(docId).then((all) => {
                setCards(all)
                setCurrent(0)
                setFlipped(false)
                setReviews([])
              }).catch(() => {})
            }}
            role="tab"
            aria-selected={filterMode === 'all'}
            className={`rounded-md px-3 py-1 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              filterMode === 'all'
                ? 'bg-surface-elevated text-text shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            All cards
          </button>
        </div>
        <span className="text-caption text-text-muted">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Last review result toast */}
      {lastReviewResult && (
        <div className="mb-3 rounded-lg bg-brand-50 px-4 py-2 text-center text-small font-medium text-brand-700 animate-in fade-in slide-in-from-top-1">
          Next review {lastReviewResult}
        </div>
      )}

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
          <div className="absolute inset-0 backface-hidden flex items-center justify-center rounded-xl border-2 border-border bg-surface p-8 text-center shadow-md">
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
          <p className="mb-3 text-center text-caption font-medium text-text-muted" id="flashcard-rating-label">How well did you know this?</p>
          <div className="grid grid-cols-4 gap-3" role="group" aria-labelledby="flashcard-rating-label">
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

      {error && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
          <span>{error}</span>
          <button
            onClick={() => generate()}
            disabled={generating}
            className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 disabled:opacity-50"
          >
            {generating ? 'Retrying...' : 'Retry'}
          </button>
        </div>
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
  const [_conceptMapError, _setConceptMapError] = useState<string | null>(null)
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
      logEvent(docId, 'summary_view', { mode: m })
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
    _setConceptMapError(null)
    try {
      const result = await generateConceptMap(docId)
      setConceptMap(result)
    } catch (err) {
      _setConceptMapError((err as Error).message)
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
          <SkeletonSummaryBlock />
        </div>
      </div>
    )
  }

  if (summaryError && !Object.values(summary).some((s) => s)) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{summaryError}</div>
        <div className="mt-4">
          <Button onClick={() => fetchMode(mode)} variant="secondary" size="sm">Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex gap-1 rounded-lg bg-surface p-1">
        <button
          onClick={() => setSummaryTab('summary')}
          role="tab"
          aria-selected={summaryTab === 'summary'}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' + (summaryTab === 'summary' ? 'bg-surface-elevated text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >Summary</button>
        <button
          onClick={() => setSummaryTab('concept-map')}
          role="tab"
          aria-selected={summaryTab === 'concept-map'}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' + (summaryTab === 'concept-map' ? 'bg-surface-elevated text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >Concept Map</button>
      </div>

      {summaryTab === 'summary' && (
        <>
          <div className="flex gap-1 rounded-lg bg-surface p-0.5">
            {modes.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} disabled={summaryLoading[m.id] && !summary[m.id]}
                aria-pressed={mode === m.id}
                className={'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' + (mode === m.id ? 'bg-surface-elevated text-brand-700 shadow-sm' : 'text-text-muted hover:text-text-secondary') + ' disabled:cursor-not-allowed disabled:opacity-50'}
              >
                {summaryLoading[m.id] && !summary[m.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {currentSummary && (
            <>
              <div ref={summaryRef} onMouseUp={handleMouseUp} className="max-w-prose">
              <div className="flex items-center justify-between">
                <h2 className="text-title-2 text-text text-balance">{mode === 'eli5' ? 'Simplified' : mode === 'detailed' ? 'Detailed' : 'Cheat Sheet'}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  {currentSummary.cached && <span className="text-footnote text-text-muted">Cached</span>}
                  <Button variant="ghost" size="sm" onClick={() => fetchMode(mode)} isLoading={isCurrentLoading} disabled={isCurrentLoading}
                    leadingIcon={!isCurrentLoading ? <RefreshCw className="h-4 w-4" /> : undefined}>Regenerate</Button>
                </div>
              </div>

              {isCurrentLoading && currentSummary && (
                <div className="flex items-center gap-2 text-footnote text-text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                </div>
              )}

              <Stagger staggerDelay={60}>
              <div className="relative overflow-hidden rounded-xl bg-brand-50">
                <div className="absolute left-0 top-0 h-full w-1 bg-brand-500" />
                <div className="pl-6 pr-6 py-5">
                  <h3 className="text-subhead font-semibold text-brand-700 mb-2">TL;DR</h3>
                  <p className="text-body leading-relaxed text-text max-w-reading">{currentSummary.tldr}</p>
                </div>
              </div>

              <div>
                <h3 className="text-title-3 text-text mb-4">Key Points</h3>
                <ul className="space-y-3 max-w-reading">
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
                <h3 className="text-title-3 text-text mb-4">Key Terms</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {currentSummary.keyTerms.map((kt, i) => (
                    <Card key={i} padding="sm">
                      <p className="mb-1 text-subhead font-semibold text-brand-700">{kt.term}</p>
                      <p className="text-footnote text-text-secondary">{kt.definition}</p>
                    </Card>
                  ))}
                </div>
              </div>
              </Stagger>
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
              <Button variant="secondary" size="sm" onClick={fetchConceptMap} isLoading={conceptMapLoading}>Generate</Button>
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
  if (tabId === 'summary') {
    return (
      <div className="p-6">
        <SkeletonPanel>Loading summary...</SkeletonPanel>
        <SkeletonSummaryBlock />
      </div>
    )
  }
  if (tabId === 'quiz') {
    return (
      <div className="p-6">
        <SkeletonPanel>Loading quiz...</SkeletonPanel>
        <SkeletonQuizQuestion />
      </div>
    )
  }
  if (tabId === 'flashcards') {
    return (
      <div className="p-6">
        <SkeletonPanel>Loading flashcards...</SkeletonPanel>
        <SkeletonFlashcard />
      </div>
    )
  }
  if (tabId === 'mastery') {
    return (
      <div className="p-6">
        <SkeletonPanel>Loading mastery data...</SkeletonPanel>
        <div className="space-y-3">
          <SkeletonConceptItem />
          <SkeletonConceptItem />
          <SkeletonConceptItem />
          <SkeletonConceptItem />
        </div>
      </div>
    )
  }
  if (tabId === 'chat') {
    return (
      <div className="p-6">
        <SkeletonPanel>Loading chat...</SkeletonPanel>
        <div className="space-y-4">
          <SkeletonActivityItem />
          <SkeletonActivityItem />
        </div>
      </div>
    )
  }
  const tab = workspaceTabs.find((t) => t.id === tabId)!
  return (
    <div className="p-6">
      <SkeletonPanel>Loading {tab.label.toLowerCase()}...</SkeletonPanel>
    </div>
  )
}

function ChatPanel({ docId }: { docId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const lastQuestionRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetchChatMessages(docId).then((rows) => {
      const msgs: ChatMessage[] = rows.map((r: any) => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      }))
      setMessages(msgs)
    }).catch(() => {}).finally(() => setInitialLoading(false))
  }, [docId])

  type SourceItem = { chunkIndex?: number; chunk_index?: number; snippet?: string; content?: string }
  const sendQuery = async (question: string) => {
    setError(null)
    setLoading(true)

    // Add placeholder message
    setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [], confidence: 'low', enhancedSources: [] }])

    let accumulated = ''
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let tokenCount = 0
    let resultConfidence: 'high' | 'medium' | 'low' = 'low'
    let resultEnhancedSources: Array<{ chunkIndex: number; snippet: string; score: number }> = []

    const flushToUI = () => {
      flushTimer = null
      setMessages((prev) => {
        const copy = [...prev]
        if (copy.length > 0) copy[copy.length - 1] = { role: 'assistant', content: accumulated, sources: [], confidence: resultConfidence, enhancedSources: resultEnhancedSources }
        return copy
      })
    }

    const scheduleFlush = () => {
      if (flushTimer) return
      flushTimer = setTimeout(flushToUI, 40)
    }

    try {
      const { sources, confidence: c, enhancedSources: es } = await ragQueryStream(docId, question, (token) => {
        accumulated += token
        tokenCount++
        // Throttle: flush every 5 tokens or 40ms (whichever comes first)
        if (tokenCount % 5 === 0) scheduleFlush()
      })

      resultConfidence = c
      resultEnhancedSources = es || []

      // Final flush with sources
      if (flushTimer) clearTimeout(flushTimer)
      setMessages((prev) => {
        const copy = [...prev]
        if (copy.length > 0) copy[copy.length - 1] = {
          role: 'assistant',
          content: accumulated,
          sources: sources?.map((s: SourceItem) => ({
            chunkIndex: s.chunkIndex ?? s.chunk_index ?? 0,
            snippet: s.snippet ?? (s.content || '').slice(0, 140)
          })) || [],
          confidence: resultConfidence,
          enhancedSources: resultEnhancedSources,
        }
        return copy
      })
      if (accumulated.trim()) {
        insertChatMessage(docId, 'assistant', accumulated).catch(() => {})
      }
    } catch (err) {
      // Remove placeholder on error
      setMessages((prev) => prev.slice(0, -1))
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
    insertChatMessage(docId, 'user', question).catch(() => {})
    await sendQuery(question)
    logEvent(docId, 'chat_query', { question })
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
        {messages.length === 0 && !loading && !initialLoading && (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              illustration="chat"
              title="Ask about this document"
              description="Ask questions about the material and get answers grounded in the document."
            />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-full rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-text-inverse'
                  : 'border border-border bg-surface text-text'
              }`}
            >
              <p className="whitespace-pre-wrap text-body leading-relaxed">{msg.content}</p>

              {/* Confidence badge for assistant messages */}
              {msg.role === 'assistant' && msg.confidence && (
                <div className="mt-3 flex items-center gap-2">
                  <ConfidenceBadge confidence={msg.confidence} />
                  {msg.confidence === 'low' && (
                    <span className="text-footnote text-amber-600">
                      Try rephrasing — this may not be covered in the document.
                    </span>
                  )}
                </div>
              )}

              {/* Source transparency panel */}
              {msg.role === 'assistant' && msg.confidence && msg.enhancedSources && msg.enhancedSources.length > 0 && (
                <SourceTransparencyPanel
                  confidence={msg.confidence}
                  sources={msg.enhancedSources}
                />
              )}

              {/* Legacy simple source display (backup) */}
              {msg.sources && msg.sources.length > 0 && (!msg.enhancedSources || msg.enhancedSources.length === 0) && (
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
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
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
                className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 transition-colors duration-150 ease-out hover:bg-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
                aria-label={loading ? 'Retrying chat query' : 'Retry chat query'}
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
  const [failedChunks, setFailedChunks] = useState<number | null>(null)
  const [dueFlashcardCount, setDueFlashcardCount] = useState(0)
  const [_targetedGenerating, _setTargetedGenerating] = useState(false)
  const [masteryRefreshKey, setMasteryRefreshKey] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchCache = useRef<{
    summaries?: Record<string, SummaryResult>
    quizGenerated?: boolean
    flashcardsGenerated?: boolean
    conceptMapGenerated?: boolean
  }>({})

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Check for failed (unembedded) chunks when document opens
  const { data: failedCount } = useAsyncQuery(
    (signal) => getFailedChunksCount(docId, { signal }),
    [docId],
  );

  useEffect(() => {
    if (failedCount !== null) setFailedChunks(failedCount);
  }, [failedCount])

  // Fetch due flashcard count (cancellable on unmount)
  const { data: dueCount, refetch: refetchDueCount } = useAsyncQuery(
    async (signal) => {
      const now = new Date().toISOString()
      const { count } = await supabase
        .from('flashcards')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', docId)
        .lte('due_at', now)
        .abortSignal(signal)
      return count ?? 0
    },
    [docId],
  );

  useEffect(() => {
    if (dueCount !== null) setDueFlashcardCount(dueCount);
  }, [dueCount])

  const handleFlashcardReview = useCallback(() => {
    refetchDueCount();
  }, [refetchDueCount])

  // ===== Prefetch on tab hover (150ms debounce) =====
  const handleTabHover = useCallback((tabId: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (tabId === 'summary') {
      hoverTimerRef.current = setTimeout(() => {
        if (!prefetchCache.current.summaries) {
          prefetchCache.current.summaries = {}
          // Start fetching all 3 summary modes in background
          const modes = ['eli5', 'detailed', 'cheat-sheet'] as const
          for (const mode of modes) {
            summarizeDocument(docId, mode).then((result) => {
              if (prefetchCache.current.summaries) {
                prefetchCache.current.summaries[mode] = result
              }
            }).catch(() => {})
          }
        }
      }, 150)
    } else if (tabId === 'quiz') {
      hoverTimerRef.current = setTimeout(async () => {
        if (prefetchCache.current.quizGenerated) return
        // Check if quiz already exists — if so, skip generation
        try {
          const existing = await fetchQuiz(docId)
          if (existing && existing.length > 0) {
            prefetchCache.current.quizGenerated = true
            return
          }
        } catch { /* proceed to generate */ }
        generateQuiz(docId).then(() => {
          prefetchCache.current.quizGenerated = true
        }).catch(() => {})
      }, 150)
    } else if (tabId === 'flashcards') {
      hoverTimerRef.current = setTimeout(async () => {
        if (prefetchCache.current.flashcardsGenerated) return
        // Check if flashcards already exist — if so, skip generation
        try {
          const existing = await fetchFlashcards(docId)
          if (existing && existing.length > 0) {
            prefetchCache.current.flashcardsGenerated = true
            return
          }
        } catch { /* proceed to generate */ }
        generateFlashcards(docId).then(() => {
          prefetchCache.current.flashcardsGenerated = true
        }).catch(() => {})
      }, 150)
    } else if (tabId === 'map') {
      hoverTimerRef.current = setTimeout(async () => {
        if (prefetchCache.current.conceptMapGenerated) return
        try {
          const result = await generateConceptMap(docId)
          if (result.nodes && result.nodes.length > 0) {
            prefetchCache.current.conceptMapGenerated = true
          }
        } catch { /* silently retry on tab click */ }
      }, 150)
    }
  }, [docId])

  // Study weak spots: generate targeted practice and switch to the right tab
  const handleStudyWeakSpots = useCallback(async (mode: 'quiz' | 'flashcards') => {
    _setTargetedGenerating(true)
    try {
      await generateTargetedPractice(docId, mode)
      setActiveTab(mode === 'quiz' ? 'quiz' : 'flashcards')
      // Increment refresh key so mastery panel re-mounts and re-fetches when user returns
      setMasteryRefreshKey((k) => k + 1)
      showToast('success', `Targeted ${mode === 'quiz' ? 'quiz' : 'flashcards'} generated for your weak spots!`)
    } catch (err) {
      showToast('error', `Failed to generate targeted practice: ${(err as Error).message}`)
    } finally {
      _setTargetedGenerating(false)
    }
  }, [docId])

  if (!doc) {
    return (
      <div className="p-8">
        <EmptyState illustration="sparkle" title="Document not found" description="This document may have been deleted or you may not have access to it." />
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
      await resetDocumentEmbeddings(docId)
      const result = await embedDocument(docId)
      if (result.failedCount > 0) {
        showToast('warning', `Re-indexed with ${result.failedCount} chunks still failing.`)
        setFailedChunks(result.failedCount)
      } else {
        showToast('success', `Re-index complete! ${result.embedded} chunks indexed.`)
        setFailedChunks(0)
      }
      setShowMenu(false)
    } catch (err) {
      showToast('error', `Re-index failed: ${(err as Error).message}`)
    } finally {
      setReindexing(false)
    }
  }

  const renderPanel = () => {
    const panelKey = `${activeTab}-${docId}`

    if (loading) return <LoadingSkeleton tabId={activeTab} />

    const content = (() => {
      if (activeTab === 'summary') {
        return (
          <ErrorBoundary context="SummaryPanel">
            <SummaryPanel key={docId} docId={docId} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'quiz') {
        return (
          <ErrorBoundary context="QuizPanel">
            <QuizPanel key={docId} docId={docId} docTitle={doc?.title} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'exam') {
        return (
          <ErrorBoundary context="ExamPanel">
            <Suspense fallback={<div className="p-6"><Spinner size="md" /><span className="ml-3 text-body text-text-secondary">Loading exam...</span></div>}>
              <PracticeExamPanel key={docId} />
            </Suspense>
          </ErrorBoundary>
        )
      }
      if (activeTab === 'chat') {
        return (
          <ErrorBoundary context="ChatPanel">
            <ChatPanel docId={docId} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'notes') {
        return (
          <ErrorBoundary context="NotesPanel">
            <NotesPanel docId={docId} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'mastery') {
        return (
          <ErrorBoundary context="MasteryPanel">
            <MasteryPanel key={`mastery-${docId}-${masteryRefreshKey}`} docId={docId} docTitle={doc?.title} onStudyWeakSpots={handleStudyWeakSpots} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'flashcards') {
        return (
          <ErrorBoundary context="FlashcardPanel">
            <FlashcardPanel key={docId} docId={docId} docTitle={doc?.title} onReviewComplete={handleFlashcardReview} />
          </ErrorBoundary>
        )
      }
      if (activeTab === 'map') {
        return (
          <ErrorBoundary context="ConceptMapPanel">
            <Suspense fallback={<div className="p-6"><Spinner size="md" /><span className="ml-3 text-body text-text-secondary">Loading concept map...</span></div>}>
              <ConceptMapPanel key={docId} docId={docId} />
            </Suspense>
          </ErrorBoundary>
        )
      }
      return <PlaceholderPanel tabId={activeTab} />
    })()

    /* Subtle cross-fade on tab switch */
    return <div key={panelKey} className="animate-tab-enter">{content}</div>
  }

  return (
    <div className="flex h-full flex-col animate-scale-in"
      style={{ animationDuration: 'var(--dur-slow)', animationFillMode: 'both' }}>
      {/* Sticky translucent header with doc info + tabs */}
      <div className="sticky top-0 z-sticky chrome border-b border-border-hairline">
        {/* Document info bar */}
        <div className="page-padding">
          <div className="mx-auto flex max-w-content items-center justify-between py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
                aria-label="Back to library"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-title-3 text-text truncate">{doc.title}</h1>
                  <Badge variant="info">{doc.source_type}</Badge>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleReindex} isLoading={reindexing} disabled={reindexing} leadingIcon={!reindexing ? <RotateCcw className="h-4 w-4" /> : undefined}>
                {reindexing ? 'Re-indexing…' : 'Re-index'}
              </Button>
              <ExportMenu docId={docId} docTitle={doc?.title || docId} />
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
                  aria-label="More actions"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-3">
                    <button
                      onClick={() => { setNewTitle(doc.title); setShowMenu(false); setRenaming(true) }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-label text-text-secondary transition-colors duration-150 hover:bg-surface-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Rename
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteConfirm(true) }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-label text-rose-600 transition-colors duration-150 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rename inline dialog */}
        {renaming && (
          <div className="border-t border-border-hairline bg-surface-subtle page-padding py-3">
            <div className="mx-auto flex max-w-content items-center gap-3">
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

        {/* Workspace tabs with animated underline */}
        <div className="border-t border-border-hairline page-padding flex items-center justify-between gap-4">
          <Tabs tabs={workspaceTabs.map((t) => t.id === 'flashcards' ? { ...t, badge: dueFlashcardCount > 0 ? dueFlashcardCount : undefined } : t)} activeTab={activeTab} onChange={setActiveTab} onHover={handleTabHover} />
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-dialog flex items-center justify-center bg-black/30 px-4" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-elevated p-6 shadow-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle">
                <AlertTriangle className="h-5 w-5 text-danger" />
              </div>
              <div>
                <h3 className="text-label font-semibold text-text">Delete document?</h3>
                <p className="text-small text-text-tertiary">
                  All chunks, flashcards, and quiz questions will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} isLoading={deleting} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete document'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Failed chunks banner */}
      {failedChunks !== null && failedChunks > 0 && (
        <div className="border-b border-amber-200 bg-warning-subtle page-padding py-2.5">
          <div className="mx-auto flex max-w-content items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-small text-warning-onSubtle">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{failedChunks} chunk{failedChunks !== 1 ? 's' : ''} failed to index.{' '}
                <button onClick={handleReindex} disabled={reindexing} className="font-medium underline underline-offset-2 hover:text-amber-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600" aria-label="Re-index failed chunks">
                  {reindexing ? 'Re-indexing...' : 'Re-index now'}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Panel container */}
      <div className="flex-1 overflow-auto bg-canvas">
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



