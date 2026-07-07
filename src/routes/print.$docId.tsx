import { useState, useEffect } from 'react'
import { createRoute, useParams } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { supabase } from '../lib/supabase'
import { fetchNotes, summarizeDocument } from '../lib/api'
import { Spinner } from '../components/Spinner'
import type { Note } from '../types/db'

interface PrintData {
  title: string
  summary?: string
  notes: Note[]
}

function PrintPage() {
  const { docId } = useParams({ from: '/print/$docId' })
  const [data, setData] = useState<PrintData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: doc } = await supabase
          .from('documents')
          .select('title')
          .eq('id', docId)
          .single()

        let summaryData
        try {
          summaryData = await summarizeDocument(docId, 'detailed')
        } catch {
          // Summarization is optional — don't block the page if it fails
        }

        const notes = await fetchNotes(docId)

        setData({
          title: doc?.title || 'Document',
          summary: summaryData?.detailed || summaryData?.tldr,
          notes,
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
      <div className="flex items-center justify-center min-h-screen text-red-600">
        <p>Error: {error}</p>
      </div>
    )
  }

  if (!data) return null

  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="print-container max-w-4xl mx-auto p-8">
      <style>{`
        @media print {
          @page { margin: 1in; }
          body { font-size: 12pt; line-height: 1.5; color: #000; }
          .print-container { max-width: 100%; padding: 0; margin: 0; }
          .no-print { display: none !important; }
          h1 { font-size: 18pt; margin-bottom: 0.5in; }
          h2 { font-size: 14pt; margin-top: 0.3in; }
          p { margin-bottom: 0.15in; }
          ul { margin-bottom: 0.15in; }
          .note-item { border: 1px solid #ccc; padding: 0.1in; margin-bottom: 0.1in; break-inside: avoid; }
          .print-footer { margin-top: 0.5in; font-size: 9pt; color: #666; }
          .note-label { font-weight: bold; margin-top: 0.3in; }
        }
      `}</style>

      <div className="no-print mb-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Print / Save PDF
        </button>
      </div>

      <h1>{data.title}</h1>
      <p className="text-sm text-gray-500">Generated on {now}</p>

      {data.summary && (
        <>
          <h2>Summary</h2>
          <div className="summary-content whitespace-pre-wrap">
            {data.summary}
          </div>
        </>
      )}

      <h2 className="note-label">Personal Notes ({data.notes.length})</h2>
      {data.notes.length === 0 ? (
        <p className="text-gray-500 italic">No personal notes.</p>
      ) : (
        data.notes.map((note) => (
          <div key={note.id} className="note-item">
            <p>{note.body}</p>
            <p className="text-xs text-gray-400">
              {new Date(note.created_at).toLocaleDateString()}
            </p>
          </div>
        ))
      )}

      <div className="print-footer">
        <p>Exported from Lecture to Mastery</p>
      </div>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/print/$docId',
  component: PrintPage,
})
