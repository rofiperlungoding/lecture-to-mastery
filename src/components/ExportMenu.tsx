import { useState } from 'react'
import { fetchFlashcards, fetchQuiz } from '../lib/api'
import { fetchNotes, fetchHighlights, summarizeDocument } from '../lib/api'
import { flashcardsToAnkiCsv, flashcardsToTxt, quizToCsv, summaryAndNotesToMarkdown, downloadFile } from '../lib/export'
import { Button } from './Button'
import { showToast } from './Toast'
import { Download, ChevronDown, FileText, FileSpreadsheet, Printer, GraduationCap, Layers } from 'lucide-react'

interface Props {
  docId: string
  docTitle: string
  courseId?: string
}

export function ExportMenu({ docId, docTitle, courseId }: Props) {
  const [open, setOpen] = useState(false)

  const handleExportAnki = async () => {
    try {
      const flashcards = await fetchFlashcards(docId)
      if (!flashcards || flashcards.length === 0) {
        showToast('error', 'No flashcards to export. Generate flashcards first.')
        return
      }
      const csv = flashcardsToAnkiCsv(flashcards, { includeSm2: true })
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(csv, `${safeName}_flashcards.csv`, 'text/csv;charset=utf-8')
      showToast('success', 'Flashcards exported as Anki CSV (with SM-2 scheduling)')
    } catch (err) {
      showToast('error', 'Export failed: ' + (err as Error).message)
    }
    setOpen(false)
  }

  const handleExportTxt = async () => {
    try {
      const flashcards = await fetchFlashcards(docId)
      if (!flashcards || flashcards.length === 0) {
        showToast('error', 'No flashcards to export')
        return
      }
      const txt = flashcardsToTxt(flashcards)
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(txt, `${safeName}_flashcards.txt`, 'text/plain;charset=utf-8')
      showToast('success', 'Flashcards exported as TXT')
    } catch (err) {
      showToast('error', 'Export failed: ' + (err as Error).message)
    }
    setOpen(false)
  }

  const handleExportQuizCsv = async () => {
    try {
      const questions = await fetchQuiz(docId)
      if (!questions || questions.length === 0) {
        showToast('error', 'No quiz questions to export. Generate a quiz first.')
        return
      }
      const csv = quizToCsv(questions)
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(csv, `${safeName}_quiz.csv`, 'text/csv;charset=utf-8')
      showToast('success', 'Quiz questions exported as CSV')
    } catch (err) {
      showToast('error', 'Export failed: ' + (err as Error).message)
    }
    setOpen(false)
  }

  const handleExportMarkdown = async () => {
    try {
      const [notes, highlights, summary, flashcards, quizQuestions] = await Promise.all([
        fetchNotes(docId),
        fetchHighlights(docId),
        summarizeDocument(docId, 'detailed').catch(() => null),
        fetchFlashcards(docId).catch(() => []),
        fetchQuiz(docId).catch(() => []),
      ])
      const md = summaryAndNotesToMarkdown(docTitle, summary, notes, highlights, flashcards, quizQuestions)
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(md, `${safeName}_study_guide.md`, 'text/markdown;charset=utf-8')
      showToast('success', 'Study guide exported as Markdown')
    } catch (err) {
      showToast('error', 'Export failed: ' + (err as Error).message)
    }
    setOpen(false)
  }

  const handlePrint = () => {
    window.open(`/print/${docId}`, '_blank')
    setOpen(false)
  }

  const handleCoursePrint = () => {
    if (courseId) {
      window.open(`/print/course/${courseId}`, '_blank')
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(!open)}
        leadingIcon={<Download className="h-4 w-4" />}
        trailingIcon={<ChevronDown className="h-3 w-3" />}
      >
        Export
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface-elevated py-1 shadow-lg">
            <p className="px-3 py-1.5 text-caption font-medium text-text-muted uppercase tracking-wider">Flashcards</p>
            <button onClick={handleExportAnki} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Export flashcards as Anki CSV">
              <FileSpreadsheet className="h-4 w-4 text-text-muted" aria-hidden="true" />
              Anki CSV (with SM-2)
            </button>
            <button onClick={handleExportTxt} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Export flashcards as plain text">
              <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
              Plain Text
            </button>
            <div className="my-1 border-t border-border" role="separator" />
            <p className="px-3 py-1.5 text-caption font-medium text-text-muted uppercase tracking-wider">Document</p>
            <button onClick={handleExportQuizCsv} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Export quiz questions as CSV">
              <FileSpreadsheet className="h-4 w-4 text-text-muted" aria-hidden="true" />
              Quiz CSV
            </button>
            <button onClick={handleExportMarkdown} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Export study guide as Markdown">
              <GraduationCap className="h-4 w-4 text-text-muted" aria-hidden="true" />
              Study Guide (MD)
            </button>
            <button onClick={handlePrint} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Print document or save as PDF">
              <Printer className="h-4 w-4 text-text-muted" aria-hidden="true" />
              Print / PDF
            </button>
            {courseId && (
              <>
                <div className="my-1 border-t border-border" role="separator" />
                <p className="px-3 py-1.5 text-caption font-medium text-text-muted uppercase tracking-wider">Course</p>
                <button onClick={handleCoursePrint} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Print course study guide">
                  <Layers className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  Course Study Guide
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
