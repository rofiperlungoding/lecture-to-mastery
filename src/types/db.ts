export interface Document {
  id: string
  title: string
  source_type: string
  language: string
  source_meta?: Record<string, unknown> | null
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
  concept: string
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
  importance: number // 1-3
}

export interface ConceptMapEdge {
  source: string
  target: string
  label: string
}

export interface ConceptMapData {
  nodes: ConceptMapNode[]
  edges: ConceptMapEdge[]
  cached?: boolean
}

export type AchievementId =
  | 'first_document' | 'first_quiz' | 'quiz_ace_100'
  | 'streak_3' | 'streak_7' | 'streak_30'
  | 'cards_50' | 'cards_500'
  | 'night_owl' | 'completionist'
  | 'weak_spot_slayer' | 'exam_ace' | 'mastery_first'

export type AchievementTier = 'bronze' | 'silver' | 'gold'

export interface AchievementDef {
  id: AchievementId
  label: string
  description: string
  icon: string
  tier: AchievementTier
  /** Condition description for progress display */
  condition: string
  /** XP reward for this achievement */
  xpReward: number
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first_document', label: 'First Document',   description: 'Upload your first document',       icon: '📄', tier: 'bronze', condition: 'Upload a document', xpReward: 25 },
  { id: 'first_quiz',     label: 'Quiz Novice',      description: 'Complete your first quiz',          icon: '🧠', tier: 'bronze', condition: 'Complete a quiz', xpReward: 25 },
  { id: 'quiz_ace_100',   label: 'Perfect Score',    description: 'Get 100% on a quiz',                icon: '🏆', tier: 'silver', condition: 'Score 100% on any quiz', xpReward: 50 },
  { id: 'streak_3',       label: 'On a Roll',        description: '3-day study streak',                icon: '🔥', tier: 'bronze', condition: 'Maintain a 3-day streak', xpReward: 30 },
  { id: 'streak_7',       label: 'Week Warrior',     description: '7-day study streak',                icon: '💪', tier: 'silver', condition: 'Maintain a 7-day streak', xpReward: 75 },
  { id: 'streak_30',      label: 'Iron Will',        description: '30-day study streak',               icon: '⚡', tier: 'gold',   condition: 'Maintain a 30-day streak', xpReward: 200 },
  { id: 'cards_50',       label: 'Card Collector',   description: 'Review 50 flashcards',              icon: '🃏', tier: 'bronze', condition: 'Review 50 flashcards', xpReward: 20 },
  { id: 'cards_500',      label: 'Card Master',      description: 'Review 500 flashcards',             icon: '📚', tier: 'gold',   condition: 'Review 500 flashcards', xpReward: 150 },
  { id: 'night_owl',      label: 'Night Owl',        description: 'Study after 10 PM',                 icon: '🦉', tier: 'bronze', condition: 'Study after 10 PM', xpReward: 15 },
  { id: 'completionist',  label: 'Completionist',    description: 'Complete all cards in a session',   icon: '🎯', tier: 'silver', condition: 'Review every card in a document', xpReward: 50 },
  { id: 'weak_spot_slayer', label: 'Weak-Spot Slayer', description: 'Complete a targeted practice session', icon: '🎯', tier: 'silver', condition: 'Complete targeted practice', xpReward: 50 },
  { id: 'exam_ace',       label: 'Exam Ace',         description: 'Score 90%+ on an exam',            icon: '📝', tier: 'gold',   condition: 'Score 90%+ on a practice exam', xpReward: 100 },
  { id: 'mastery_first',  label: 'Mastery Achieved',  description: 'Reach 90%+ average mastery',      icon: '⭐', tier: 'gold',   condition: 'Reach 90% average mastery', xpReward: 150 },
]

/** Get achievement definition by id */
export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((a) => a.id === id)
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

// ============================================================================
// Event tracking (Phase 3)
// ============================================================================

export type StudyEventType = 'quiz_answer' | 'quiz_completed' | 'flashcard_review' | 'summary_view' | 'chat_query' | 'exam_completed'

export interface StudyEvent {
  id: string
  document_id: string
  user_id: string
  event_type: StudyEventType
  event_data: Record<string, unknown>
  created_at: string
}

export interface ConceptMastery {
  id: string
  document_id: string
  user_id: string
  concept: string
  attempts: number
  correct: number
  last_seen: string | null
}

// ── Profile types (Phase P1) ───────────────────────────────────────────────

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  is_public: boolean
  created_at: string
}

export interface PublicProfileStats {
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  join_date: string
  total_documents: number
  current_streak: number
  total_cards: number
  avg_mastery: number
  achievements: Array<{ key: string; unlocked_at: string }>
}

// ── Course types (Phase B3) ────────────────────────────────────────────────

export interface Course {
  id: string
  user_id: string
  title: string
  description: string
  created_at: string
}

export interface CourseDocument {
  course_id: string
  document_id: string
  added_at: string
}

export interface CourseWithMeta extends Course {
  document_count: number
  aggregate_mastery: number | null
  total_due_cards: number
  documents: Array<{
    id: string
    title: string
    source_type: string
    mastery: number | null
    due_count: number
  }>
}
