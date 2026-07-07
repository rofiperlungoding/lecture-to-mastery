import { useState } from 'react'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { useAuthStore } from '../stores/useAuthStore'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { Card } from '../components/Card'
import { ArrowDownToLine, Trash2, Shield, AlertTriangle, LogOut, BarChart3, User } from 'lucide-react'
import { PageContainer } from '../components/PageContainer'

function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut, loading } = useAuthStore()
  const isAnonymous = user?.is_anonymous ?? false
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Guest'

  const email = user?.email || ''
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.href = '/login'
    } catch {
      showToast('error', 'Failed to sign out')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const [documents, chunks, flashcards, quizQuestions] = await Promise.all([
        supabase.from('documents').select('*'),
        supabase.from('chunks').select('id, document_id, content, chunk_index'),
        supabase.from('flashcards').select('id, document_id, front, back'),
        supabase.from('quiz_questions').select('id, document_id, question, options, correct_index, explanation'),
      ])

      const payload = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user?.id,
          email: user?.email,
          isAnonymous,
        },
        documents: documents.data ?? [],
        chunks: chunks.data ?? [],
        flashcards: flashcards.data ?? [],
        quizQuestions: quizQuestions.data ?? [],
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lecture-to-mastery-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('success', 'Data exported successfully')
    } catch (err) {
      showToast('error', `Export failed: ${(err as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', {})
      if (error) throw new Error(error.message)
      await signOut()
      showToast('success', 'Account and all data deleted')
      window.location.href = '/login'
    } catch (err) {
      showToast('error', `Deletion failed: ${(err as Error).message}`)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <PageContainer className="py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-pageTitle text-text mb-8">Settings</h1>

        {/* Profile Section */}
        <Card className="!p-6 mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <User className="h-5 w-5 text-brand-500" />
            </div>
            <h2 className="text-h3 text-text">Profile</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-label font-bold text-brand-700">
              {initials || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold text-text">{displayName}</p>
              {email && <p className="text-small text-text-muted">{email}</p>}
              {isAnonymous && <p className="text-small text-text-muted">Guest account</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={handleSignOut} isLoading={loading} leadingIcon={<LogOut className="h-4 w-4" />}>
              Sign out
            </Button>
            <Link to="/progress" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-small font-medium text-text-secondary hover:bg-bg-muted transition-colors duration-150">
              <BarChart3 className="h-4 w-4" />
              View progress
            </Link>
          </div>
        </Card>

        {/* Privacy & Data Section */}
        <div className="space-y-6">
          {/* What we store */}
          <Card className="!p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                <Shield className="h-5 w-5 text-brand-500" />
              </div>
              <h2 className="text-h3 text-text">Privacy & Data</h2>
            </div>
            <div className="space-y-4 text-body text-text-secondary leading-relaxed">
              <p>
                <strong className="text-text">What we store:</strong> Your documents, their
                text content, AI-generated summaries, flashcards, and quiz questions. We store
                only what is needed to power your study experience.
              </p>
              <p>
                <strong className="text-text">Privacy by design:</strong> Every document and
                study item is private to your account. No other user can view your materials.
                All data is scoped by Row-Level Security at the database level.
              </p>
              <p>
                <strong className="text-text">AI processing:</strong> When you upload a
                document, its text content is sent to Mistral AI's API for embedding,
                summarization, flashcard generation, quiz generation, and Q&A. Your data
                is not used to train Mistral's models.
              </p>
              {isAnonymous && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-small text-amber-800">
                  <p className="font-medium">Guest mode — data is ephemeral</p>
                  <p className="mt-1">
                    Your current session is anonymous. If you clear your browser data or sign
                    out, you will lose access to this account.{' '}
                    <button
                      onClick={() => { window.location.href = '/login' }}
                      className="font-medium underline underline-offset-2 hover:text-amber-900"
                    >
                      Sign in
                    </button>{' '}
                    with email to keep your work permanently.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Export Data */}
          <Card className="!p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-label font-semibold text-text">Export my data</h3>
                <p className="mt-1 text-small text-text-secondary">
                  Download all your documents, flashcards, quiz questions, and study data
                  as a JSON file. Vectors are excluded from the export.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                isLoading={exporting}
                disabled={exporting}
                leadingIcon={!exporting ? <ArrowDownToLine className="h-4 w-4" /> : undefined}
              >
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            </div>
          </Card>

          {/* Delete Account */}
          <Card className="!p-6 border-rose-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-rose-500" />
                  <h3 className="text-label font-semibold text-rose-700">Delete account</h3>
                </div>
                <p className="mt-1 text-small text-text-secondary">
                  Permanently delete your account and all associated data. This action is
                  irreversible — your documents, flashcards, quiz results, and study
                  progress will be removed immediately.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-label font-semibold text-text">Delete account?</h3>
                  <p className="text-small text-text-muted">This cannot be undone</p>
                </div>
              </div>
              <p className="mb-6 text-body text-text-secondary">
                All your documents, flashcards, quiz results, and study data will be
                permanently removed from our servers. Your account will be deleted and
                you will not be able to log in again.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setDeleting(false)
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  isLoading={deleting}
                  disabled={deleting}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  {deleting ? 'Deleting…' : 'Delete my account'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/settings',
  component: SettingsPage,
})
