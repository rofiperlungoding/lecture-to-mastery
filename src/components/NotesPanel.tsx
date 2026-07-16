import { useState, useEffect, useRef } from 'react'
import { fetchNotes, createNote, updateNote, deleteNote, fetchHighlights, deleteHighlight } from '../lib/api'
import { Button } from './Button'
import { Card } from './Card'
import { showToast } from './Toast'
import type { Note, Highlight } from '../types/db'
import { Plus, Trash2, Pencil, X, Check, Highlighter, Bookmark } from 'lucide-react'

interface Props {
  docId: string
  onHighlightSelect?: (highlight: Highlight) => void
}

export function NotesPanel({ docId }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [newNoteText, setNewNoteText] = useState('')
  const [tab, setTab] = useState<'notes' | 'highlights'>('notes')
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced autosave: saves 800ms after last keystroke for existing notes
  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }

    if (editingId && editText.trim()) {
      autosaveTimerRef.current = setTimeout(async () => {
        try {
          setAutosaveStatus('saving'); await updateNote(editingId, editText.trim())
          setAutosaveStatus('saved')
          setTimeout(() => setAutosaveStatus('idle'), 1500)
        } catch {
          setAutosaveStatus('idle')
        }
      }, 800)
    } else {
      setAutosaveStatus('idle')
    }

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [editText, editingId])
  const load = async () => {
    setLoading(true)
    try {
      const [n, h] = await Promise.all([fetchNotes(docId), fetchHighlights(docId)])
      setNotes(n)
      setHighlights(h)
    } catch (err) {
      showToast('error', 'Failed to load: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [docId])

  const handleCreateNote = async () => {
    const body = newNoteText.trim()
    if (!body) return
    try {
      await createNote(docId, body)
      setNewNoteText('')
      await load()
    } catch (err) {
      showToast('error', (err as Error).message)
    }
  }

  const handleUpdateNote = async (noteId: string) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    const body = editText.trim()
    if (!body) return
    try {
      await updateNote(noteId, body)
      setAutosaveStatus('idle'); setEditingId(null)
      await load()
    } catch (err) {
      showToast('error', (err as Error).message)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId)
      await load()
    } catch (err) {
      showToast('error', (err as Error).message)
    }
  }

  const handleDeleteHighlight = async (highlightId: string) => {
    try {
      await deleteHighlight(highlightId)
      await load()
    } catch (err) {
      showToast('error', (err as Error).message)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface p-1">
        <button
          onClick={() => setTab('notes')}
          role="tab"
          aria-selected={tab === 'notes'}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' + (tab === 'notes' ? 'bg-surface-elevated text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >
          <Bookmark className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          Notes
        </button>
        <button
          onClick={() => setTab('highlights')}
          role="tab"
          aria-selected={tab === 'highlights'}
          className={'flex-1 rounded-md px-4 py-2 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' + (tab === 'highlights' ? 'bg-surface-elevated text-text shadow-sm' : 'text-text-muted hover:text-text-secondary')}
        >
          <Highlighter className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          Highlights
        </button>
      </div>

      {tab === 'notes' && (
        <div className="space-y-4">
          {/* New note input */}
          <div className="flex gap-2">
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Write a note..."
              rows={2}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-small text-text placeholder-text-muted resize-none focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <Button size="sm" onClick={handleCreateNote} disabled={!newNoteText.trim()} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
              Add
            </Button>
          </div>

          {/* Notes list */}
          {loading ? (
            <p className="text-small text-text-muted">Loading...</p>
          ) : notes.length === 0 ? (
            <p className="py-8 text-center text-small text-text-muted">No notes yet. Write your first note above.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <Card key={note.id} padding="sm">
                  {editingId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-border px-3 py-2 text-small text-text resize-none focus:border-brand-500 focus:outline-none"
                      />
                      {/* Autosave status indicator */}
                      {editingId && autosaveStatus !== 'idle' && (
                        <div className="flex items-center justify-end gap-1.5">
                          {autosaveStatus === 'saving' ? (
                            <><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /><span className="text-caption text-text-muted">Saving...</span></>
                          ) : (
                            <><span className="h-3 w-3 rounded-full bg-green-500" /><span className="text-caption text-green-600">Saved</span></>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} leadingIcon={<X className="h-3 w-3" />}>Cancel</Button>
                        <Button size="sm" onClick={() => handleUpdateNote(note.id)} leadingIcon={<Check className="h-3 w-3" />}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-small text-text whitespace-pre-wrap">{note.body}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-caption text-text-muted">{new Date(note.created_at).toLocaleDateString()}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              if (autosaveTimerRef.current) {
                                clearTimeout(autosaveTimerRef.current)
                                autosaveTimerRef.current = null
                              }
                              setEditingId(note.id);
                              setEditText(note.body)
                            }}
                            className="rounded p-1 text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:bg-bg-muted hover:text-text-secondary"
                            aria-label={`Edit note`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="rounded p-1 text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:bg-bg-muted hover:text-rose-600"
                            aria-label={`Delete note`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'highlights' && (
        <div>
          {loading ? (
            <p className="text-small text-text-muted">Loading...</p>
          ) : highlights.length === 0 ? (
            <p className="py-8 text-center text-small text-text-muted">
              No highlights yet. Select text in the summary to create a highlight.
            </p>
          ) : (
            <div className="space-y-2">
              {highlights.map((hl) => (
                <Card key={hl.id} padding="sm" className="border-l-4 border-l-yellow-400">
                  <p className="text-small text-text italic mb-1">&ldquo;{hl.quote}&rdquo;</p>
                  {hl.note && <p className="text-small text-text-muted mb-2">{hl.note}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-text-muted">{new Date(hl.created_at).toLocaleDateString()}</span>
                    <button
                      onClick={() => handleDeleteHighlight(hl.id)}
                      className="rounded p-1 text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:bg-bg-muted hover:text-rose-600"
                      aria-label="Delete highlight"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
