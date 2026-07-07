import { useState } from 'react'
import { fetchFlashcards } from '../lib/api'
import { fetchNotes, fetchHighlights, summarizeDocument } from '../lib/api'
import { flashcardsToAnkiCsv, flashcardsToTxt, summaryAndNotesToMarkdown, downloadFile } from '../lib/export'
import { Button } from './Button'
import { showToast } from './Toast'
import { Download, ChevronDown, FileText, FileSpreadsheet, FileType } from 'lucide-react'

interface Props {
  docId: string
  docTitle: string
}

export function ExportMenu({ docId, docTitle }: Props) {
  const [open, setOpen] = useState(false)

  const handleExportAnki = async () => {
    try {
      const flashcards = await fetchFlashcards(docId)
      if (!flashcards || flashcards.length === 0) {
        showToast('error', 'No flashcards to export. Generate flashcards first.')
        return
      }
      const csv = flashcardsToAnkiCsv(flashcards)
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(csv, `${safeName}_flashcards.csv`, 'text/csv;charset=utf-8')
      showToast('success', 'Flashcards exported as CSV')
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

  const handleExportMarkdown = async () => {
    try {
      const [notes, highlights, summary] = await Promise.all([
        fetchNotes(docId),
        fetchHighlights(docId),
        summarizeDocument(docId, 'detailed').catch(() => null),
      ])
      const md = summaryAndNotesToMarkdown(docTitle, summary, notes, highlights)
      const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
      downloadFile(md, `${safeName}_notes.md`, 'text/markdown;charset=utf-8')
      showToast('success', 'Summary + notes exported as Markdown')
    } catch (err) {
      showToast('error', 'Export failed: ' + (err as Error).message)
    }
    setOpen(false)
  }

  const handlePrint = () => {
    const safeName = docTitle.replace(/[^a-zA-Z0-9]/g, '_')
    window.open(`/print/${docId}`, '_blank')
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
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-caption font-medium text-text-muted uppercase tracking-wider">Flashcards</p>
            <button onClick={handleExportAnki} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors">
              <FileSpreadsheet className="h-4 w-4 text-text-muted" />
              Anki CSV
            </button>
            <button onClick={handleExportTxt} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors">
              <FileText className="h-4 w-4 text-text-muted" />
              Plain Text
            </button>
            <div className="my-1 border-t border-border" />
            <p className="px-3 py-1.5 text-caption font-medium text-text-muted uppercase tracking-wider">Document</p>
            <button onClick={handleExportMarkdown} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors">
              <FileType className="h-4 w-4 text-text-muted" />
              Markdown (Summary + Notes)
            </button>
            <button onClick={handlePrint} className="flex w-full items-center gap-2 px-3 py-2 text-small text-text hover:bg-bg-muted transition-colors">
              <FileText className="h-4 w-4 text-text-muted" />
              Print / PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}
