import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './Button'
import { Card } from './Card'
import { showToast } from './Toast'
import { fetchAllQuizQuestions, generateQuiz, recordExamAttempt } from '../lib/api'
import { useAppStore } from '../stores/useAppStore'
import { Clock, CheckCircle, XCircle, ArrowLeft, ArrowRight, Play } from 'lucide-react'

interface ExamQuestion {
  id: string
  document_id: string
  question: string
  options: string[]
  correct_index: number
  explanation: string
  documents?: { title: string }
  topic?: string
}

interface ExamState {
  phase: 'setup' | 'taking' | 'review'
  questions: ExamQuestion[]
  answers: (number | null)[]
  currentIndex: number
  timeRemaining: number
  docIds: string[]
  questionCount: number
  generating: boolean
}

function extractTopic(question: string): string {
  const keyTerms = ['definition', 'example', 'cause', 'effect', 'difference', 'compare', 'contrast', 'purpose', 'function', 'process', 'theory', 'law', 'principle', 'application', 'benefit', 'drawback', 'history', 'structure', 'component', 'type', 'method', 'approach', 'model', 'system', 'analysis', 'feature', 'characteristic']
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

export function PracticeExamPanel() {
  const { documents, fetchDocuments } = useAppStore()
  const [state, setState] = useState<ExamState>({
    phase: 'setup',
    questions: [],
    answers: [],
    currentIndex: 0,
    timeRemaining: 0,
    docIds: [],
    questionCount: 10,
    generating: false,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  // Timer - when it hits 0, persist and switch to review
  useEffect(() => {
    if (state.phase === 'taking' && state.timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.timeRemaining <= 1) {
            clearInterval(timerRef.current!)
            submitExamWithState(prev)
            return { ...prev, timeRemaining: 0, phase: 'review' }
          }
          return { ...prev, timeRemaining: prev.timeRemaining - 1 }
        })
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [state.phase])

  async function submitExamWithState(s: ExamState) {
    const { questions, answers, docIds } = s
    let correctCount = 0
    const topicMap = new Map<string, { correct: number; total: number }>()

    questions.forEach((q, i) => {
      const topic = q.topic || 'General'
      const existing = topicMap.get(topic) || { correct: 0, total: 0 }
      existing.total++
      if (answers[i] === q.correct_index) {
        correctCount++
        existing.correct++
      }
      topicMap.set(topic, existing)
    })

    const perTopic = Array.from(topicMap.entries()).map(([topic, stats]) => ({
      topic,
      correct: stats.correct,
      total: stats.total,
    }))

    try {
      await recordExamAttempt(docIds, correctCount, questions.length, perTopic)
    } catch (err) {
      console.error('Failed to record exam:', err)
    }
  }

  const toggleDoc = (id: string) => {
    setState((prev) => ({
      ...prev,
      docIds: prev.docIds.includes(id)
        ? prev.docIds.filter((d) => d !== id)
        : [...prev.docIds, id],
    }))
  }

  const startExam = useCallback(async () => {
    if (state.docIds.length === 0) {
      showToast('error', 'Select at least one document')
      return
    }
    setState((prev) => ({ ...prev, generating: true }))
    try {
      for (const docId of state.docIds) {
        await generateQuiz(docId)
      }
      const questions = await fetchAllQuizQuestions(state.docIds)
      const shuffled = questions
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(state.questionCount, questions.length))
        .map((q: any) => ({ ...q, topic: extractTopic(q.question) }))

      const examTime = Math.max(60, shuffled.length * 60)

      setState((prev) => ({
        ...prev,
        phase: 'taking',
        questions: shuffled,
        answers: new Array(shuffled.length).fill(null),
        currentIndex: 0,
        timeRemaining: examTime,
        generating: false,
      }))
    } catch (err) {
      showToast('error', 'Failed to start exam: ' + (err as Error).message)
      setState((prev) => ({ ...prev, generating: false }))
    }
  }, [state.docIds, state.questionCount])

  const selectAnswer = (index: number) => {
    setState((prev) => {
      const answers = [...prev.answers]
      answers[prev.currentIndex] = index
      return { ...prev, answers }
    })
  }

  const goToQuestion = (index: number) => {
    setState((prev) => ({ ...prev, currentIndex: index }))
  }

  const submitExam = useCallback(async () => {
    const s = state
    if (timerRef.current) clearInterval(timerRef.current)
    await submitExamWithState(s)
    setState((prev) => ({ ...prev, phase: 'review' }))
  }, [state])

  const reset = () => {
    setState({
      phase: 'setup',
      questions: [],
      answers: [],
      currentIndex: 0,
      timeRemaining: 0,
      docIds: [],
      questionCount: 10,
      generating: false,
    })
  }

  // ===== SETUP PHASE =====
  if (state.phase === 'setup') {
    return (
      <div className="p-6">
        <h2 className="text-h2 text-text mb-2">Practice Exam</h2>
        <p className="text-body text-text-secondary mb-6">
          Select documents and the number of questions to build a mixed exam.
        </p>

        <Card className="p-4 mb-4">
          <h3 className="text-label font-semibold text-text mb-3">Select Documents</h3>
          {documents.length === 0 ? (
            <p className="text-small text-text-muted">No documents available. Upload one first.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {documents.map((doc) => (
                <label key={doc.id} className="flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-bg-muted transition-colors">
                  <input
                    type="checkbox"
                    checked={state.docIds.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500/20"
                  />
                  <span className="text-small text-text">{doc.title}</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 mb-6">
          <h3 className="text-label font-semibold text-text mb-3">Number of Questions</h3>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={30}
              step={5}
              value={state.questionCount}
              onChange={(e) => setState((prev) => ({ ...prev, questionCount: parseInt(e.target.value) }))}
              className="flex-1 accent-brand-500"
            />
            <span className="text-label font-medium text-brand-700 w-8 text-right">{state.questionCount}</span>
          </div>
        </Card>

        <Button
          className="w-full"
          size="md"
          onClick={startExam}
          isLoading={state.generating}
          disabled={state.generating || state.docIds.length === 0}
          leadingIcon={<Play className="h-4 w-4" />}
        >
          Start Exam
        </Button>
      </div>
    )
  }

  // ===== TAKING PHASE =====
  if (state.phase === 'taking') {
    const { questions, answers, currentIndex, timeRemaining } = state
    const question = questions[currentIndex]
    const answeredCount = answers.filter((a) => a !== null).length
    const timerUrgent = timeRemaining <= 60

    return (
      <div className="p-6">
        {/* Timer + Progress */}
        <div className="mb-4 flex items-center justify-between">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-label font-semibold transition-colors ${
            timerUrgent ? 'bg-rose-50 text-rose-700' : 'bg-bg-muted text-text'
          }`}>
            <Clock className={`h-4 w-4 ${timerUrgent ? 'animate-pulse' : ''}`} />
            <span>{formatTime(timeRemaining)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-bg-muted">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
              />
            </div>
            <span className="text-small text-text-muted">{answeredCount}/{questions.length}</span>
          </div>
        </div>

        {/* Question navigator */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => goToQuestion(i)}
              className={`h-8 w-8 rounded-md text-caption font-medium transition-colors ${
                i === currentIndex
                  ? 'bg-brand-500 text-white'
                  : answers[i] !== null
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-bg-muted text-text-muted hover:bg-bg-hover'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Current question */}
        {question && (
          <Card className="p-5 mb-4">
            <p className="text-small text-text-muted mb-1">Question {currentIndex + 1} of {questions.length}</p>
            <h3 className="text-h4 text-text font-semibold mb-4">{question.question}</h3>
            <div className="space-y-2">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => selectAnswer(idx)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-body transition-all ${
                    answers[currentIndex] === idx
                      ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500/30'
                      : 'border-border bg-white text-text hover:border-brand-300 hover:bg-brand-50/30'
                  }`}
                >
                  <span className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-caption font-medium ${
                    answers[currentIndex] === idx ? 'bg-brand-500 text-white' : 'bg-bg-muted text-text-muted'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Navigation + Submit */}
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            leadingIcon={<ArrowLeft className="h-3.5 w-3.5" />}
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {answeredCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={submitExam}
              >
                Submit {answeredCount < questions.length ? `(${answeredCount}/${questions.length} answered)` : ''}
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
              <Button
                size="sm"
                onClick={submitExam}
              >
                Submit Exam
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== REVIEW PHASE =====
  const { questions, answers } = state
  const correctCount = questions.filter((q, i) => answers[i] === q.correct_index).length
  const percentage = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0

  const topicMap = new Map<string, { correct: number; total: number }>()
  questions.forEach((q, i) => {
    const topic = q.topic || 'General'
    const existing = topicMap.get(topic) || { correct: 0, total: 0 }
    existing.total++
    if (answers[i] === q.correct_index) existing.correct++
    topicMap.set(topic, existing)
  })

  return (
    <div className="p-6">
      <h2 className="text-h2 text-text mb-2">Exam Results</h2>
      <p className="text-body text-text-secondary mb-6">
        Review your performance and see which topics need more focus.
      </p>

      {/* Score card */}
      <Card className="p-6 mb-6 text-center">
        <div className={`mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full text-h1 font-bold ${
          percentage >= 80 ? 'bg-green-50 text-green-700' :
          percentage >= 60 ? 'bg-amber-50 text-amber-700' :
          'bg-rose-50 text-rose-700'
        }`}>
          {percentage}%
        </div>
        <p className="text-label text-text-muted">{correctCount} of {questions.length} correct</p>
        <p className="text-small text-text-muted mt-1">
          {percentage >= 80 ? "Great job!" : percentage >= 60 ? "Good effort - room for improvement." : "Keep studying, you will get there!"}
        </p>
      </Card>

      {/* Topic breakdown */}
      {topicMap.size > 0 && (
        <Card className="p-4 mb-6">
          <h3 className="text-label font-semibold text-text mb-3">Performance by Topic</h3>
          <div className="space-y-2">
            {Array.from(topicMap.entries()).map(([topic, stats]) => {
              const topicPct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
              return (
                <div key={topic} className="flex items-center justify-between">
                  <span className="text-small text-text">{topic}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          topicPct >= 80 ? 'bg-green-500' : topicPct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${topicPct}%` }}
                      />
                    </div>
                    <span className="text-small text-text-muted w-16 text-right">
                      {stats.correct}/{stats.total}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Per-question review */}
      <div className="space-y-3 mb-6">
        {questions.map((q, i) => {
          const userAnswer = answers[i]
          const isCorrect = userAnswer === q.correct_index
          return (
            <Card key={i} className={`p-4 border-l-4 ${isCorrect ? 'border-l-green-500' : 'border-l-rose-500'}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {isCorrect ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
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
                              ? 'bg-green-50 text-green-800'
                              : isSelectedOption && !isCorrectOption
                                ? 'bg-rose-50 text-rose-800'
                                : 'text-text-muted'
                          }`}
                        >
                          <span className="mr-2 font-medium">{String.fromCharCode(65 + oi)}.</span>
                          {opt}
                          {isCorrectOption && <CheckCircle className="ml-1.5 inline h-3.5 w-3.5 text-green-600" />}
                          {isSelectedOption && !isCorrectOption && <XCircle className="ml-1.5 inline h-3.5 w-3.5 text-rose-600" />}
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

      <Button className="w-full" size="md" onClick={reset} leadingIcon={<Play className="h-4 w-4" />}>
        New Exam
      </Button>
    </div>
  )
}
