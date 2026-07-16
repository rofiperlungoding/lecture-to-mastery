import { useState, useEffect } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { supabase } from '../lib/supabase'
import { fetchNotes, summarizeDocument, fetchFlashcards, fetchQuiz } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { Button } from '../components/Button'
import { Wordmark } from '../components/Wordmark'
import { GraduationCap, Printer, CheckSquare, Square } from 'lucide-react'
import type { Note } from '../types/db'

const PRINT_STYLE = `
@page { margin: 0.75in; size: letter; }
@media print {
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; background: #fff; }
  .print-container { max-width: 100%; padding: 0; margin: 0; }
  .no-print { display: none !important; }
  .print-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 1.25rem; }
  .print-page-break { page-break-before: always; break-before: page; }
  h1 { font-size: 20pt; font-weight: 700; color: #1a1a1a; margin-bottom: 0.15in; border-bottom: 2px solid #2563eb; padding-bottom: 0.08in; }
  h2 { font-size: 14pt; font-weight: 600; color: #1f2937; margin-top: 0.3in; }
  h3 { font-size: 12pt; font-weight: 600; color: #374151; margin-top: 0.2in; }
  .print-footer { margin-top: 0.5in; padding-top: 0.1in; border-top: 1px solid #d1d5db; font-size: 8pt; color: #6b7280; text-align: center; }
  .doc-section { border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.15in; margin-bottom: 0.15in; break-inside: avoid; page-break-inside: avoid; }
  .doc-title { font-size: 13pt; font-weight: 600; color: #2563eb; margin-bottom: 0.08in; }
  .card-item { border: 1px solid #e5e7eb; padding: 0.08in; margin-bottom: 0.06in; break-inside: avoid; }
  .brand-header { display: flex; align-items: center; gap: 0.1in; margin-bottom: 0.3in; }
}`

interface CoursePrintData {
  title: string
  description: string
  documents: Array<{
    id: string
    title: string
    sourceType: string
    summary: string | null
    flashcards: { front: string; back: string }[]
    quizQuestions: { question: string; explanation: string }[]
    notes: Note[]
  }>
}

function CoursePrintPage() {
  const { courseId } = useParams({ from: '/print/course/$courseId' })
  const [data, setData] = useState<CoursePrintData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeFlashcards, setIncludeFlashcards] = useState(true)
  const [includeQuiz, setIncludeQuiz] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch course
        const { data: course } = await supabase
          .from('courses')
          .select('title, description')
          .eq('id', courseId)
          .single()

        if (!course) {
          setError('Course not found')
          setLoading(false)
          return
        }

        // Fetch member documents
        const { data: members } = await supabase
          .from('course_documents')
          .select('document_id')
          .eq('course_id', courseId)

        const docIds = (members ?? []).map((m: any) => m.document_id)

        // Fetch document titles
        const { data: docs } = await supabase
          .from('documents')
          .select('id, title, source_type')
          .in('id', docIds)

        const documents = await Promise.all(
          (docs ?? []).map(async (doc: any) => {
            const [flashcards, quizQuestions, notes] = await Promise.all([
              fetchFlashcards(doc.id).catch(() => []),
              fetchQuiz(doc.id).catch(() => []),
              fetchNotes(doc.id),
            ])

            let summary = null
            try {
              const s = await summarizeDocument(doc.id, 'detailed')
              summary = s.tldr
            } catch { /* optional */ }

            return {
              id: doc.id,
              title: doc.title,
              sourceType: doc.source_type,
              summary,
              flashcards: flashcards.map((f: any) => ({ front: f.front, back: f.back })),
              quizQuestions: quizQuestions.map((q: any) => ({
                question: q.question,
                explanation: q.explanation,
              })),
              notes,
            }
          }),
        )

        setData({
          title: course.title,
          description: course.description,
          documents,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load course data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-rose-600">Error: {error || 'Course not found'}</p>
      </div>
    )
  }

  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const totalFlashcards = data.documents.reduce((sum, d) => sum + d.flashcards.length, 0)
  const totalQuiz = data.documents.reduce((sum, d) => sum + d.quizQuestions.length, 0)
  const totalNotes = data.documents.reduce((sum, d) => sum + d.notes.length, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{PRINT_STYLE}</style>

      <div className="no-print sticky top-0 z-10 border-b border-border bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Wordmark size="sm" />
              <span className="text-caption text-text-muted">Course Study Guide</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
              leadingIcon={<Printer className="h-4 w-4" />}
            >
              Print / Save PDF
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'flashcards', label: 'Flashcards', val: includeFlashcards, set: setIncludeFlashcards },
              { id: 'quiz', label: 'Quiz', val: includeQuiz, set: setIncludeQuiz },
              { id: 'notes', label: 'Notes', val: includeNotes, set: setIncludeNotes },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => s.set(!s.val)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                  s.val ? 'bg-brand-500 text-white' : 'bg-surface text-text-muted border border-border'
                }`}
              >
                {s.val ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="print-container mx-auto max-w-5xl bg-white p-8 shadow-sm print:shadow-none">
        <div className="brand-header flex items-center gap-3 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-pageTitle text-text m-0">{data.title}</h1>
            <p className="text-small text-text-muted mt-0.5">
              {data.documents.length} document{data.documents.length !== 1 ? 's' : ''} &middot; Generated {now}
            </p>
            {data.description && <p className="text-small text-text-muted">{data.description}</p>}
          </div>
        </div>

        {/* Per-document sections */}
        {data.documents.map((doc, docIdx) => (
          <div key={doc.id} className={`doc-section border border-border rounded-lg p-4 mb-4 ${docIdx > 0 ? 'print-page-break' : ''}`}>
            <h2 className="doc-title text-title-2 text-brand-600 mb-2">
              {doc.title}
              <span className="text-caption text-text-muted ml-2 font-normal">({doc.sourceType})</span>
            </h2>

            {doc.summary && (
              <p className="text-body text-text-secondary whitespace-pre-wrap mb-3">{doc.summary}</p>
            )}

            {includeFlashcards && doc.flashcards.length > 0 && (
              <div className="mb-3">
                <h3 className="text-title-3 text-text mb-2">Flashcards ({doc.flashcards.length})</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {doc.flashcards.map((fc, i) => (
                    <div key={i} className="card-item border border-border rounded p-2">
                      <p className="text-label font-medium text-text">{fc.front}</p>
                      <p className="text-small text-text-secondary">{fc.back}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {includeQuiz && doc.quizQuestions.length > 0 && (
              <div className="mb-3">
                <h3 className="text-title-3 text-text mb-2">Quiz ({doc.quizQuestions.length})</h3>
                <div className="space-y-2">
                  {doc.quizQuestions.map((q, i) => (
                    <div key={i} className="border-l-3 border-l-brand-500 pl-3 py-1">
                      <p className="text-label text-text">{i + 1}. {q.question}</p>
                      <p className="text-small text-text-muted italic">{q.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {includeNotes && doc.notes.length > 0 && (
              <div>
                <h3 className="text-title-3 text-text mb-2">Notes ({doc.notes.length})</h3>
                {doc.notes.map((n) => (
                  <p key={n.id} className="text-small text-text-secondary mb-1">&bull; {n.body}</p>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Footer */}
        <div className="print-footer mt-8 pt-4 border-t border-border text-center">
          <p className="text-caption text-text-muted">
            Generated by Lecture-to-Mastery &middot; {now}
          </p>
          <p className="text-caption text-text-muted mt-0.5">
            {data.documents.length} documents &middot; {totalFlashcards} flashcards &middot; {totalQuiz} quiz questions &middot; {totalNotes} notes
          </p>
        </div>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/print/course/$courseId',
  component: CoursePrintPage,
})
