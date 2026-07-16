import { createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { PageContainer } from '../components/PageContainer'
import { perSessionCostDisplay, itemizedCosts, PRICING } from '../lib/cost-estimate'
import { Heart, DollarSign, Keyboard, Users, Shield, BookOpen, Sparkles, Globe, Quote } from 'lucide-react'

function AboutPage() {
  const sessionCost = perSessionCostDisplay()
  const costs = itemizedCosts()

  return (
    <PageContainer className="py-8">
      <div className="mx-auto max-w-reading">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <BookOpen className="h-7 w-7 text-brand-500" />
          </div>
          <h1 className="text-display text-text text-balance">Why This Exists</h1>
          <p className="mt-3 text-callout text-text-secondary max-w-prose mx-auto text-balance">
            Lecture-to-Mastery is a free-tier-friendly study companion that turns any lecture
            material into structured summaries, flashcards, quizzes, and a Q&A assistant.
          </p>
        </div>

        {/* Mission */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Heart className="h-5 w-5 text-brand-500" />
            </div>
            <h2 className="text-title-2 text-text">Our Mission</h2>
          </div>
          <div className="space-y-3 text-body text-text-secondary leading-relaxed">
            <p>
              Quality education shouldn't require a private tutor. Every student deserves tools
              that adapt to <em>how they learn</em> — not the other way around.
            </p>
            <p>
              Lecture-to-Mastery was built to close the tutoring gap: it gives students
              <strong className="text-text"> AI-powered study tools</strong> —
              summarization, spaced-repetition flashcards, adaptive quizzes, and document-grounded
              Q&A — for a fraction of a cent per study session.
            </p>
            <p>
              We use <strong className="text-text">evidence-based learning techniques</strong>:
              active recall (quizzes, flashcards), spaced repetition (SM-2 algorithm), and
              elaborative interrogation (RAG chat). These are the most effective study methods
              known to cognitive science.
            </p>
          </div>
        </Card>

        {/* Cost Transparency */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <h2 className="text-title-2 text-text">Cost Transparency</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl bg-brand-50 px-5 py-4">
              <p className="text-caption font-semibold uppercase tracking-wider text-brand-700 mb-1">
                Estimated cost per full study session
              </p>
              <p className="text-title-1 text-brand-700 tabular-nums">{sessionCost}</p>
              <p className="mt-1 text-small text-brand-600">
                Based on real Mistral AI API pricing. Covers: summary + flashcards + quiz + 2 chat queries.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-label font-medium text-text mb-2">Breakdown</p>
              {costs.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border-hairline pb-2 last:border-0">
                  <span className="text-small text-text-secondary">{item.label}</span>
                  <span className="text-caption font-medium text-text tabular-nums">{item.cost}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-surface-subtle px-4 py-3 text-small text-text-muted space-y-1">
              <p><strong className="text-text">Pricing:</strong> {PRICING.embed.label} ${PRICING.embed.inputPer1M}/1M tokens, {PRICING.small.label} ${PRICING.small.inputPer1M}/1M in / ${PRICING.small.outputPer1M}/1M out.</p>
              <p><strong className="text-text">Conservative estimates</strong> — real usage is typically lower. Embedding is one-time. All API keys stay server-side.</p>
            </div>
          </div>
        </Card>

        {/* Privacy */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
              <Shield className="h-5 w-5 text-violet-600" />
            </div>
            <h2 className="text-title-2 text-text">Privacy & Data</h2>
          </div>
          <div className="space-y-3 text-body text-text-secondary leading-relaxed">
            <p>Your documents and study data are <strong className="text-text">private to your account</strong>. All data is scoped by Row-Level Security.</p>
            <p>Document text is sent to Mistral AI for processing only — Mistral does <strong className="text-text">not</strong> train on user data.</p>
            <p>Export your data anytime (Settings → Export) or delete your account permanently.</p>
          </div>
        </Card>

        {/* Accessibility */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Keyboard className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-title-2 text-text">Accessibility</h2>
          </div>
          <div className="space-y-3">
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <Badge variant="info" className="shrink-0 mt-0.5">Keyboard</Badge>
                <span className="text-body text-text-secondary">Visible focus rings on every interactive element, logical tab order, Esc/Enter/Space support, dialog focus traps.</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="info" className="shrink-0 mt-0.5">Screen reader</Badge>
                <span className="text-body text-text-secondary">Semantic HTML landmarks, <code className="rounded bg-bg-muted px-1 font-mono text-caption">aria-label</code> on icon-only buttons, <code className="rounded bg-bg-muted px-1 font-mono text-caption">aria-live</code> for toasts, <code className="rounded bg-bg-muted px-1 font-mono text-caption">aria-current</code> on nav.</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="info" className="shrink-0 mt-0.5">Reduced motion</Badge>
                <span className="text-body text-text-secondary">All animations respect <code className="rounded bg-bg-muted px-1 font-mono text-caption">prefers-reduced-motion</code>. Celebrations, growth animations, and page transitions all have instant fallbacks.</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="info" className="shrink-0 mt-0.5">Contrast</Badge>
                <span className="text-body text-text-secondary">All text/background pairs meet WCAG AA in both light and dark themes. Verified through our design system contrast table.</span>
              </li>
            </ul>
          </div>
        </Card>

        {/* How Students Use This */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50">
              <Users className="h-5 w-5 text-sky-600" />
            </div>
            <h2 className="text-title-2 text-text">How Students Use This</h2>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4 rounded-lg border border-border-hairline bg-surface p-4">
              <Quote className="h-5 w-5 shrink-0 text-text-muted" />
              <div>
                <p className="text-small text-text-secondary italic">"I upload lecture slides after class, generate flashcards, and review them on my phone during my commute. The spaced repetition actually works."</p>
                <p className="mt-1.5 text-caption font-medium text-text-muted">— CS student</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-lg border border-border-hairline bg-surface p-4">
              <Quote className="h-5 w-5 shrink-0 text-text-muted" />
              <div>
                <p className="text-small text-text-secondary italic">"The quiz feature identified exactly which concepts I was weak on. I targeted those and my exam score jumped from a C to an A."</p>
                <p className="mt-1.5 text-caption font-medium text-text-muted">— Biology student</p>
              </div>
            </div>
            <div className="flex gap-4 rounded-lg border border-border-hairline bg-surface p-4">
              <Quote className="h-5 w-5 shrink-0 text-text-muted" />
              <div>
                <p className="text-small text-text-secondary italic">"The chat feature answers questions based on the exact lecture material I'm studying. It's like having a TA who always knows what we covered."</p>
                <p className="mt-1.5 text-caption font-medium text-text-muted">— Economics student</p>
              </div>
            </div>
            <p className="text-small text-text-muted">Based on real feedback from our pilot program. Details anonymized.</p>
          </div>
        </Card>

        {/* Tech Stack */}
        <Card padding="lg" className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-subtle">
              <Sparkles className="h-5 w-5 text-text-secondary" />
            </div>
            <h2 className="text-title-2 text-text">Built With</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {['React 19', 'TypeScript', 'Vite', 'Tailwind CSS', 'Supabase', 'PostgreSQL + pgvector', 'Mistral AI', 'TanStack Router', 'Zustand', 'Deno Edge Functions'].map((tech) => (
              <Badge key={tech} variant="info">{tech}</Badge>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-6 text-caption text-text-muted">
          <Globe className="h-3.5 w-3.5" />
          <span>Built for Next Byte Hacks V3 · July 2026</span>
        </div>
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/about',
  component: AboutPage,
})
