import type { FlashcardItem, QuizQuestionItem } from './api'
import type { Note, Highlight } from '../types/db'

// ============================================================================
// Anki-importable CSV — front,back + optional SM-2 scheduling fields
// Anki expects UTF-8 CSV with BOM for unicode support
// ============================================================================

export interface AnkiExportOptions {
  includeSm2?: boolean
}

/**
 * Generate an Anki-importable CSV from an array of flashcards.
 * Basic: front,back
 * Extended: front,back,ease,interval_days,due_at (SM-2 scheduling columns)
 */
export function flashcardsToAnkiCsv(
  flashcards: FlashcardItem[],
  options: AnkiExportOptions = {},
): string {
  const { includeSm2 = false } = options

  const header = includeSm2
    ? 'front,back,ease,interval_days,due_at'
    : 'front,back'

  const rows = flashcards.map((f) => {
    const front = escapeCsv(f.front || f.question || '')
    const back = escapeCsv(f.back || f.answer || '')
    if (includeSm2) {
      const ease = escapeCsv(String(f.ease ?? 2.5))
      const interval = escapeCsv(String(f.interval_days ?? 0))
      const due = escapeCsv(f.due_at ? new Date(f.due_at).toISOString().split('T')[0] : '')
      return `${front},${back},${ease},${interval},${due}`
    }
    return `${front},${back}`
  })

  // BOM for UTF-8, then header + rows
  return '\uFEFF' + [header, ...rows].join('\n')
}

// ============================================================================
// Plain text format
// ============================================================================

export function flashcardsToTxt(flashcards: FlashcardItem[]): string {
  return flashcards
    .map((f) => `${f.front || f.question || ''}\n${f.back || f.answer || ''}\n---`)
    .join('\n\n')
}

// ============================================================================
// Quiz questions to CSV (for review)
// ============================================================================

export function quizToCsv(questions: QuizQuestionItem[]): string {
  const header = 'question,options,correct_index,explanation,concept'
  const rows = questions.map((q) => {
    const question = escapeCsv(q.question)
    const options = escapeCsv(q.options.join(' | '))
    const explanation = escapeCsv(q.explanation)
    const concept = escapeCsv(q.concept)
    return `${question},${options},${q.correct_index},${explanation},${concept}`
  })
  return '\uFEFF' + [header, ...rows].join('\n')
}

// ============================================================================
// Markdown export: summary + notes + highlights
// ============================================================================

export interface SummaryExportData {
  tldr: string
  keyPoints: string[]
  keyTerms: Array<{ term: string; definition: string }>
}

export function summaryAndNotesToMarkdown(
  docTitle: string,
  summary: SummaryExportData | null,
  notes: Note[],
  highlights: Highlight[],
  flashcards?: { front: string; back: string }[],
  quizQuestions?: { question: string; explanation: string }[],
): string {
  const parts: string[] = []

  parts.push(`# ${docTitle}\n`)

  if (summary) {
    parts.push('## Summary\n')
    parts.push(summary.tldr + '\n')

    if (summary.keyPoints.length > 0) {
      parts.push('### Key Points\n')
      summary.keyPoints.forEach((kp) => parts.push(`- ${kp}`))
      parts.push('')
    }

    if (summary.keyTerms.length > 0) {
      parts.push('### Key Terms\n')
      summary.keyTerms.forEach((kt) => parts.push(`- **${kt.term}**: ${kt.definition}`))
      parts.push('')
    }
  }

  if (flashcards && flashcards.length > 0) {
    parts.push('## Flashcards\n')
    flashcards.forEach((f, i) => {
      parts.push(`**${i + 1}. Front:** ${f.front}`)
      parts.push(`   **Back:** ${f.back}`)
      parts.push('')
    })
  }

  if (quizQuestions && quizQuestions.length > 0) {
    parts.push('## Quiz Questions\n')
    quizQuestions.forEach((q, i) => {
      parts.push(`**${i + 1}.** ${q.question}`)
      parts.push(`   *${q.explanation}*`)
      parts.push('')
    })
  }

  if (notes.length > 0) {
    parts.push('## Notes\n')
    notes.forEach((n) => parts.push(`- ${n.body}`))
    parts.push('')
  }

  if (highlights.length > 0) {
    parts.push('## Highlights\n')
    highlights.forEach((h) => {
      parts.push(`> ${h.quote}`)
      if (h.note) parts.push(`> _Note: ${h.note}_`)
      parts.push('')
    })
  }

  return parts.join('\n')
}

// ============================================================================
// Download helper
// ============================================================================

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================================
// CSV escaping
// ============================================================================

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}
