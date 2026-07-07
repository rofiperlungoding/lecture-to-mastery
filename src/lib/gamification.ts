import { supabase } from './supabase'
import { showToast } from '../components/Toast'
import { ACHIEVEMENT_DEFS, type UserStats, type Achievement } from '../types/db'

// ============================================================================
// XP constants
// ============================================================================
const XP_FLASHCARD_REVIEW = 10
const XP_QUIZ_COMPLETED = 20
const XP_CHAT_QUESTION = 5
const XP_DOCUMENT_STUDIED = 50

// ============================================================================
// Level formula: level = floor(sqrt(xp / 100)) + 1
// ============================================================================
export function calcLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 100
}

export function xpToNextLevel(xp: number): number {
  const currentLevel = calcLevel(xp)
  const currentLevelMin = xpForLevel(currentLevel)
  const nextLevelMin = xpForLevel(currentLevel + 1)
  return nextLevelMin - currentLevelMin
}

export function xpProgressInLevel(xp: number): number {
  const currentLevel = calcLevel(xp)
  const currentLevelMin = xpForLevel(currentLevel)
  const nextLevelMin = xpForLevel(currentLevel + 1)
  if (nextLevelMin === currentLevelMin) return 1
  return (xp - currentLevelMin) / (nextLevelMin - currentLevelMin)
}

// ============================================================================
// Database helpers
// ============================================================================

export async function fetchUserStats(): Promise<UserStats | null> {
  const { data } = await supabase
    .from('user_stats')
    .select('*')
    .single()
  return data
}

export async function fetchAchievements(): Promise<Achievement[]> {
  const { data } = await supabase
    .from('achievements')
    .select('*')
    .order('unlocked_at', { ascending: false })
  return data ?? []
}

// ============================================================================
// Core: Award XP and update streak
// ============================================================================

export async function awardXp(amount: number): Promise<UserStats | null> {
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) return null

  const stats = await fetchUserStats()

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  let newStreak = 0
  let newLongest = 0

  if (!stats) {
    newStreak = 1
    newLongest = 1
  } else {
    const lastActive = stats.last_active
    if (lastActive === today) {
      newStreak = stats.current_streak
    } else if (lastActive === yesterday) {
      newStreak = stats.current_streak + 1
    } else {
      newStreak = 1
    }
    newLongest = Math.max(stats.longest_streak, newStreak)
  }

  const newXp = (stats?.xp ?? 0) + amount
  const newLevel = calcLevel(newXp)

  const { data } = await supabase
    .from('user_stats')
    .upsert({
      user_id: userId,
      xp: newXp,
      level: newLevel,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_active: today,
    })
    .select()
    .single()

  // Level up toast
  if (stats && newLevel > stats.level) {
    showToast('success', '🎉 Level up! You are now level ' + newLevel + '!')
  }

  // Check streak achievements
  if (newStreak >= 3) await unlockAchievement('streak_3')
  if (newStreak >= 7) await unlockAchievement('streak_7')

  return data
}

// ============================================================================
// Achievements: check and unlock (idempotent via unique constraint)
// ============================================================================

async function unlockAchievement(key: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('achievements')
    .select('id')
    .eq('key', key)
    .single()

  if (existing) return false

  const { error } = await supabase
    .from('achievements')
    .insert({ key })

  if (error) {
    if (error.message?.includes('duplicate') || error.code === '23505') return false
    console.error('[Gamification] Failed to unlock achievement:', error.message)
    return false
  }

  const def = ACHIEVEMENT_DEFS[key]
  const label = def?.label || key
  showToast('success', '🏅 Achievement unlocked: ' + label + '!')
  return true
}

// ============================================================================
// Action handlers (called from study action points)
// ============================================================================

export async function onFlashcardReviewed(): Promise<void> {
  await awardXp(XP_FLASHCARD_REVIEW)

  // Check cards_50 achievement
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (userId) {
    const { count } = await supabase
      .from('review_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (count && count >= 50) {
      await unlockAchievement('cards_50')
    }
  }

  // Check completionist: all cards in session reviewed
  // (totalInSession is passed from the flashcard panel when all cards done)
  // Handled separately via onSessionCompleted
}

export async function onSessionCompleted(totalCards: number, reviewedCount: number): Promise<void> {
  if (reviewedCount >= totalCards && totalCards > 0) {
    await unlockAchievement('completionist')
  }
}

export async function onQuizCompleted(score: number, total: number): Promise<void> {
  await awardXp(XP_QUIZ_COMPLETED)

  if (score === total) {
    await unlockAchievement('quiz_ace_100')
  }
  await unlockAchievement('first_quiz')
}

export async function onChatQuestion(): Promise<void> {
  await awardXp(XP_CHAT_QUESTION)
}

export async function onDocumentStudied(): Promise<void> {
  await awardXp(XP_DOCUMENT_STUDIED)
  await unlockAchievement('first_document')
}

export async function checkNightOwl(): Promise<void> {
  const hour = new Date().getHours()
  if (hour >= 22 || hour < 5) {
    await unlockAchievement('night_owl')
  }
}
