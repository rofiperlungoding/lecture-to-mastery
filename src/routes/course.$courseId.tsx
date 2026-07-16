import { useState, useEffect, useCallback, useRef } from 'react'
import { createRoute, Link, useParams, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAppStore } from '../stores/useAppStore'
import { fetchCourseDetail, courseRagQuery, deleteCourse, removeDocumentFromCourse, addDocumentToCourse, generateCoursePractice, type CourseSource } from '../lib/api'
import { showToast } from '../components/Toast'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { PageContainer } from '../components/PageContainer'
import { Dialog } from '../components/Dialog'
import { ChevronLeft, BookOpen, Send, Bookmark, Trash2, X, Sparkles, Plus, Target, Zap, Printer } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: CourseSource[]
}

function CourseDetailPage() {
  const { courseId } = useParams({ from: '/course/$courseId' })
  const navigate = useNavigate()
  const documents = useAppStore((s) => s.documents)

  const [course, setCourse] = useState<Awaited<ReturnType<typeof fetchCourseDetail>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [removingDoc, setRemovingDoc] = useState<string | null>(null)
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [generatingPractice, setGeneratingPractice] = useState<'quiz' | 'flashcards' | null>(null)

  // Docs NOT already in this course
  const availableDocs = course
    ? documents.filter((d) => !course.documents.some((cd) => cd.id === d.id))
    : []

  const handleAddDoc = async (docId: string) => {
    try {
      await addDocumentToCourse(courseId, docId)
      showToast('success', 'Document added to course')
      setShowAddDoc(false)
      loadCourse()
    } catch (err) {
      showToast('error', `Failed: ${(err as Error).message}`)
    }
  }

  const handlePractice = async (mode: 'quiz' | 'flashcards') => {
    setGeneratingPractice(mode)
    try {
      await generateCoursePractice(courseId, mode)
      showToast('success', `${mode === 'quiz' ? 'Quiz' : 'Flashcards'} generated across the course!`)
    } catch (err) {
      showToast('error', `Failed: ${(err as Error).message}`)
    } finally {
      setGeneratingPractice(null)
    }
  }

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadCourse = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const detail = await fetchCourseDetail(courseId)
      setCourse(detail)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    loadCourse()
  }, [loadCourse])

  const handleDelete = async () => {
    if (!confirm('Delete this course? Documents will not be affected.')) return
    setDeleting(true)
    try {
      await deleteCourse(courseId)
      showToast('success', 'Course deleted')
      navigate({ to: '/' })
    } catch (err) {
      showToast('error', `Failed to delete: ${(err as Error).message}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleRemoveDoc = async (docId: string) => {
    setRemovingDoc(docId)
    try {
      await removeDocumentFromCourse(courseId, docId)
      showToast('success', 'Document removed from course')
      loadCourse()
    } catch (err) {
      showToast('error', `Failed to remove: ${(err as Error).message}`)
    } finally {
      setRemovingDoc(null)
    }
  }

  const handleSend = async () => {
    const question = input.trim()
    if (!question || chatLoading) return

    setInput('')
    setChatError(null)
    const userMsg: ChatMessage = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setChatLoading(true)

    try {
      const result = await courseRagQuery(courseId, question)
      setMessages((prev) => [...prev, { role: 'assistant', content: result.answer, sources: result.sources }])
    } catch (err) {
      setChatError((err as Error).message)
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center gap-3 py-12">
          <Spinner size="md" />
          <span className="text-body text-text-secondary">Loading course...</span>
        </div>
      </PageContainer>
    )
  }

  if (error || !course) {
    return (
      <PageContainer>
        <EmptyState
          illustration="sparkle"
          title="Course not found"
          description={error || 'This course may have been deleted.'}
          action={
            <Link to="/">
              <Button variant="secondary">Back to Library</Button>
            </Link>
          }
        />
      </PageContainer>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="chrome border-b border-border-hairline page-padding shrink-0">
        <div className="mx-auto flex max-w-content items-center justify-between py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary transition-colors"
              aria-label="Back to library"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-title-2 text-text truncate">{course.title}</h1>
              {course.description && <p className="text-small text-text-tertiary truncate">{course.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">                <Button variant="secondary" size="sm" onClick={() => setShowAddDoc(true)} leadingIcon={<Plus className="h-4 w-4" />}>
              Add Doc
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.open(`/print/course/${courseId}`, '_blank')} leadingIcon={<Printer className="h-4 w-4" />}>
              Print
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} isLoading={deleting} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <PageContainer className="py-6 space-y-6">
          {/* Stats row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-footnote text-text-secondary">Course Mastery</p>
                <p className="text-title-2 tabular-nums text-text">{course.aggregate_mastery !== null ? `${course.aggregate_mastery}%` : '—'}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                <Bookmark className="h-5 w-5" />
              </div>
              <div>
                <p className="text-footnote text-text-secondary">Due Cards</p>
                <p className="text-title-2 tabular-nums text-text">{course.total_due_cards}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-footnote text-text-secondary">Documents</p>
                <p className="text-title-2 tabular-nums text-text">{course.documents.length}</p>
              </div>
            </Card>
          </div>

          {/* Practice buttons */}
          {course.documents.length > 0 && (
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePractice('quiz')}
                isLoading={generatingPractice === 'quiz'}
                disabled={generatingPractice !== null}
                leadingIcon={<Target className="h-4 w-4" />}
              >
                {generatingPractice === 'quiz' ? 'Generating...' : 'Generate Quiz'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePractice('flashcards')}
                isLoading={generatingPractice === 'flashcards'}
                disabled={generatingPractice !== null}
                leadingIcon={<Zap className="h-4 w-4" />}
              >
                {generatingPractice === 'flashcards' ? 'Generating...' : 'Generate Flashcards'}
              </Button>
            </div>
          )}

          {/* Member documents */}
          <div>
            <h2 className="text-title-3 text-text mb-4">Documents</h2>
            {course.documents.length === 0 ? (
              <EmptyState compact illustration="documents" title="No documents yet" description="Click 'Add Doc' above to add documents from your library." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {course.documents.map((doc) => (
                  <Link key={doc.id} to="/doc/$docId" params={{ docId: doc.id }}>
                    <Card hoverable className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <h4 className="text-subhead text-text font-medium line-clamp-2 flex-1">{doc.title}</h4>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleRemoveDoc(doc.id)
                          }}
                          disabled={removingDoc === doc.id}
                          className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary transition-colors"
                          aria-label={`Remove ${doc.title} from course`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{doc.source_type}</Badge>
                        {doc.mastery !== null && (
                          <span className={`text-footnote tabular-nums ${doc.mastery >= 80 ? 'text-mastery-high' : doc.mastery >= 50 ? 'text-mastery-mid' : 'text-mastery-low'}`}>
                            {doc.mastery}%
                          </span>
                        )}
                        {doc.due_count > 0 && <Badge variant="warning">{doc.due_count} due</Badge>}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Course chat */}
          <div>
            <h2 className="text-title-3 text-text mb-4">Ask about this course</h2>
            <Card className="min-h-[200px] flex flex-col">
              <div className="flex-1 space-y-4 p-4 max-h-[400px] overflow-y-auto">
                {messages.length === 0 && !chatLoading && (
                  <p className="text-body text-text-muted text-center py-8">Ask a question that spans all documents in this course.</p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-brand-500 text-white' : 'border border-border bg-surface text-text'}`}>
                      <p className="whitespace-pre-wrap text-body leading-relaxed">{msg.content}</p>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="text-caption font-medium text-text-muted mb-1">Sources</p>
                          {msg.sources.map((src, j) => (
                            <span key={j} className="inline-flex items-center gap-1 rounded bg-bg-subtle px-2 py-0.5 text-caption text-text-muted mr-1 mb-1">
                              <span className="font-medium text-text-secondary">[{src.documentTitle}]</span>
                              {src.snippet}…
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
                      <Spinner size="sm" />
                      <span className="text-body text-text-secondary">Thinking...</span>
                    </div>
                  </div>
                )}
                {chatError && (
                  <div className="flex items-start justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">
                    <span>{chatError}</span>
                    <button onClick={() => setChatError(null)} className="text-rose-800 underline">Dismiss</button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="border-t border-border px-4 py-3">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Ask about all documents in this course..."
                    disabled={chatLoading}
                    className="flex-1 rounded-xl border border-border px-4 py-2.5 text-body text-text placeholder-text-muted transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
                  />
                  <Button onClick={handleSend} disabled={chatLoading || !input.trim()} size="md" leadingIcon={<Send className="h-4 w-4" />}>
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </PageContainer>
      </div>

      {/* Add Document Dialog */}
      <Dialog open={showAddDoc} onClose={() => setShowAddDoc(false)} title="Add Document to Course" size="sm">
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {availableDocs.length === 0 ? (
            <p className="text-body text-text-muted py-4 text-center">All your documents are already in this course.</p>
          ) : (
            availableDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleAddDoc(doc.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-500">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-label text-text font-medium truncate">{doc.title}</p>
                  <p className="text-caption text-text-muted">{doc.source_type}</p>
                </div>
                <Plus className="h-4 w-4 text-text-tertiary shrink-0" />
              </button>
            ))
          )}
        </div>
      </Dialog>
    </div>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/course/$courseId',
  component: CourseDetailPage,
})
