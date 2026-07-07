export interface Document {
  id: string
  title: string
  source_type: string
  created_at: string
  user_id?: string
}

export type DocumentInsert = Omit<Document, 'id' | 'created_at'>

export interface Chunk {
  id: string
  document_id: string
  content: string
  chunk_index: number
  embedding: number[] | null
  user_id?: string
}

export type ChunkInsert = Omit<Chunk, 'id'>

export interface Flashcard {
  id: string
  document_id: string
  front: string
  back: string
  ease: number
  interval_days: number
  due_at: string
  user_id?: string
}

export type FlashcardInsert = Omit<Flashcard, 'id'>

export interface QuizQuestion {
  id: string
  document_id: string
  question: string
  options: string[]
  correct_index: number
  explanation: string
  user_id?: string
}

export type QuizQuestionInsert = Omit<QuizQuestion, 'id'>

export interface UserStats {
  user_id: string
  xp: number
  level: number
  current_streak: number
  longest_streak: number
  last_active: string | null
}

export type UserStatsInsert = Omit<UserStats, 'user_id'>

export interface Achievement {
  id: string
  user_id: string
  key: string
  unlocked_at: string
}

export type AchievementInsert = Omit<Achievement, 'id'>

export interface DocArtifact {
  id: string
  document_id: string
  user_id: string
  artifact_type: string
  content: unknown
  created_at: string
  updated_at: string
}

export type DocArtifactInsert = Omit<DocArtifact, 'id' | 'created_at' | 'updated_at'>

export type SummaryMode = 'eli5' | 'detailed' | 'cheat-sheet'

export interface SummaryResult {
  tldr: string
  keyPoints: string[]
  keyTerms: { term: string; definition: string }[]
  cached?: boolean
}

export interface ConceptMapNode {
  id: string
  label: string
}

export interface ConceptMapEdge {
  from: string
  to: string
  label: string
}

export interface ConceptMapData {
  nodes: ConceptMapNode[]
  edges: ConceptMapEdge[]
  cached?: boolean
}

export const ACHIEVEMENT_DEFS: Record<string, { label: string; description: string; icon: string }> = {
  first_document: { label: 'First Document', description: 'Upload your first document', icon: '📄' },
  first_quiz: { label: 'Quiz Novice', description: 'Complete your first quiz', icon: '🧠' },
  quiz_ace_100: { label: 'Perfect Score', description: 'Get 100% on a quiz', icon: '🏆' },
  streak_3: { label: 'On a Roll', description: '3-day study streak', icon: '🔥' },
  streak_7: { label: 'Week Warrior', description: '7-day study streak', icon: '💪' },
  cards_50: { label: 'Card Collector', description: 'Review 50 flashcards', icon: '🃏' },
  night_owl: { label: 'Night Owl', description: 'Study after 10 PM', icon: '🦉' },
  completionist: { label: 'Completionist', description: 'Complete all cards in a document', icon: '🎯' },
}

export interface ExamAttempt {
  id: string
  user_id: string
  doc_ids: string[]
  score: number
  total: number
  per_topic: TopicResult[]
  taken_at: string
}

export interface TopicResult {
  topic: string
  correct: number
  total: number
}

export interface FocusArea {
  topic: string
  missRate: number
  totalAttempts: number
  correctAttempts: number
}

export interface Note {
  id: string
  user_id: string
  document_id: string
  body: string
  created_at: string
  updated_at: string
}

export interface Highlight {
  id: string
  user_id: string
  document_id: string
  quote: string
  note: string
  created_at: string
}
