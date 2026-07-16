import { supabase } from './supabase'
import { onFlashcardReviewed, onQuizCompleted } from './gamification'
import { safeFetch } from './fetchWithTimeout'
import { logClientError } from './errorMonitor'
import { computeConceptRetentions } from './retention'
import type { SummaryMode, SummaryResult, ConceptMapData, ExamAttempt, TopicResult, FocusArea, StudyEventType, Profile, PublicProfileStats } from '../types/db'
export type { SummaryResult, ConceptMapData }

// ============================================================================
// Document processing
// ============================================================================

// ============================================================================
// Edge function invocation helper (routes through Vite proxy in dev)
// ============================================================================

export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  options?: { timeout?: number; quiet?: boolean }
): Promise<{ data: T | null; error: { message: string } | null }> {
  const timeout = options?.timeout ?? 30_000
  const quiet = options?.quiet ?? false

  // In development, use Vite proxy to avoid CORS issues on random ports
  if (import.meta.env.DEV) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const result = await safeFetch<T>(`/api/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
      timeout,
    })

    if (result.error && !quiet) {
      logClientError(new Error(result.error.message), `edge:${functionName}`)
    }
    return result
  }

  // In production, use Supabase client directly (CORS is pre-configured for production origin)
  // Note: supabase.functions.invoke has its own timeout (default 60s)
  const { data, error } = await supabase.functions.invoke(functionName, { body })
  if (error && !quiet) {
    logClientError(new Error(error.message), `edge:${functionName}`)
  }
  return { data: data as T | null, error: error as { message: string } | null }
}

// ============================================================================
// Document processing
// ============================================================================

// ============================================================================
// Event tracking (fire-and-forget, never blocks UI)
// ============================================================================

/**
 * Log a study event to the study_events table.
 * Fire-and-forget: never throws, never blocks the caller.
 */
export function logEvent(
  documentId: string,
  eventType: StudyEventType,
  data: Record<string, unknown> = {},
): void {
  supabase.from('study_events').insert({
    document_id: documentId,
    event_type: eventType,
    event_data: data,
  }).then(() => {
    // fire-and-forget
  })
}

export interface EmbedResult {
  embedded: number
  failedCount: number
  failedIndexes: number[]
  totalChunks?: number
}
export async function embedDocument(documentId: string): Promise<EmbedResult> {
  // F1: Increased timeout to 120s (Mistral can be slow, esp. with retries)
  const { data, error } = await invokeEdgeFunction<EmbedResult>('embed-document', { documentId }, { timeout: 120_000 })
  if (error) throw new Error(`Embedding failed: ${error.message}`)
  return data ?? { embedded: 0, failedCount: 0, failedIndexes: [], totalChunks: 0 }
}

/**
 * Reset embeddings on all chunks for a document so embedDocument will re-process them.
 */
export async function resetDocumentEmbeddings(documentId: string): Promise<void> {
  const { error } = await supabase
    .from("chunks")
    .update({ embedding: null })
    .eq("document_id", documentId)
  if (error) throw new Error("Failed to reset embeddings: " + error.message)
}

/**
 * Count chunks with NULL embedding (failed or not yet indexed).
 */
export async function getFailedChunksCount(documentId: string, options?: { signal?: AbortSignal }): Promise<number> {
  const signal = options?.signal ?? new AbortController().signal
  const { count, error } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .eq("document_id", documentId)
    .is("embedding", null)
    .abortSignal(signal)
  if (error) throw new Error("Failed to count chunks: " + error.message)
  return count ?? 0
}



/**
 * Count ALL chunks for a document (including embedded ones).
 */
export async function getTotalChunksCount(documentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .eq("document_id", documentId)
  if (error) throw new Error("Failed to count chunks: " + error.message)
  return count ?? 0
}

/**
 * Poll for embedding progress. Returns { embedded, total } or null if not found.
 * Use this after calling embedDocument to show real-time progress.
 */
export async function getEmbeddingProgress(documentId: string): Promise<{ embedded: number; total: number } | null> {
  try {
    const totalReq = supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId)
    const nullReq = supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId)
      .is("embedding", null)
    const [totalRes, nullRes] = await Promise.all([totalReq, nullReq])
    const total = totalRes.count ?? 0
    const nullCount = nullRes.count ?? 0
    if (total === 0) return null
    return { embedded: total - nullCount, total }
  } catch { return null }
}

export interface RagQueryResult {
  answer: string
  sources: Array<{ content: string; chunk_index: number }>
  /** Confidence label derived from retrieval quality */
  confidence: 'high' | 'medium' | 'low'
  /** Enhanced sources with relevance scores for transparency panel */
  enhancedSources?: Array<{ chunkIndex: number; snippet: string; score: number }>
  /** Suggestion shown when confidence is low */
  suggestion?: string
}

export async function ragQuery(documentId: string, question: string): Promise<RagQueryResult> {
  const { data, error } = await invokeEdgeFunction('rag-query', { documentId, question })
  if (error) throw new Error(`RAG query failed: ${error.message}`)
  return {
    answer: data?.answer || '',
    sources: data?.sources || [],
    confidence: data?.confidence || 'low',
    enhancedSources: data?.enhancedSources || [],
    suggestion: data?.suggestion,
  }
}

/**
 * Stream RAG answer tokens from the edge function via SSE.
 * Passes each token to onToken as it arrives, then returns the full answer + sources + confidence.
 */
export async function ragQueryStream(
  documentId: string,
  question: string,
  onToken: (token: string) => void,
): Promise<RagQueryResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const url = import.meta.env.DEV
    ? `/api/functions/rag-query`
    : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ documentId, question, stream: true }),
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(errBody.error || `RAG stream failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Stream not supported')

  const decoder = new TextDecoder()
  let buffer = ''
  let accumulatedAnswer = ''
  let sources: Array<{ content: string; chunk_index: number }> = []
  let confidence: 'high' | 'medium' | 'low' = 'low'
  let enhancedSources: Array<{ chunkIndex: number; snippet: string; score: number }> = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data) continue

      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'token' && parsed.content) {
          accumulatedAnswer += parsed.content
          onToken(parsed.content)
        } else if (parsed.type === 'done') {
          sources = (parsed.sources || []).map((s: { chunkIndex: number; snippet: string }) => ({
            content: s.snippet,
            chunk_index: s.chunkIndex,
          }))
          confidence = parsed.confidence || 'low'
          enhancedSources = (parsed.enhancedSources || parsed.sources || []).map((s: { chunkIndex: number; snippet: string; score?: number }) => ({
            chunkIndex: s.chunkIndex,
            snippet: s.snippet || '',
            score: s.score ?? 0,
          }))
        } else if (parsed.type === 'error') {
          throw new Error(parsed.message || 'Stream error')
        }
      } catch { /* skip malformed lines */ }
    }
  }

  return { answer: accumulatedAnswer, sources, confidence, enhancedSources }
}

/// Global semantic search — embeds query and searches across ALL user chunks
/// Returns matches grouped by document with snippets
export interface GlobalSearchResult {
  documentId: string
  documentTitle: string
  chunks: { id: string; content: string; chunkIndex: number; similarity: number }[]
}
export async function globalSearch(query: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await invokeEdgeFunction('global-search', { query })
  if (error) throw new Error("Search failed: " + error.message)
  return data.results as GlobalSearchResult[]
}

export interface CorpusSource {
  documentId: string
  documentTitle: string
  chunkIndex: number
  snippet: string
}

export interface CorpusRagResult {
  answer: string
  sources: CorpusSource[]
}

export async function corpusRagQuery(question: string): Promise<CorpusRagResult> {
  const { data, error } = await invokeEdgeFunction('corpus-rag-query', { question })
  if (error) throw new Error("Query failed: " + error.message)
  return {
    answer: data.answer || "",
    sources: data.sources || [],
  }
}
// ============================================================================
// Notes & Highlights
// ============================================================================

export async function createNote(documentId: string, body: string) {
  const { data, error } = await supabase
    .from('notes')
    .insert({ document_id: documentId, body })
    .select()
    .single()
  if (error) throw new Error('Failed to create note: ' + error.message)
  return data
}

export async function updateNote(noteId: string, body: string) {
  const { data, error } = await supabase
    .from('notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select()
    .single()
  if (error) throw new Error('Failed to update note: ' + error.message)
  return data
}

export async function deleteNote(noteId: string) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
  if (error) throw new Error('Failed to delete note: ' + error.message)
}

export async function fetchNotes(documentId: string) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
  if (error) throw new Error('Failed to fetch notes: ' + error.message)
  return data ?? []
}

export async function createHighlight(documentId: string, quote: string, note: string = '') {
  const { data, error } = await supabase
    .from('highlights')
    .insert({ document_id: documentId, quote, note })
    .select()
    .single()
  if (error) throw new Error('Failed to create highlight: ' + error.message)
  return data
}

export async function fetchHighlights(documentId: string) {
  const { data, error } = await supabase
    .from('highlights')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
  if (error) throw new Error('Failed to fetch highlights: ' + error.message)
  return data ?? []
}

export async function deleteHighlight(highlightId: string) {
  const { error } = await supabase
    .from('highlights')
    .delete()
    .eq('id', highlightId)
  if (error) throw new Error('Failed to delete highlight: ' + error.message)
}


export async function summarizeDocument(documentId: string, mode: SummaryMode = 'detailed'): Promise<SummaryResult> {
  const { data: cached } = await supabase
    .from('doc_artifacts')
    .select('content')
    .eq('document_id', documentId)
    .eq('artifact_type', `summary_${mode}`)
    .maybeSingle()
  if (cached?.content) {
    const result = cached.content as SummaryResult
    return { ...result, cached: true }
  }
  const { data, error } = await invokeEdgeFunction('summarize-document', { documentId, mode })
  if (error) throw new Error(`Summarization failed: ${error.message}`)
  return data as SummaryResult
}

export async function generateQuiz(documentId: string): Promise<void> {
  const { error } = await invokeEdgeFunction('generate-quiz', { documentId })
  if (error) throw new Error(`Quiz generation failed: ${error.message}`)
}

export async function generateFlashcards(documentId: string): Promise<void> {
  const { error } = await invokeEdgeFunction('generate-flashcards', { documentId })
  if (error) throw new Error(`Flashcard generation failed: ${error.message}`)
}

// ============================================================================
// Concept map
// ============================================================================

export async function generateConceptMap(documentId: string): Promise<ConceptMapData> {
  const { data: cached } = await supabase
    .from('doc_artifacts')
    .select('content')
    .eq('document_id', documentId)
    .eq('artifact_type', 'concept_map')
    .maybeSingle()
  if (cached?.content) {
    const result = cached.content as ConceptMapData
    return { ...result, cached: true }
  }
  const { data, error } = await invokeEdgeFunction('generate-concept-map', { documentId })
  if (error) throw new Error(`Concept map generation failed: ${error.message}`)
  return data as ConceptMapData
}
// ============================================================================
// Document Progress
// ============================================================================

export interface DocStats {
  totalCards: number
  dueToday: number
  mastered: number
  bestScore: { score: number; total: number } | null
  weeklyReviews: number
}

export async function fetchDocProgress(documentId: string): Promise<DocStats> {
  const { data: flashcards } = await supabase
    .from("flashcards")
    .select("id, due_at, interval_days, ease")
    .eq("document_id", documentId)

  const { data: quizAttempts } = await supabase
    .from("quiz_attempts")
    .select("score, total")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)

  const now = new Date().toISOString()
  const totalCards = flashcards?.length || 0
  const dueToday = flashcards?.filter((f) => f.due_at && f.due_at <= now).length || 0
  const mastered = flashcards?.filter((f) => f.interval_days && f.interval_days >= 21).length || 0
  const bestScore = quizAttempts && quizAttempts.length > 0
    ? { score: quizAttempts[0].score, total: quizAttempts[0].total }
    : null

  // Get weekly reviews from flashcards
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weeklyReviews = flashcards?.filter((f) => f.due_at && f.due_at >= weekAgo).length || 0

  return { totalCards, dueToday, mastered, bestScore, weeklyReviews }
}


// ============================================================================
// Flashcard CRUD
// ============================================================================

export interface FlashcardItem {
  id: string
  document_id: string
  front: string
  back: string
  ease: number
  interval_days: number
  due_at: string
  question?: string
  answer?: string
}

export async function fetchFlashcards(documentId: string) {
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .eq('document_id', documentId)
    .order('id')
  if (error) throw new Error(`Failed to fetch flashcards: ${error.message}`)
  return data ?? []
}

export async function recordFlashcardReview(
  flashcardId: string,
  rating: 'again' | 'hard' | 'good' | 'easy',
  ease: number,
  intervalDays: number,
): Promise<void> {
  let newEase = ease
  let newInterval = intervalDays
  if (rating === 'again') {
    newEase = Math.max(1.3, ease - 0.2)
    newInterval = 1
  } else if (rating === 'hard') {
    newEase = Math.max(1.3, ease - 0.15)
    newInterval = Math.max(1, Math.round(intervalDays * 1.2))
  } else if (rating === 'good') {
    newInterval = intervalDays === 0 ? 1 : Math.round(intervalDays * ease)
  } else if (rating === 'easy') {
    newEase = ease + 0.15
    newInterval = intervalDays === 0 ? 1 : Math.round(intervalDays * ease * 1.3)
  }
  const dueAt = new Date(Date.now() + newInterval * 86400000).toISOString()
  const { error: reviewErr } = await supabase.from('review_log').insert({ flashcard_id: flashcardId, rating })
  if (reviewErr) throw new Error(`Failed to record review: ${reviewErr.message}`)
  const { error: updateErr } = await supabase.from('flashcards').update({ ease: newEase, interval_days: newInterval, due_at: dueAt }).eq('id', flashcardId)
  if (updateErr) throw new Error(`Failed to update flashcard: ${updateErr.message}`)
  await onFlashcardReviewed()
}

/**
 * Call the review-flashcard edge function to persist SM-2 scheduling to the DB.
 * Returns the updated scheduling values.
 */
export interface ReviewFlashcardResult {
  ease: number
  intervalDays: number
  dueAt: string
  nextReview: string
}

export async function reviewFlashcard(
  flashcardId: string,
  rating: 'again' | 'hard' | 'good' | 'easy',
): Promise<ReviewFlashcardResult> {
  const { data, error } = await invokeEdgeFunction<ReviewFlashcardResult>('review-flashcard', { flashcardId, rating })
  if (error) throw new Error(`Review failed: ${error.message}`)
  if (!data) throw new Error('No data returned from review-flashcard')
  await onFlashcardReviewed()
  return data
}

/**
 * Fetch flashcards due today (due_at <= now()) for a document, ordered by due_at.
 */
export async function fetchDueFlashcards(documentId: string): Promise<FlashcardItem[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .eq('document_id', documentId)
    .lte('due_at', now)
    .order('due_at')
  if (error) throw new Error(`Failed to fetch due flashcards: ${error.message}`)
  return data ?? []
}


// ============================================================================
// Quiz operations
// ============================================================================

export interface QuizQuestionItem {
  id: string
  document_id: string
  question: string
  options: string[]
  correct_index: number
  explanation: string
  concept: string
}

export async function fetchQuiz(documentId: string) {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('document_id', documentId)
    .order('id')
  if (error) throw new Error(`Failed to fetch quiz: ${error.message}`)
  return data ?? []
}

export async function recordQuizAttempt(documentId: string, score: number, total: number): Promise<void> {
  const { error } = await supabase.from('quiz_attempts').insert({ document_id: documentId, score, total })
  if (error) throw new Error(`Failed to record quiz attempt: ${error.message}`)
  await onQuizCompleted(score, total)
}

export async function fetchQuizBestScore(documentId: string) {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('score, total')
    .eq('document_id', documentId)
    .order('score', { ascending: false })
    .limit(1)
  if (error) throw new Error(`Failed to fetch best score: ${error.message}`)
  return data && data.length > 0 ? data[0] : null
}

// ============================================================================
// Practice exam operations
// ============================================================================

export async function fetchAllQuizQuestions(documentIds: string[]): Promise<any[]> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('*, documents!inner(title)')
    .in('document_id', documentIds)
    .order('id')
  if (error) throw new Error(`Failed to fetch exam questions: ${error.message}`)
  return data ?? []
}

export async function recordExamAttempt(
  docIds: string[],
  score: number,
  total: number,
  perTopic: TopicResult[],
): Promise<void> {
  const { error } = await supabase.from('exam_attempts').insert({
    doc_ids: docIds,
    score,
    total,
    per_topic: perTopic,
  })
  if (error) throw new Error(`Failed to record exam attempt: ${error.message}`)
  await onQuizCompleted(score, total)
}

export async function fetchExamAttempts(): Promise<ExamAttempt[]> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select('*')
    .order('taken_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch exam attempts: ${error.message}`)
  return data ?? []
}

export async function fetchFocusAreas(): Promise<FocusArea[]> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select('per_topic')
  if (error) throw new Error(`Failed to fetch focus areas: ${error.message}`)

  const topicMap = new Map<string, { correct: number; total: number }>()
  for (const row of data ?? []) {
    const topics = row.per_topic as TopicResult[]
    for (const t of topics) {
      const existing = topicMap.get(t.topic) || { correct: 0, total: 0 }
      existing.correct += t.correct
      existing.total += t.total
      topicMap.set(t.topic, existing)
    }
  }

  return Array.from(topicMap.entries())
    .map(([topic, stats]) => ({
      topic,
      missRate: stats.total > 0 ? 1 - stats.correct / stats.total : 0,
      totalAttempts: stats.total,
      correctAttempts: stats.correct,
    }))
    .sort((a, b) => b.missRate - a.missRate)
}

// ============================================================================
// Mastery tracking (Phase 4)
// ============================================================================

export interface ConceptMasteryRow {
  concept: string
  attempts: number
  correct: number
  masteryPct: number
  lastSeen: string | null
  documentId?: string
}

/**
 * Fetch concept-level mastery for a document, sorted by mastery ascending (weakest first).
 */
export async function getConceptMastery(documentId: string): Promise<ConceptMasteryRow[]> {
  const { data, error } = await supabase
    .from('concept_mastery')
    .select('concept, attempts, correct, last_seen')
    .eq('document_id', documentId)
    .order('concept')

  if (error) throw new Error(`Failed to fetch concept mastery: ${error.message}`)

  const rows = (data ?? []).map((r) => ({
    concept: r.concept,
    attempts: r.attempts,
    correct: r.correct,
    masteryPct: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastSeen: r.last_seen,
  }))

  // Sort by mastery ascending (weakest first)
  rows.sort((a, b) => a.masteryPct - b.masteryPct)
  return rows
}

/**
 * Get overall document mastery score (weighted mean of concept mastery, 0-100).
 */
export async function getDocumentMastery(documentId: string): Promise<number> {
  const concepts = await getConceptMastery(documentId)
  if (concepts.length === 0) return 0
  const totalWeight = concepts.reduce((sum, c) => sum + c.attempts, 0)
  if (totalWeight === 0) return 0
  const weighted = concepts.reduce((sum, c) => sum + c.masteryPct * c.attempts, 0)
  return Math.round(weighted / totalWeight)
}

// ============================================================================
// Targeted practice (Phase 4)
// ============================================================================

/**
 * Generate targeted practice focused on the weakest concepts.
 */
export async function generateTargetedPractice(
  documentId: string,
  mode: 'quiz' | 'flashcards',
): Promise<void> {
  const { error } = await invokeEdgeFunction('generate-targeted-practice', { documentId, mode })
  if (error) throw new Error(`Targeted practice generation failed: ${error.message}`)
}

// ============================================================================
// Dashboard & Analytics (Phase 5)
// ============================================================================

/**
 * Count flashcards due now across ALL user documents.
 */
export async function getGlobalDueCount(): Promise<number> {
  const now = new Date().toISOString()
  const { count, error } = await supabase
    .from('flashcards')
    .select('*', { count: 'exact', head: true })
    .lte('due_at', now)
  if (error) throw new Error(`Failed to count due cards: ${error.message}`)
  return count ?? 0
}

/**
 * Compute study streak: consecutive local-calendar days with >=1 study_event,
 * counting back from today (or the most recent event if not today).
 */
export async function getStudyStreak(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('study_events')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch streak data: ${error.message}`)
  if (!data || data.length === 0) return 0

  // Extract unique local calendar dates
  const dates = new Set<string>()
  for (const row of data) {
    const d = new Date(row.created_at)
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    dates.add(localDate)
  }

  const sortedDates = Array.from(dates).sort().reverse()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // If the most recent event is not today nor yesterday, streak is broken
  const mostRecent = sortedDates[0]
  if (mostRecent !== todayStr) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    if (mostRecent !== yesterdayStr) return 0
  }

  // Count consecutive days backward
  let streak = 0
  const current = new Date(sortedDates[0])
  for (const dateStr of sortedDates) {
    const expected = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    if (dateStr !== expected) break
    streak++
    current.setDate(current.getDate() - 1)
  }

  return streak
}

/**
 * Fetch the most recent study events with document titles for the activity feed.
 */
export interface ActivityItem {
  id: string
  eventType: string
  docTitle: string
  docId: string
  summary: string
  createdAt: string
}

export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('study_events')
    .select('id, event_type, event_data, created_at, document_id, documents!inner(title)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch activity: ${error.message}`)

  return (data ?? []).map((r: any) => {
    const docTitle = r.documents?.title ?? 'Unknown document'
    let summary = ''
    switch (r.event_type) {
      case 'quiz_answer':
        summary = `Answered a quiz question on ${docTitle}`
        break
      case 'quiz_completed':
        summary = `Completed a quiz on ${docTitle} — ${r.event_data?.score ?? '?'}/${r.event_data?.total ?? '?'}`
        break
      case 'flashcard_review':
        summary = `Reviewed a flashcard in ${docTitle}`
        break
      case 'summary_view':
        summary = `Viewed summary of ${docTitle}`
        break
      case 'chat_query':
        summary = `Asked a question about ${docTitle}`
        break
      default:
        summary = `Activity in ${docTitle}`
    }
    return {
      id: r.id,
      eventType: r.event_type,
      docTitle,
      docId: r.document_id,
      summary,
      createdAt: r.created_at,
    }
  })
}

/**
 * Fetch the last N quiz attempts for the score sparkline.
 */
export interface QuizAttemptSummary {
  score: number
  total: number
  pct: number
  createdAt: string
}

export async function getQuizHistory(limit = 10): Promise<QuizAttemptSummary[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('score, total, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch quiz history: ${error.message}`)

  return (data ?? []).reverse().map((r: any) => ({
    score: r.score,
    total: r.total,
    pct: r.total > 0 ? Math.round((r.score / r.total) * 100) : 0,
    createdAt: r.created_at,
  }))
}

/**
 * Compute average mastery across all documents (mean of concept mastery %).
 */
export async function getAvgMastery(): Promise<number> {
  const { data, error } = await supabase
    .from('concept_mastery')
    .select('attempts, correct')
    .gt('attempts', 0)

  if (error) throw new Error(`Failed to fetch mastery data: ${error.message}`)

  if (!data || data.length === 0) return 0

  let totalPct = 0
  for (const r of data) {
    totalPct += (r.correct / r.attempts) * 100
  }
  return Math.round(totalPct / data.length)
}

/**
 * Fetch per-document due flashcard counts for "Continue studying" + doc grid badges.
 */
export async function getDocDueCounts(): Promise<Record<string, number>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('flashcards')
    .select('document_id')
    .lte('due_at', now)

  if (error) throw new Error(`Failed to fetch due counts: ${error.message}`)

  const counts: Record<string, number> = {}
  for (const r of data ?? []) {
    counts[r.document_id] = (counts[r.document_id] || 0) + 1
  }
  return counts
}

/**
 * Compute a simple mastery % for each document from concept_mastery.
 */
export async function getDocMasteryMap(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('concept_mastery')
    .select('document_id, attempts, correct')
    .gt('attempts', 0)

  if (error) throw new Error(`Failed to fetch doc mastery: ${error.message}`)

  const docData: Record<string, { totalPct: number; count: number }> = {}
  for (const r of data ?? []) {
    if (!docData[r.document_id]) docData[r.document_id] = { totalPct: 0, count: 0 }
    docData[r.document_id].totalPct += (r.correct / r.attempts) * 100
    docData[r.document_id].count++
  }

  const result: Record<string, number> = {}
  for (const [docId, d] of Object.entries(docData)) {
    result[docId] = Math.round(d.totalPct / d.count)
  }
  return result
}

// ============================================================================
// Course operations (Phase B3)
// ============================================================================

/**
 * Generate targeted practice across all documents in a course.
 */
export async function generateCoursePractice(
  courseId: string,
  mode: 'quiz' | 'flashcards',
): Promise<void> {
  const { error } = await invokeEdgeFunction('generate-course-practice', { courseId, mode })
  if (error) throw new Error(`Course practice generation failed: ${error.message}`)
}


export interface CourseSource {
  documentId: string
  documentTitle: string
  chunkIndex: number
  snippet: string
}

export interface CourseRagResult {
  answer: string
  sources: CourseSource[]
}

/**
 * Ask a question across all documents in a course.
 */
export async function courseRagQuery(courseId: string, question: string): Promise<CourseRagResult> {
  const { data, error } = await invokeEdgeFunction<CourseRagResult>('rag-query-course', { courseId, question })
  if (error) throw new Error(`Course query failed: ${error.message}`)
  return {
    answer: data?.answer || "",
    sources: data?.sources || [],
  }
}

/**
 * Fetch all courses for the current user with aggregate metadata.
 */
export async function fetchCourses(): Promise<Array<{
  id: string
  title: string
  description: string
  document_count: number
  created_at: string
}>> {
  // First get courses
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, title, description, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch courses: ${error.message}`)
  if (!courses || courses.length === 0) return []

  // Count documents per course
  const courseIds = courses.map(c => c.id)
  const { data: counts } = await supabase
    .from('course_documents')
    .select('course_id')
    .in('course_id', courseIds)

  const docCounts: Record<string, number> = {}
  for (const row of counts ?? []) {
    docCounts[row.course_id] = (docCounts[row.course_id] || 0) + 1
  }

  return courses.map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    document_count: docCounts[c.id] || 0,
    created_at: c.created_at,
  }))
}

/**
 * Create a new course.
 */
export async function createCourse(title: string, description = ''): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('courses')
    .insert({ title: title.trim(), description: description.trim() })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create course: ${error.message}`)
  return data
}

/**
 * Delete a course (cascades to course_documents).
 */
export async function deleteCourse(courseId: string): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId)

  if (error) throw new Error(`Failed to delete course: ${error.message}`)
}

/**
 * Add a document to a course.
 */
export async function addDocumentToCourse(courseId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('course_documents')
    .insert({ course_id: courseId, document_id: documentId })

  if (error) throw new Error(`Failed to add document to course: ${error.message}`)
}

/**
 * Remove a document from a course.
 */
export async function removeDocumentFromCourse(courseId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('course_documents')
    .delete()
    .eq('course_id', courseId)
    .eq('document_id', documentId)

  if (error) throw new Error(`Failed to remove document from course: ${error.message}`)
}

/**
 * Get course detail with all member documents and their metadata.
 */
export async function fetchCourseDetail(courseId: string): Promise<{
  id: string
  title: string
  description: string
  created_at: string
  documents: Array<{
    id: string
    title: string
    source_type: string
    mastery: number | null
    due_count: number
  }>
  aggregate_mastery: number | null
  total_due_cards: number
}> {
  // Fetch course
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('id, title, description, created_at')
    .eq('id', courseId)
    .single()

  if (courseErr) throw new Error(`Course not found: ${courseErr.message}`)

  // Fetch member documents
  const { data: members, error: membersErr } = await supabase
    .from('course_documents')
    .select('document_id, documents!inner(id, title, source_type)')
    .eq('course_id', courseId)

  if (membersErr) throw new Error(`Failed to fetch course documents: ${membersErr.message}`)

  const docs = (members ?? []).map((m: any) => ({
    id: m.documents.id,
    title: m.documents.title,
    source_type: m.documents.source_type,
  }))

  // Batch fetch mastery and due counts for all docs
  const now = new Date().toISOString()
  const docIds = docs.map((d: any) => d.id)

  const [conceptRows, flashcardCounts] = await Promise.all([
    supabase.from('concept_mastery').select('document_id, attempts, correct').in('document_id', docIds).gt('attempts', 0),
    supabase.from('flashcards').select('document_id', { count: 'exact', head: true }).in('document_id', docIds).lte('due_at', now),
  ])

  // Group mastery per doc
  const masteryByDoc: Record<string, number> = {}
  const docAttempts: Record<string, { totalPct: number; count: number }> = {}
  for (const r of conceptRows.data ?? []) {
    if (!docAttempts[r.document_id]) docAttempts[r.document_id] = { totalPct: 0, count: 0 }
    docAttempts[r.document_id].totalPct += (r.correct / r.attempts) * 100
    docAttempts[r.document_id].count++
  }
  for (const [docId, d] of Object.entries(docAttempts)) {
    masteryByDoc[docId] = Math.round(d.totalPct / d.count)
  }

  // Group due counts per doc
  const dueByDoc: Record<string, number> = {}
  for (const r of flashcardCounts.data ?? []) {
    dueByDoc[r.document_id] = (dueByDoc[r.document_id] || 0) + 1
  }

  let aggregateMastery: number | null = null
  let totalDueCards = 0

  const docDetails = docs.map((doc: { id: string; title: string; source_type: string }) => {
    const mastery = masteryByDoc[doc.id] ?? null
    const dueCount = dueByDoc[doc.id] ?? 0
    totalDueCards += dueCount
    return { ...doc, mastery, due_count: dueCount }
  })

  // Compute aggregate mastery (weighted average)
  const masteryDocs = docDetails.filter((d: any) => d.mastery !== null)
  if (masteryDocs.length > 0) {
    aggregateMastery = Math.round(
      masteryDocs.reduce((sum: number, d: any) => sum + d.mastery, 0) / masteryDocs.length
    )
  }

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    created_at: course.created_at,
    documents: docDetails,
    aggregate_mastery: aggregateMastery,
    total_due_cards: totalDueCards,
  }
}

// ============================================================================
// Global review queue (Phase B4)
// ============================================================================

/**
 * Fetch all due flashcards across all user documents, ordered by due_at ascending (most overdue first),
 * with the source document title.
 */
export interface GlobalDueCard {
  id: string
  front: string
  back: string
  ease: number
  interval_days: number
  due_at: string
  document_id: string
  document_title: string
}

export async function fetchDueFlashcardsGlobal(): Promise<GlobalDueCard[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('flashcards')
    .select('id, front, back, ease, interval_days, due_at, document_id, documents!inner(title)')
    .lte('due_at', now)
    .order('due_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch global due cards: ${error.message}`)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    front: r.front,
    back: r.back,
    ease: r.ease,
    interval_days: r.interval_days,
    due_at: r.due_at,
    document_id: r.document_id,
    document_title: r.documents?.title || 'Unknown',
  }))
}

// ============================================================================
// Push notification subscriptions (Phase B4)
// ============================================================================

/**
 * Convert a PushSubscription to plain object for storage.
 */
function subscriptionToRow(sub: PushSubscription): {
  endpoint: string
  p256dh_key: string
  auth_key: string
} {
  const keyJson = (sub.toJSON() as any).keys || {}
  return {
    endpoint: sub.endpoint,
    p256dh_key: keyJson.p256dh || '',
    auth_key: keyJson.auth || '',
  }
}

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Get the current push notification permission status.
 */
export function getNotificationPermission(): NotificationPermission {
  return Notification.permission
}

/**
 * Register a push subscription and save it to the server.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      // Already subscribed — just sync to server
      const row = subscriptionToRow(existing)
      const { error } = await supabase.from('push_subscriptions').upsert(
        { ...row },
        { onConflict: 'endpoint' },
      )
      return !error
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    })

    const row = subscriptionToRow(sub)
    const { error } = await supabase.from('push_subscriptions').insert(row)
    return !error
  } catch {
    return false
  }
}

/**
 * Unsubscribe from push notifications and remove from server.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
      // Remove from server
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', sub.endpoint)
      return !error
    }
    return true
  } catch {
    return false
  }
}

/**
 * Check if the user has an active push subscription on the server.
 */
export async function hasActiveSubscription(): Promise<boolean> {
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })
  if (error) return false
  return (count ?? 0) > 0
}

/**
 * Trigger a due-reminder push for the current user (called from settings or
 * from a scheduled job).
 */
export async function triggerDueReminder(): Promise<{ sent: boolean; dueCount: number }> {
  const { data, error } = await invokeEdgeFunction<{ sent: boolean; dueCount: number }>(
    'send-due-reminder',
    { immediate: true },
  )
  if (error) throw new Error(`Push reminder failed: ${error.message}`)
  return { sent: data?.sent ?? false, dueCount: data?.dueCount ?? 0 }
}

/**
 * Convert a base64-encoded VAPID public key to a Uint8Array for subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// ============================================================================
// Profile operations (Phase P1)
// ============================================================================

/**
 * Fetch the current user's profile.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .single()
  if (error) return null
  return data as Profile
}

/**
 * Update the current user's profile (username, display_name, bio, avatar_url, is_public).
 * The profile row is auto-created by a trigger on auth.users signup, so UPDATE is safe.
 * RLS ensures only the owner can update their own row.
 */
export async function updateProfile(updates: Partial<Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_url' | 'is_public'>>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .select()
    .single()
  if (error) throw new Error(`Failed to update profile: ${error.message}`)
  return data as Profile
}

/**
 * Check if a username is available (not taken, not reserved, valid format).
 * Returns { available: boolean; reason?: string }.
 */
export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; reason?: string }> {
  // Client-side format validation first
  if (username.length < 3 || username.length > 30) {
    return { available: false, reason: 'Username must be 3-30 characters' }
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]{1,28}[a-zA-Z0-9]$/.test(username)) {
    return { available: false, reason: 'Username must start with a letter and contain only letters, numbers, and underscores' }
  }

  // Check reserved names
  const { count: reservedCount } = await supabase
    .from('reserved_usernames')
    .select('*', { count: 'exact', head: true })
    .eq('username', username.toLowerCase())
  if (reservedCount && reservedCount > 0) {
    return { available: false, reason: 'This username is reserved' }
  }

  // Check if already taken
  const { count: takenCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('username', username)
  if (takenCount && takenCount > 0) {
    return { available: false, reason: 'This username is already taken' }
  }

  return { available: true }
}

/**
 * Fetch public profile stats for a given username.
 * Returns null if the profile is private or doesn't exist.
 */
export async function getPublicProfile(username: string): Promise<PublicProfileStats | null> {
  const { data, error } = await supabase.rpc('get_public_profile', {
    requested_username: username,
  })
  if (error) return null
  if (!data || data.length === 0) return null
  return data[0] as PublicProfileStats
}

// ============================================================================
// Retention prediction (Phase C2)
// ============================================================================

/**
 * Count concepts whose predicted retention is below the threshold using
 * the forgetting-curve model. Fetches concept_mastery data and computes
 * retention client-side via computeConceptRetentions().
 */
export async function getAtRiskCount(): Promise<number> {
  const { data, error } = await supabase
    .from('concept_mastery')
    .select('concept, attempts, correct, last_seen, document_id')
    .gt('attempts', 0)

  if (error) return 0

  const rows = (data ?? []).map((r: any) => ({
    concept: r.concept,
    attempts: r.attempts,
    correct: r.correct,
    masteryPct: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastSeen: r.last_seen,
    documentId: r.document_id,
  }))

  const retentions = computeConceptRetentions(rows, [])
  return retentions.filter((r) => r.atRisk).length
}

/**
 * Get document IDs that have at-risk concepts (for dashboard surfacing),
 * computed using the forgetting-curve model.
 */
export async function getAtRiskDocIds(): Promise<Array<{ docId: string; count: number }>> {
  const { data, error } = await supabase
    .from('concept_mastery')
    .select('concept, attempts, correct, last_seen, document_id')
    .gt('attempts', 0)

  if (error) return []

  const rows = (data ?? []).map((r: any) => ({
    concept: r.concept,
    attempts: r.attempts,
    correct: r.correct,
    masteryPct: r.attempts > 0 ? Math.round((r.correct / r.attempts) * 100) : 0,
    lastSeen: r.last_seen,
    documentId: r.document_id,
  }))

  const retentions = computeConceptRetentions(rows, [])

  // Group at-risk counts by document
  const atRiskByDoc = new Map<string, number>()
  for (const r of retentions) {
    if (r.atRisk) {
      const docId = r.documentId || 'unknown'
      atRiskByDoc.set(docId, (atRiskByDoc.get(docId) || 0) + 1)
    }
  }

  return Array.from(atRiskByDoc.entries()).map(([docId, count]) => ({ docId, count }))
}

// ============================================================================
// Chat messages
// ============================================================================

export async function fetchChatMessages(documentId: string) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to fetch chat messages: ${error.message}`)
  return data ?? []
}

export async function insertChatMessage(documentId: string, role: 'user' | 'assistant', content: string) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ document_id: documentId, role, content })
  if (error) throw new Error(`Failed to save chat message: ${error.message}`)
}

// ============================================================================
// User settings
// ============================================================================

export interface UserSettings {
  user_id: string
  daily_goal: number
  theme: string | null
  created_at: string
  updated_at: string
}

export async function fetchUserSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch user settings: ${error.message}`)
  return data as UserSettings | null
}

export async function upsertUserSettings(settings: { daily_goal?: number; theme?: string }): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(`Failed to save user settings: ${error.message}`)
}

// ============================================================================
// Progress tracking
