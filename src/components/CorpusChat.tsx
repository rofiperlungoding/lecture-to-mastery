import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { corpusRagQuery } from '../lib/api'
import type { CorpusSource } from '../lib/api'
import { Button } from './Button'
import { Spinner } from './Spinner'
import { EmptyState } from './EmptyState'
import { Send, ExternalLink } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: CorpusSource[]
}

export function CorpusChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastQuestionRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuery = async (question: string) => {
    setError(null)
    setLoading(true)
    try {
      const result = await corpusRagQuery(question)
      const assistantMsg: Message = {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    lastQuestionRef.current = question
    const userMsg: Message = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    await sendQuery(question)
  }

  const handleRetry = async () => {
    const question = lastQuestionRef.current
    if (!question || loading) return
    await sendQuery(question)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const openDoc = (docId: string) => {
    navigate({ to: '/doc/$docId', params: { docId } })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-[720px] flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              illustration="chat"
              title="Ask all your notes"
              description="Ask questions across all your documents and get answers grounded in your entire corpus."
            />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-full rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-text-inverse'
                  : 'border border-border bg-surface text-text'
              }`}
            >
              <p className="whitespace-pre-wrap text-body leading-relaxed">{msg.content}</p>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="mb-1.5 text-caption font-medium text-text-muted">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.sources.map((src, j) => (
                      <button
                        key={j}
                        onClick={() => openDoc(src.documentId)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-caption text-text-muted transition-colors hover:border-brand-300 hover:text-brand-700 text-left"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-text-secondary truncate max-w-[120px]">{src.documentTitle}</span>
                        <span className="shrink-0">[{src.chunkIndex}]</span>
                        <span className="truncate max-w-[200px]">{src.snippet}…</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3">
              <Spinner size="sm" />
              <span className="text-body text-text-secondary">Thinking across all notes...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
            <div className="flex items-start justify-between gap-3">
              <span>{error}</span>
              <button
                onClick={handleRetry}
                className="shrink-0 rounded-md bg-rose-100 px-3 py-1 text-label font-medium text-rose-700 transition-colors hover:bg-rose-200"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-6 py-4">
        <div className="mx-auto flex max-w-[720px] gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question across all your notes..."
            disabled={loading}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-body text-text placeholder-text-muted transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="md" leadingIcon={<Send className="h-4 w-4" />}>
            Ask
          </Button>
        </div>
      </div>
    </div>
  )
}
