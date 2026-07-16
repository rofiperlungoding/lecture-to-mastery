import { useState, useEffect } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { supabase } from '../lib/supabase'
import { fetchNotes, fetchHighlights, summarizeDocument, fetchQuiz, fetchFlashcards, getConceptMastery } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/Button'
import { Wordmark } from '../components/Wordmark'
import { GraduationCap, CheckSquare, Square, Printer } from 'lucide-react'
import type { Note, Highlight } from '../types/db'

// ── Print style (injected once) ─────────────────────────────────────────

const PRINT_STYLE = `
@page {
  margin: 0.75in;
  size: letter;
}
@media print {
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; background: #fff; }
  .print-container { max-width: 100%; padding: 0; margin: 0; }
  .no-print { display: none !important; }
  .print-only-header { display: block !important; }
  .print-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 1.25rem; }
  .print-page-break { page-break-before: always; break-before: page; }
  h1 { font-size: 20pt; font-weight: 700; color: #1a1a1a; margin-bottom: 0.15in; border-bottom: 2px solid #2563eb; padding-bottom: 0.08in; }
  h2 { font-size: 14pt; font-weight: 600; color: #1f2937; margin-top: 0.35in; margin-bottom: 0.1in; }
  h3 { font-size: 12pt; font-weight: 600; color: #374151; margin-top: 0.2in; margin-bottom: 0.08in; }
  p { margin-bottom: 0.1in; }
  ul { margin-bottom: 0.1in; padding-left: 0.2in; }
  li { margin-bottom: 0.05in; }
  .print-footer { margin-top: 0.5in; padding-top: 0.1in; border-top: 1px solid #d1d5db; font-size: 8pt; color: #6b7280; text-align: center; }
  .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.12in; }
  .card-item { border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.12in; break-inside: avoid; }
  .card-front { font-weight: 600; margin-bottom: 0.05in; }
  .card-back { color: #4b5563; font-size: 10pt; }
  .quiz-item { border: 1px solid #e5e7eb; border-left: 3px solid #2563eb; padding: 0.1in; margin-bottom: 0.1in; break-inside: avoid; }
  .concept-bar { display: flex; align-items: center; gap: 0.08in; margin-bottom: 0.05in; }
  .concept-label { min-width: 1.5in; font-size: 9pt; color: #374151; }
  .concept-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .concept-fill { height: 100%; border-radius: 4px; }
  .note-item { border: 1px solid #e5e7eb; padding: 0.08in; margin-bottom: 0.08in; break-inside: avoid; }
  .summary-callout { background: #eff6ff; border-left: 3px solid #2563eb; padding: 0.12in; margin-bottom: 0.15in; }
  .key-term { display: inline-block; background: #f3f4f6; border-radius: 3px; padding: 0.02in 0.06in; margin: 0.02in; font-size: 10pt; }
  .brand-header { display: flex; align-items: center; gap: 0.1in; margin-bottom: 0.3in; }
  .brand-header .brand-icon { width: 28px; height: 28px; background: #2563eb; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
  .brand-header h1 { border: none; margin: 0; font-size: 16pt; }
}`

// ── Section selector types ───────────────────────────────────────────────

interface SectionToggle {
  id: string
  label: string
  enabled: boolean
}

interface PrintData {
  title: string
  sourceType: string
  sourceMeta: Record<string, unknown> | null
  summary: { tldr: string; keyPoints: string[]; keyTerms: Array<{ term: string; definition: string }> } | null
  flashcards: { front: string; back: string }[]
  quizQuestions: { question: string; options: string[]; correct_index: number; explanation: string; concept: string }[]
  notes: Note[]
  highlights: Highlight[]
  concepts: { concept: string; masteryPct: number }[]
}

function PrintPage() {
  const { docId } = useParams({ from: '/print/$docId' })
  const [data, setData] = useState<PrintData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Section toggles
  const [sections, setSections] = useState<SectionToggle[]>([
    { id: 'summary', label: 'Summary', enabled: true },
    { id: 'key-concepts', label: 'Key Concepts', enabled: true },
    { id: 'key-terms', label: 'Key Terms', enabled: true },
    { id: 'flashcards', label: 'Flashcards', enabled: true },
    { id: 'quiz', label: 'Quiz Questions', enabled: true },
    { id: 'notes', label: 'Notes', enabled: true },
    { id: 'highlights', label: 'Highlights', enabled: true },
  ])

  const toggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    )
  }

  const isEnabled = (id: string) => sections.find((s) => s.id === id)?.enabled ?? true

  useEffect(() => {
    async function load() {
      try {
        const [docResult, notes, highlights, flashcards, quizQuestions, concepts] =
          await Promise.all([
            supabase.from('documents').select('title, source_type, source_meta').eq('id', docId).single(),
            fetchNotes(docId),
            fetchHighlights(docId),
            fetchFlashcards(docId).catch(() => []),
            fetchQuiz(docId).catch(() => []),
            getConceptMastery(docId).catch(() => []),
          ])

        let summaryData = null
        try {
          summaryData = await summarizeDocument(docId, 'detailed')
        } catch { /* optional */ }

        setData({
          title: docResult?.data?.title || 'Document',
          sourceType: docResult?.data?.source_type || '',
          sourceMeta: docResult?.data?.source_meta || null,
          summary: summaryData,
          flashcards,
          quizQuestions,
          notes,
          highlights,
          concepts: concepts.map((c) => ({ concept: c.concept, masteryPct: c.masteryPct })),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [docId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-rose-600">Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const sourceLabel = data.sourceType === 'youtube' ? 'YouTube Video'
    : data.sourceType === 'audio' ? 'Audio Lecture'
    : data.sourceType === 'image' ? 'Image (OCR)'
    : data.sourceType === 'docx' ? 'Word Document'
    : data.sourceType === 'pptx' ? 'PowerPoint'
    : data.sourceType === 'pdf' ? 'PDF'
    : data.sourceType === 'text' ? 'Text'
    : data.sourceType

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{PRINT_STYLE}</style>

      {/* ── Controls (no-print) ─────────────────────────────────────── */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Wordmark size="sm" />
              <span className="text-caption text-text-muted">Study Guide</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => window.print()}
                leadingIcon={<Printer className="h-4 w-4" />}
              >
                Print / Save PDF
              </Button>
            </div>
          </div>

          {/* Section toggles */}
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => toggleSection(section.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                  section.enabled
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface text-text-muted border border-border'
                }`}
              >
                {section.enabled ? (
                  <CheckSquare className="h-3 w-3" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Print Content ──────────────────────────────────────────── */}
      <div className="print-container mx-auto max-w-4xl bg-white p-8 shadow-sm print:shadow-none">
        {/* Brand header */}
        <div className="brand-header flex items-center gap-3 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-pageTitle text-text m-0">{data.title}</h1>
            <p className="text-small text-text-muted mt-0.5">
              {sourceLabel} &middot; Generated {now}
            </p>
          </div>
        </div>

        {/* ── 1. Summary ────────────────────────────────────────────── */}
        {isEnabled('summary') && data.summary && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Summary</h2>
            <div className="summary-callout rounded-lg bg-brand-50 border-l-4 border-brand-500 p-4">
              <p className="text-body text-text-secondary leading-relaxed whitespace-pre-wrap">
                {data.summary.tldr}
              </p>
            </div>
          </div>
        )}

        {/* ── 2. Key Points / Key Concepts ──────────────────────────── */}
        {isEnabled('key-concepts') && data.summary && data.summary.keyPoints.length > 0 && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Key Points</h2>
            <ul className="space-y-2">
              {data.summary.keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-body text-text-secondary">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── 3. Key Terms ──────────────────────────────────────────── */}
        {isEnabled('key-terms') && data.summary && data.summary.keyTerms.length > 0 && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Key Terms</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.summary.keyTerms.map((kt, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <p className="text-label font-semibold text-brand-700">{kt.term}</p>
                  <p className="text-small text-text-secondary mt-0.5">{kt.definition}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Flashcards ─────────────────────────────────────────── */}
        {isEnabled('flashcards') && data.flashcards.length > 0 && (
          <div className={`print-section ${data.flashcards.length > 20 ? 'print-page-break' : ''}`}>
            <h2 className="text-title-2 text-text">
              Flashcards ({data.flashcards.length})
            </h2>
            <div className="card-grid">
              {data.flashcards.map((fc, i) => (
                <div key={i} className="card-item border border-border rounded-lg p-3">
                  <p className="card-front text-label font-medium text-text">{fc.front}</p>
                  <p className="card-back text-small text-text-secondary mt-1">{fc.back}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Quiz Questions ─────────────────────────────────────── */}
        {isEnabled('quiz') && data.quizQuestions.length > 0 && (
          <div className={`print-section ${data.quizQuestions.length > 10 ? 'print-page-break' : ''}`}>
            <h2 className="text-title-2 text-text">
              Quiz Questions ({data.quizQuestions.length})
            </h2>
            <div className="space-y-4">
              {data.quizQuestions.map((q, i) => {
                const optionLabels = ['A', 'B', 'C', 'D']
                return (
                  <div key={i} className="quiz-item border border-border border-l-4 border-l-brand-500 rounded-lg p-4">
                    <p className="text-label font-medium text-text mb-2">
                      {i + 1}. {q.question}
                    </p>
                    <div className="space-y-1 ml-4">
                      {q.options.map((opt, j) => (
                        <p key={j} className={`text-small ${j === q.correct_index ? 'font-semibold text-emerald-700' : 'text-text-secondary'}`}>
                          {optionLabels[j]}. {opt} {j === q.correct_index && '✓'}
                        </p>
                      ))}
                    </div>
                    <p className="text-small text-text-muted mt-2 italic">
                      {q.explanation}
                    </p>
                    <p className="text-caption text-text-muted mt-1">Concept: {q.concept}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 6. Concept Mastery ────────────────────────────────────── */}
        {isEnabled('key-concepts') && data.concepts.length > 0 && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Concept Mastery</h2>
            {data.concepts.map((c, i) => {
              const color =
                c.masteryPct >= 80 ? '#22c55e'
                : c.masteryPct >= 50 ? '#f59e0b'
                : '#ef4444'
              return (
                <div key={i} className="concept-bar flex items-center gap-3 mb-2">
                  <span className="text-small text-text-secondary w-32 truncate">{c.concept}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(c.masteryPct, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-caption text-text-muted tabular-nums w-8 text-right">
                    {c.masteryPct}%
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 7. Notes ──────────────────────────────────────────────── */}
        {isEnabled('notes') && data.notes.length > 0 && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Notes ({data.notes.length})</h2>
            <div className="space-y-2">
              {data.notes.map((note) => (
                <div key={note.id} className="note-item border border-border rounded-lg p-3">
                  <p className="text-body text-text-secondary">{note.body}</p>
                  <p className="text-caption text-text-muted mt-1">
                    {new Date(note.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 8. Highlights ─────────────────────────────────────────── */}
        {isEnabled('highlights') && data.highlights.length > 0 && (
          <div className="print-section">
            <h2 className="text-title-2 text-text">Highlights ({data.highlights.length})</h2>
            <div className="space-y-2">
              {data.highlights.map((h) => (
                <div key={h.id} className="border-l-3 border-amber-400 pl-4 py-1">
                  <p className="text-body text-text-secondary italic">&ldquo;{h.quote}&rdquo;</p>
                  {h.note && (
                    <p className="text-small text-text-muted mt-1">Note: {h.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="print-footer mt-12 pt-4 border-t border-border text-center">
          <p className="text-caption text-text-muted">
            Generated by Lecture-to-Mastery &middot; {now}
          </p>
          <p className="text-caption text-text-muted mt-0.5">
            {data.flashcards.length} flashcards &middot; {data.quizQuestions.length} quiz questions &middot; {data.notes.length} notes
          </p>
        </div>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/print/$docId',
  component: PrintPage,
})
