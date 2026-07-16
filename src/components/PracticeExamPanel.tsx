import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { showToast } from './Toast'
import {
  fetchAllQuizQuestions,
  generateQuiz,
  recordExamAttempt,
  generateTargetedPractice,
  getConceptMastery,
  logEvent,
  type QuizQuestionItem,
} from '../lib/api'
import { useAppStore } from '../stores/useAppStore'
import {
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Play,
  Flag,
  BookOpen,
  RefreshCw,
  Target,
  BarChart3,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ExamQuestion {
  id: string
  document_id: string
  document_title?: string
  question: string
  options: string[]
  correct_index: number
  explanation: string
  concept: string
}

interface ExamConfig {
  docIds: string[]
  questionCount: number
  conceptFocus: 'all' | 'weak'
  timerMinutes: number // 0 = no timer
}

interface AutosaveState {
  questions: ExamQuestion[]
  answers: (number | null)[]
  flagged: boolean[]
  questionStartTimes: number[]
  config: ExamConfig
  timeRemaining: number
  savedAt: number
}

type ExamPhase = 'setup' | 'taking' | 'results'

interface ExamState {
  phase: ExamPhase
  questions: ExamQuestion[]
  answers: (number | null)[]
  flagged: boolean[]
  currentIndex: number
  timeRemaining: number
  config: ExamConfig
  generating: boolean
  error: string | null
  questionStartTimes: number[]
  answerTimes: (number | null)[]
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const AUTOSAVE_KEY = 'exam_autosave_v1'

function extractConcept(question: string): string {
  const keyTerms = [
    'definition', 'example', 'cause', 'effect', 'difference',
    'compare', 'contrast', 'purpose', 'function', 'process',
    'theory', 'law', 'principle', 'application', 'benefit',
    'drawback', 'history', 'structure', 'component', 'type',
    'method', 'approach', 'model', 'system', 'analysis',
    'feature', 'characteristic',
  ]
  const lower = question.toLowerCase()
  for (const term of keyTerms) {
    if (lower.includes(term)) return term.charAt(0).toUpperCase() + term.slice(1)
  }
  return 'General'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function autosave(state: AutosaveState): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state))
  } catch { /* storage full — ignore */ }
}

function loadAutosave(): AutosaveState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AutosaveState
    // Validate min required fields
    if (!Array.isArray(parsed.questions) || !Array.isArray(parsed.answers)) return null
    return parsed
  } catch {
    return null
  }
}

function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch { /* ignore */ }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Sample questions ensuring concept diversity: pick at most N per concept,
 * then fill remaining slots cycling through concepts.
 */
function sampleWithConceptCoverage(
  questions: ExamQuestion[],
  count: number,
): ExamQuestion[] {
  // Group by concept
  const byConcept = new Map<string, ExamQuestion[]>()
  for (const q of questions) {
    const c = q.concept || 'General'
    if (!byConcept.has(c)) byConcept.set(c, [])
    byConcept.get(c)!.push(q)
  }

  // Shuffle within each concept
  for (const [, qs] of byConcept) {
    shuffleArray(qs)
  }

  const concepts = shuffleArray(Array.from(byConcept.keys()))
  const selected: ExamQuestion[] = []
  const usedIds = new Set<string>()
  const maxPerConcept = Math.max(1, Math.floor(count / Math.max(1, concepts.length)))

  // Round 1: take up to maxPerConcept from each concept
  for (const concept of concepts) {
    const pool = byConcept.get(concept)!
    let taken = 0
    for (const q of pool) {
      if (usedIds.has(q.id)) continue
      if (taken >= maxPerConcept) break
      selected.push(q)
      usedIds.add(q.id)
      taken++
    }
  }

  // Round 2: fill remaining slots cycling through concepts
  if (selected.length < count) {
    let ci = 0
    while (selected.length < count) {
      const concept = concepts[ci % concepts.length]
      const pool = byConcept.get(concept)!
      const remaining = pool.find((q) => !usedIds.has(q.id))
      if (remaining) {
        selected.push(remaining)
        usedIds.add(remaining.id)
      }
      ci++
      if (ci > concepts.length * 10) break // safety valve
    }
  }

  return shuffleArray(selected)
}

// ═══════════════════════════════════════════════════════════════════════════
// Components
// ═══════════════════════════════════════════════════════════════════════════

function formatTimePerQuestion(ms: number | null): string {
  if (ms === null || ms <= 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// ─── Concept Coverage Selector ───────────────────────────────────────────

function ConceptFocusSelector({
  value,
  onChange,
}: {
  value: 'all' | 'weak'
  onChange: (v: 'all' | 'weak') => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-0.5">
      <button
        onClick={() => onChange('all')}
        className={`flex-1 rounded-md px-3 py-2 text-caption font-medium transition-colors ${
          value === 'all'
            ? 'bg-surface-elevated text-text shadow-sm'
            : 'text-text-muted hover:text-text-secondary'
        }`}
      >
        All concepts
      </button>
      <button
        onClick={() => onChange('weak')}
        className={`flex-1 rounded-md px-3 py-2 text-caption font-medium transition-colors ${
          value === 'weak'
            ? 'bg-surface-elevated text-text shadow-sm'
            : 'text-text-muted hover:text-text-secondary'
        }`}
      >
        Weak-focused
      </button>
    </div>
  )
}

// ─── Timer Presets ───────────────────────────────────────────────────────

const TIMER_PRESETS = [
  { label: 'No timer', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '60 min', minutes: 60 },
]

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

export function PracticeExamPanel() {
  const { documents, fetchDocuments } = useAppStore()

  // ── Config state ───────────────────────────────────────────────────────
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState(10)
  const [conceptFocus, setConceptFocus] = useState<'all' | 'weak'>('all')
  const [timerMinutes, setTimerMinutes] = useState(0)

  // ── Exam state ─────────────────────────────────────────────────────────
  const [state, setState] = useState<ExamState>({
    phase: 'setup',
    questions: [],
    answers: [],
    flagged: [],
    currentIndex: 0,
    timeRemaining: 0,
    config: { docIds: [], questionCount: 10, conceptFocus: 'all', timerMinutes: 0 },
    generating: false,
    error: null,
    questionStartTimes: [],
    answerTimes: [],
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeRef = useRef(false)

  // ── On mount: fetch docs, check for autosave ──────────────────────────
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    if (documents.length === 0) return

    // Check for autosave
    const saved = loadAutosave()
    if (saved && !resumeRef.current) {
      // Only resume if the saved config matches documents we still have
      const validDocIds = saved.config?.docIds?.filter((id) =>
        documents.some((d) => d.id === id),
      )
      if (validDocIds && validDocIds.length > 0 && saved.questions.length > 0) {
        resumeRef.current = true
        setState({
          phase: 'taking',
          questions: saved.questions,
          answers: saved.answers,
          flagged: saved.flagged,
          currentIndex: 0,
          timeRemaining: saved.timeRemaining ?? saved.config.timerMinutes * 60,
          config: saved.config,
          generating: false,
          error: null,
          questionStartTimes: saved.questionStartTimes,
          answerTimes: new Array(saved.questions.length).fill(null),
        })
        setSelectedDocIds(saved.config.docIds)
        setQuestionCount(saved.config.questionCount)
        setConceptFocus(saved.config.conceptFocus)
        setTimerMinutes(saved.config.timerMinutes)
        showToast('success', 'Resumed your exam from where you left off.')
      }
    }
  }, [documents])

  // ── Timer effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase === 'taking' && state.config.timerMinutes > 0 && state.timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.timeRemaining <= 1) {
            clearInterval(timerRef.current!)
            // Timer expired — auto-submit
            submitExamWithState(prev)
            return { ...prev, timeRemaining: 0, phase: 'results' }
          }
          return { ...prev, timeRemaining: prev.timeRemaining - 1 }
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [state.phase])

  // ── Submit helper ─────────────────────────────────────────────────────
  async function submitExamWithState(s: ExamState) {
    const { questions, answers, config } = s
    let correctCount = 0
    const conceptMap = new Map<string, { correct: number; total: number }>()

    questions.forEach((q, i) => {
      const concept = q.concept || 'General'
      const existing = conceptMap.get(concept) || { correct: 0, total: 0 }
      existing.total++
      if (answers[i] === q.correct_index) {
        correctCount++
        existing.correct++
      }
      conceptMap.set(concept, existing)
    })

    const perTopic = Array.from(conceptMap.entries()).map(([topic, stats]) => ({
      topic,
      correct: stats.correct,
      total: stats.total,
    }))

    try {
      await recordExamAttempt(config.docIds, correctCount, questions.length, perTopic)
    } catch (err) {
      console.error('Failed to record exam:', err)
    }

    // Log exam_completed event (use first docId for document_id)
    logEvent(config.docIds[0] || '', 'exam_completed', {
      score: correctCount,
      total: questions.length,
      pct: Math.round((correctCount / questions.length) * 100),
      docCount: config.docIds.length,
    })

    clearAutosave()
  }

  // ── Toggle doc selection ──────────────────────────────────────────────
  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  // ── Start or resume exam ──────────────────────────────────────────────
  const startExam = useCallback(async () => {
    if (selectedDocIds.length === 0) {
      showToast('error', 'Select at least one document')
      return
    }

    setState((prev) => ({ ...prev, generating: true, error: null }))

    try {
      // Ensure quiz questions exist
      for (const docId of selectedDocIds) {
        await generateQuiz(docId)
      }

      let questions: QuizQuestionItem[] = await fetchAllQuizQuestions(selectedDocIds)

      if (questions.length === 0) {
        setState((prev) => ({
          ...prev,
          generating: false,
          error: 'No quiz questions available for the selected documents. Try generating quizzes first.',
        }))
        return
      }

      // Convert to ExamQuestion format
      let examQuestions: ExamQuestion[] = questions.map((q) => ({
        ...q,
        document_title: (q as any).documents?.title || 'Untitled',
        topic: extractConcept(q.question),
      }))

      // Filter weak concepts if requested
      if (conceptFocus === 'weak') {
        const weakConcepts = new Set<string>()
        for (const docId of selectedDocIds) {
          try {
            const mastery = await getConceptMastery(docId)
            for (const c of mastery) {
              if (c.masteryPct < 70) weakConcepts.add(c.concept.toLowerCase())
            }
          } catch { /* skip */ }
        }
        if (weakConcepts.size > 0) {
          const weakQuestions = examQuestions.filter((q) =>
            weakConcepts.has((q.concept || '').toLowerCase()),
          )
          if (weakQuestions.length >= Math.min(questionCount, 3)) {
            examQuestions = weakQuestions
          }
        }
      }

      // Sample with concept coverage
      const sampled = sampleWithConceptCoverage(examQuestions, Math.min(questionCount, examQuestions.length))

      if (sampled.length < 2) {
        setState((prev) => ({
          ...prev,
          generating: false,
          error: 'Not enough questions. Try selecting more documents or a different concept filter.',
        }))
        return
      }

      const totalTime = timerMinutes > 0 ? timerMinutes * 60 : 0

      const newState: ExamState = {
        phase: 'taking',
        questions: sampled,
        answers: new Array(sampled.length).fill(null),
        flagged: new Array(sampled.length).fill(false),
        currentIndex: 0,
        timeRemaining: totalTime,
        config: { docIds: selectedDocIds, questionCount, conceptFocus, timerMinutes },
        generating: false,
        error: null,
        questionStartTimes: sampled.map(() => Date.now()),
        answerTimes: new Array(sampled.length).fill(null),
        
      }

      setState(newState)

      // Autosave immediately
      autosave({
        questions: newState.questions,
        answers: newState.answers,
        flagged: newState.flagged,
        questionStartTimes: newState.questionStartTimes,
        config: newState.config,
        timeRemaining: newState.timeRemaining,
        savedAt: Date.now(),
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        generating: false,
        error: (err as Error).message,
      }))
    }
  }, [selectedDocIds, questionCount, conceptFocus, timerMinutes])

  // ── Select answer ─────────────────────────────────────────────────────
  const selectAnswer = (optionIndex: number) => {
    setState((prev) => {
      const answers = [...prev.answers]
      const answerTimes = [...(prev.answerTimes || [])]
      const wasNull = answers[prev.currentIndex] === null
      answers[prev.currentIndex] = optionIndex

      // Record time spent on this question when first answered
      if (wasNull) {
        answerTimes[prev.currentIndex] =
          Date.now() - (prev.questionStartTimes[prev.currentIndex] || Date.now())
      }

      const newState = { ...prev, answers, answerTimes }

      // Autosave on each answer
      autosave({
        questions: newState.questions,
        answers: newState.answers,
        flagged: newState.flagged,
        questionStartTimes: newState.questionStartTimes,
        config: newState.config,
        timeRemaining: newState.timeRemaining,
        savedAt: Date.now(),
      })

      return newState
    })
  }

  // ── Toggle flag
  const toggleFlag = () => {
    setState((prev) => {
      const flagged = [...prev.flagged]
      flagged[prev.currentIndex] = !flagged[prev.currentIndex]
      const newState = { ...prev, flagged }
      autosave({
        questions: newState.questions,
        answers: newState.answers,
        flagged: newState.flagged,
        questionStartTimes: newState.questionStartTimes,
        config: newState.config,
        timeRemaining: newState.timeRemaining,
        savedAt: Date.now(),
      })
      return newState
    })
  }

  // ── Navigate ──────────────────────────────────────────────────────────
  const goToQuestion = (index: number) => {
    setState((prev) => ({ ...prev, currentIndex: index }))
  }

  // ── Submit exam (manual) ──────────────────────────────────────────────
  const submitExam = useCallback(async () => {
    const s = state
    if (timerRef.current) clearInterval(timerRef.current)
    await submitExamWithState(s)
    setState((prev) => ({ ...prev, phase: 'results' }))
  }, [state])

  // ── Practice missed concepts ──────────────────────────────────────────
  const handlePracticeMissed = useCallback(async () => {
    const s = state
    const missedQuestions = s.questions.filter(
      (q, i) => s.answers[i] !== q.correct_index,
    )
    const missedDocIds = [...new Set(missedQuestions.map((q) => q.document_id))]

    if (missedDocIds.length === 0) {
      showToast('success', 'No missed concepts to practice!')
      return
    }

    // Generate targeted practice for each doc with missed questions
    for (const docId of missedDocIds) {
      try {
        await generateTargetedPractice(docId, 'quiz')
      } catch { /* best effort */ }
    }

    showToast('success', `Generated practice for ${missedDocIds.length} document${missedDocIds.length > 1 ? 's' : ''}!`)
  }, [state])

  // ── Reset ─────────────────────────────────────────────────────────────
  const reset = () => {
    clearAutosave()
    setState({
      phase: 'setup',
      questions: [],
      answers: [],
      flagged: [],
      currentIndex: 0,
      timeRemaining: 0,
      config: { docIds: [], questionCount: 10, conceptFocus: 'all', timerMinutes: 0 },
      generating: false,
      error: null,
      questionStartTimes: [],
      answerTimes: [],
    })
    resumeRef.current = false
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Setup
  // ═══════════════════════════════════════════════════════════════════════
  if (state.phase === 'setup') {
    // Check for autosave to show resume prompt
    const hasAutosave = loadAutosave() !== null && !resumeRef.current

    return (
      <div className="mx-auto max-w-reading-panel p-6 space-y-6">
        <div>
          <h2 className="text-h2 text-text mb-1">Practice Exam</h2>
          <p className="text-body text-text-secondary">
            Configure a timed, mixed-document exam with real test conditions.
          </p>
        </div>

        {/* Autosave resume prompt */}
        {hasAutosave && (
          <Card padding="sm" className="border-brand-200 bg-brand-50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-brand-500" />
                <span className="text-label text-brand-800">You have an exam in progress</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const saved = loadAutosave()
                    if (saved) {
                      resumeRef.current = true
                      setState({
                        phase: 'taking',
                        questions: saved.questions,
                        answers: saved.answers,
                        flagged: saved.flagged,
                        currentIndex: 0,
                        timeRemaining: saved.timeRemaining ?? saved.config.timerMinutes * 60,
                        config: saved.config,
                        generating: false,
                        error: null,
                        questionStartTimes: saved.questionStartTimes,
                        answerTimes: new Array(saved.questions.length).fill(null),
        })
                      setSelectedDocIds(saved.config.docIds)
                      setQuestionCount(saved.config.questionCount)
                      setConceptFocus(saved.config.conceptFocus)
                      setTimerMinutes(saved.config.timerMinutes)
                    }
                  }}
                >
                  Resume
                </Button>
              <Button size="sm" variant="ghost" onClick={() => { clearAutosave(); }}>
                Discard
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Document selection */}
        <Card padding="sm">
          <h3 className="text-label font-semibold text-text mb-3">1. Select Documents</h3>
          {documents.length === 0 ? (
            <p className="text-small text-text-muted">No documents available. Upload one first.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {documents.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-bg-muted transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500/20"
                  />
                  <span className="text-small text-text">{doc.title}</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        {/* Question count */}
        <Card padding="sm">
          <h3 className="text-label font-semibold text-text mb-3">2. Number of Questions</h3>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={40}
              step={5}
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              className="flex-1 accent-brand-500"
            />
            <span className="text-label font-medium text-brand-700 w-8 text-right tabular-nums">
              {questionCount}
            </span>
          </div>
        </Card>

        {/* Concept focus */}
        <Card padding="sm">
          <h3 className="text-label font-semibold text-text mb-3">3. Concept Coverage</h3>
          <ConceptFocusSelector value={conceptFocus} onChange={setConceptFocus} />
          <p className="mt-2 text-footnote text-text-muted">
            {conceptFocus === 'all'
              ? 'Sample questions across all concepts for comprehensive review.'
              : 'Focus on concepts where your mastery is below 70%.'}
          </p>
        </Card>

        {/* Timer */}
        <Card padding="sm">
          <h3 className="text-label font-semibold text-text mb-3">4. Timer</h3>
          <div className="flex flex-wrap gap-2">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                onClick={() => setTimerMinutes(preset.minutes)}
                className={`rounded-lg border px-3 py-2 text-caption font-medium transition-colors ${
                  timerMinutes === preset.minutes
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-border text-text-secondary hover:border-border-strong hover:bg-surface-subtle'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Start button */}
        <Button
          className="w-full"
          size="md"
          onClick={startExam}
          isLoading={state.generating}
          disabled={state.generating || selectedDocIds.length === 0}
          leadingIcon={<Play className="h-4 w-4" />}
        >
          {state.generating ? 'Preparing exam…' : 'Start Exam'}
        </Button>

        {state.error && (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{state.error}</span>
            <button
              onClick={startExam}
              disabled={state.generating}
              className="flex-shrink-0 rounded-md bg-rose-100 px-3 py-1 text-caption font-medium text-rose-800 hover:bg-rose-200 transition-colors disabled:opacity-50"
            >
              {state.generating ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Taking (distraction-free exam runtime)
  // ═══════════════════════════════════════════════════════════════════════
  if (state.phase === 'taking') {
    const { questions, answers, flagged, currentIndex, timeRemaining, config } = state
    const question = questions[currentIndex]
    const answeredCount = answers.filter((a) => a !== null).length
    const flaggedCount = flagged.filter((f) => f).length
    const isFlagged = flagged[currentIndex]
    const timerUrgent = config.timerMinutes > 0 && timeRemaining <= 60
    const isAnswered = answers[currentIndex] !== null

    return (
      <div className="mx-auto max-w-reading-panel p-6">
        {/* Top bar: timer + progress + flag */}
        <div className="mb-4 flex items-center justify-between gap-3">
          {config.timerMinutes > 0 ? (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-label font-semibold transition-colors ${
                timerUrgent
                  ? 'bg-rose-50 text-rose-700 animate-pulse'
                  : 'bg-bg-muted text-text'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span className="tabular-nums">{formatTime(timeRemaining)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 text-label text-text-muted">
              <Clock className="h-4 w-4" />
              <span>No timer</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <ProgressBar answered={answeredCount} total={questions.length} />
            <span className="text-small text-text-muted tabular-nums">
              {answeredCount}/{questions.length}
            </span>
          </div>

          <button
            onClick={toggleFlag}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label font-medium transition-colors ${
              isFlagged
                ? 'bg-amber-50 text-amber-700'
                : 'bg-bg-muted text-text-muted hover:text-text-secondary'
            }`}
            aria-label={isFlagged ? 'Unflag for review' : 'Flag for review'}
          >
            <Flag
              className={`h-4 w-4 ${isFlagged ? 'fill-amber-500 text-amber-500' : ''}`}
            />
            <span className="hidden sm:inline">{isFlagged ? 'Flagged' : 'Flag'}</span>
          </button>
        </div>

        {/* Question navigator */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {questions.map((_q, i) => {
            const isActive = i === currentIndex
            const ans = answers[i]
            const flg = flagged[i]
            return (
              <button
                key={i}
                onClick={() => goToQuestion(i)}
                className={`relative h-8 w-8 rounded-md text-caption font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white ring-2 ring-brand-200'
                    : ans !== null
                      ? 'bg-brand-100 text-brand-700'
                      : flg
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-bg-muted text-text-muted hover:bg-bg-hover'
                }`}
              >
                {i + 1}
                {flg && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 border border-white" />
                )}
              </button>
            )
          })}
        </div>

        {/* Current question */}
        {question && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-caption text-text-muted">
                Question {currentIndex + 1} of {questions.length}
              </span>
              {question.document_title && (
                <span className="text-caption text-text-muted">· {question.document_title}</span>
              )}
              {isAnswered && (
                <span className="text-caption text-emerald-600 font-medium ml-auto">Answered</span>
              )}
            </div>
            <h3 className="text-h4 text-text font-semibold mb-4 leading-relaxed">
              {question.question}
            </h3>
            <div className="space-y-2">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => selectAnswer(idx)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-body transition-all ${
                    answers[currentIndex] === idx
                      ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500/30': 'border-border bg-surface text-text hover:border-brand-300 hover:bg-brand-50/30'
                  }`}
                >
                  <span
                    className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-caption font-medium ${
                      answers[currentIndex] === idx
                        ? 'bg-brand-500 text-white'
                        : 'bg-bg-muted text-text-muted'
                    }`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation + Submit */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              Previous
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {answeredCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={submitExam}
              >
                Submit {answeredCount < questions.length ? `(${answeredCount}/${questions.length})` : ''}
              </Button>
            )}

            {currentIndex < questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => goToQuestion(currentIndex + 1)}
                trailingIcon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={submitExam}>
                Submit Exam
              </Button>
            )}
          </div>
        </div>

        {/* Flagged questions reminder */}
        {flaggedCount > 0 && answeredCount < questions.length && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-small text-amber-700">
            <Flag className="h-3.5 w-3.5" />
            <span>
              {flaggedCount} question{flaggedCount > 1 ? 's' : ''} flagged for review
            </span>
          </div>
        )}

        {state.error && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <span>{state.error}</span>
            <button onClick={() => setState((prev) => ({ ...prev, error: null }))} className="text-rose-800 underline shrink-0">
              Dismiss
            </button>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER: Results & Analytics
  // ═══════════════════════════════════════════════════════════════════════
  const { questions, answers, answerTimes, config } = state
  const correctCount = questions.filter((q, i) => answers[i] === q.correct_index).length
  const percentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0
  const unansweredCount = answers.filter((a) => a === null).length
  const flaggedAttempted = state.flagged.filter((f) => f).length

  // Per-concept breakdown
  const conceptMap = new Map<
    string,
    { correct: number; total: number; timeMs: number }
  >()
  questions.forEach((q, i) => {
    const concept = q.concept || 'General'
    const existing = conceptMap.get(concept) || { correct: 0, total: 0, timeMs: 0 }
    existing.total++
    if (answers[i] === q.correct_index) existing.correct++
    if (answerTimes[i]) existing.timeMs += answerTimes[i]!
    conceptMap.set(concept, existing)
  })

  const conceptResults = Array.from(conceptMap.entries())
    .map(([concept, stats]) => ({
      concept,
      correct: stats.correct,
      total: stats.total,
      pct: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      avgTimeMs: stats.total > 0 ? Math.round(stats.timeMs / stats.total) : 0,
    }))
    .sort((a, b) => a.pct - b.pct)

  // Average time per question
  const validTimes = answerTimes.filter((t): t is number => t !== null && t > 0)
  const avgTimeMs =
    validTimes.length > 0
      ? Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length)
      : 0

  // Missed concepts for follow-up
  const missedConcepts = [
    ...new Set(
      questions
        .filter((_qa, i) => answers[i] !== _qa.correct_index)
        .map((_qa) => _qa.concept || 'General'),
    ),
  ]
  const missedDocIds = [
    ...new Set(
      questions
        .filter((_qb, i) => answers[i] !== _qb.correct_index)
        .map((_qb) => _qb.document_id),
    ),
  ]

  return (
    <div className="mx-auto max-w-reading-panel p-6 space-y-6">
      {/* Score hero */}
      <div className="text-center rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div
          className={`mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full text-h1 font-bold ${
            percentage >= 80
              ? 'bg-emerald-50 text-emerald-700'
              : percentage >= 60
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
          }`}
        >
          {percentage}%
        </div>
        <p className="text-title-2 text-text tabular-nums">
          {correctCount} / {questions.length} correct
        </p>
        <p className="text-body text-text-secondary mt-1">
          {percentage >= 80
            ? 'Excellent work!'
            : percentage >= 60
              ? 'Good effort — keep reviewing the weak spots.'
              : 'Keep studying — focus on the concepts you missed.'}
        </p>
        {unansweredCount > 0 && (
          <p className="mt-2 text-small text-amber-600">
            {unansweredCount} question{unansweredCount > 1 ? 's' : ''} unanswered
          </p>
        )}
        {flaggedAttempted > 0 && (
          <p className="text-small text-text-muted">{flaggedAttempted} flagged</p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card padding="sm" className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-brand-500 shrink-0" />
          <div>
            <p className="text-footnote text-text-muted">Avg time / question</p>
            <p className="text-label font-semibold text-text tabular-nums">
              {formatTimePerQuestion(avgTimeMs)}
            </p>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <Target className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-footnote text-text-muted">Concepts tested</p>
            <p className="text-label font-semibold text-text tabular-nums">
              {conceptResults.length}
            </p>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-footnote text-text-muted">Documents</p>
            <p className="text-label font-semibold text-text tabular-nums">
              {config.docIds.length}
            </p>
          </div>
        </Card>
      </div>

      {/* Per-concept breakdown */}
      {conceptResults.length > 0 && (
        <Card padding="sm">
          <h3 className="text-label font-semibold text-text mb-3">
            Performance by Concept
          </h3>
          <div className="space-y-2.5">
            {conceptResults.map((cr) => (
              <div key={cr.concept}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-small text-text font-medium truncate max-w-[50%]">
                    {cr.concept}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-footnote text-text-muted tabular-nums">
                      {formatTimePerQuestion(cr.avgTimeMs)}
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          cr.pct >= 80
                            ? 'bg-emerald-500'
                            : cr.pct >= 60
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${cr.pct}%` }}
                      />
                    </div>
                    <span className="text-small text-text-muted tabular-nums w-12 text-right">
                      {cr.correct}/{cr.total}
                    </span>
                    {cr.pct < 60 && (
                      <span className="text-footnote font-medium text-rose-600">Needs work</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Per-question review */}
      <div>
        <h3 className="text-title-3 text-text mb-4">Question Review</h3>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const userAnswer = answers[i]
            const isCorrect = userAnswer === q.correct_index
            const isUnanswered = userAnswer === null
            const timeMs = answerTimes[i]

            return (
              <Card
                key={i}
                padding="sm"
                className={`border-l-4 ${
                  isCorrect
                    ? 'border-l-emerald-500'
                    : isUnanswered
                      ? 'border-l-amber-500'
                      : 'border-l-rose-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {isCorrect ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                    ) : isUnanswered ? (
                      <div className="h-5 w-5 rounded-full border-2 border-amber-400 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-amber-500">?</span>
                      </div>
                    ) : (
                      <XCircle className="h-5 w-5 text-rose-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-caption font-medium text-text-muted">
                        Q{i + 1}
                      </span>
                      {q.document_title && (
                        <span className="text-caption text-text-muted">· {q.document_title}</span>
                      )}
                      {timeMs !== null && timeMs > 0 && (
                        <span className="text-caption text-text-muted ml-auto tabular-nums">
                          {formatTimePerQuestion(timeMs)}
                        </span>
                      )}
                      {state.flagged[i] && (
                        <Flag className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                    <p className="text-label font-semibold text-text mb-2">{q.question}</p>
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => {
                        const isCorrectOption = oi === q.correct_index
                        const isSelectedOption = oi === userAnswer
                        return (
                          <div
                            key={oi}
                            className={`rounded-md px-3 py-1.5 text-small ${
                              isCorrectOption
                                ? 'bg-emerald-50 text-emerald-800'
                                : isSelectedOption && !isCorrectOption
                                  ? 'bg-rose-50 text-rose-800'
                                  : 'text-text-muted'
                            }`}
                          >
                            <span className="mr-2 font-medium">
                              {String.fromCharCode(65 + oi)}.
                            </span>
                            {opt}
                            {isCorrectOption && (
                              <CheckCircle className="ml-1.5 inline h-3.5 w-3.5 text-emerald-600" />
                            )}
                            {isSelectedOption && !isCorrectOption && (
                              <XCircle className="ml-1.5 inline h-3.5 w-3.5 text-rose-600" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {q.explanation && (
                      <p className="mt-2 text-small text-text-muted italic">{q.explanation}</p>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Follow-up actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {missedConcepts.length > 0 && (
          <Button
            className="flex-1"
            variant="secondary"
            onClick={handlePracticeMissed}
            leadingIcon={<Target className="h-4 w-4" />}
          >
            Practice {missedDocIds.length} document{missedDocIds.length > 1 ? 's' : ''} with missed concepts
          </Button>
        )}
        <Button className="flex-1" onClick={reset} leadingIcon={<RefreshCw className="h-4 w-4" />}>
          New Exam
        </Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function ProgressBar({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? (answered / total) * 100 : 0
  return (
    <div className="h-2 w-24 overflow-hidden rounded-full bg-bg-muted">
      <div
        className="h-full rounded-full bg-brand-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
