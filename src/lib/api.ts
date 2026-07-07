import { supabase } from './supabase'
import { onFlashcardReviewed, onQuizCompleted } from './gamification'
import type { SummaryMode, SummaryResult, ConceptMapData, ExamAttempt, TopicResult, FocusArea } from '../types/db'

// ============================================================================
// Document processing
// ============================================================================

// ============================================================================
// Edge function invocation helper (routes through Vite proxy in dev)
// ============================================================================

async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string } | null }> {
  // In development, use Vite proxy to avoid CORS issues on random ports
  if (import.meta.env.DEV) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const response = await fetch(`/api/functions/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: response.statusText }))
        return { data: null, error: { message: errBody.error || 'Request failed' } }
      }
      const data = await response.json()
      return { data, error: null }
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } }
    }
  }

  // In production, use Supabase client directly (CORS is pre-configured for production origin)
  const { data, error } = await supabase.functions.invoke(functionName, { body })
  return { data: data as T | null, error: error as { message: string } | null }
}

// ============================================================================
// Document processing
// ============================================================================

// ============================================================================
// Edge function invocation helper (routes through Vite proxy in dev)
// ============================================================================

async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const response = await fetch(`/api/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: response.statusText }))
      return { data: null, error: { message: errBody.error || 'Request failed' } }
    }
    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    return { data: null, error: { message: (err as Error).message } }
  }
}

export async function embedDocument(documentId: string): Promise<void> {
  const { error } = await invokeEdgeFunction('embed-document', { documentId })
  if (error) throw new Error(`Embedding failed: ${error.message}`)
}

export async function ragQuery(documentId: string, query: string) {
  const { data, error } = await invokeEdgeFunction('rag-query', { documentId, query })
  if (error) throw new Error(`RAG query failed: ${error.message}`)
  return data as { answer: string; sources: Array<{ content: string; chunk_index: number }> }
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
    .single()
  if (cached) {
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
    .single()
  if (cached) {
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
    .select("id, next_review, mastery_level")
    .eq("document_id", documentId)

  const { data: quizAttempts } = await supabase
    .from("quiz_attempts")
    .select("score, total")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)

  const now = new Date().toISOString()
  const totalCards = flashcards?.length || 0
  const dueToday = flashcards?.filter((f) => f.next_review && f.next_review <= now).length || 0
  const mastered = flashcards?.filter((f) => f.mastery_level && f.mastery_level >= 5).length || 0
  const bestScore = quizAttempts && quizAttempts.length > 0
    ? { score: quizAttempts[0].score, total: quizAttempts[0].total }
    : null

  // Get weekly reviews from flashcards
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weeklyReviews = flashcards?.filter((f) => f.next_review && f.next_review >= weekAgo).length || 0

  return { totalCards, dueToday, mastered, bestScore, weeklyReviews }
}


// ============================================================================
// Flashcard CRUD
// ============================================================================

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

// ============================================================================
// Quiz operations
// ============================================================================

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
// Progress tracking
