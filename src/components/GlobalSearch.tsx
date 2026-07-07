import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { globalSearch } from '../lib/api'
import type { GlobalSearchResult } from '../lib/api'
import { Search, FileText, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await globalSearch(q)
        setResults(res)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleSelect = useCallback((docId: string) => {
    onClose()
    navigate({ to: '/doc/$docId', params: { docId } })
  }, [navigate, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-white shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Search className="h-5 w-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all your notes..."
            className="flex-1 text-body text-text placeholder-text-muted outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-caption text-text-muted transition-colors hover:bg-bg-muted"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {error && (
            <p className="px-3 py-4 text-small text-rose-600 text-center">{error}</p>
          )}

          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <p className="px-3 py-8 text-small text-text-muted text-center">
              No results found for "{query.trim()}"
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((doc) => (
                <div key={doc.documentId}>
                  <button
                    onClick={() => handleSelect(doc.documentId)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-muted group"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                    <span className="flex-1 text-label font-medium text-text truncate">
                      {doc.documentTitle}
                    </span>
                    <span className="text-caption text-text-muted shrink-0">
                      {Math.round(doc.maxSimilarity * 100)}% match
                    </span>
                  </button>

                  {/* Top snippet for this doc */}
                  <div className="ml-9 mb-1">
                    {doc.chunks.slice(0, 2).map((chunk) => (
                      <p
                        key={chunk.id}
                        className="px-3 py-1 text-small text-text-muted line-clamp-2 cursor-pointer hover:text-text-secondary"
                        onClick={() => handleSelect(doc.documentId)}
                      >
                        …{chunk.content.slice(0, 120)}…
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {query.trim().length < 2 && (
            <p className="px-3 py-8 text-small text-text-muted text-center">
              Type at least 2 characters to search your notes
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
