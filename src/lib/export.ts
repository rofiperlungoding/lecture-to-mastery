import type { FlashcardItem } from './api'
import type { Note, Highlight } from '../types/db'

// Anki-importable CSV: front,back
// Anki expects UTF-8 CSV with BOM for unicode support
export function flashcardsToAnkiCsv(flashcards: FlashcardItem[]): string {
  const header = 'front,back'
  const rows = flashcards.map((f) => {
    const front = escapeCsv(f.front || f.question || '')
    const back = escapeCsv(f.back || f.answer || '')
    return `${front},${back}`
  })
  // BOM for UTF-8, then header + rows
  return '\uFEFF' + [header, ...rows].join('\n')
}

// Plain text format: one card per paragraph
export function flashcardsToTxt(flashcards: FlashcardItem[]): string {
  return flashcards
    .map((f) => `${f.front || f.question || ''}\n${f.back || f.answer || ''}\n---`)
    .join('\n\n')
}

// Markdown export: summary + notes
export function summaryAndNotesToMarkdown(
  docTitle: string,
  summary: { tldr: string; keyPoints: string[]; keyTerms: Array<{ term: string; definition: string }> } | null,
  notes: Note[],
  highlights: Highlight[],
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

// Download helper
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

function escapeCsv(value: string): string {
  // Escape double quotes by doubling them, wrap in quotes if contains comma, newline, or quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}
