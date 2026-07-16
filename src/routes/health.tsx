import { useState, useEffect, useCallback } from 'react'
import { createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'
import { supabase } from '../lib/supabase'
import { safeFetch } from '../lib/fetchWithTimeout'
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'

// ── Types ──────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string
  status: 'ok' | 'error' | 'loading'
  message: string
  latencyMs: number | null
}

const INITIAL_SERVICES: ServiceStatus[] = [
  { name: 'Supabase DB', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'embed-document', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'rag-query', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'summarize-document', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'generate-flashcards', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'generate-quiz', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'review-flashcard', status: 'loading', message: 'Pinging...', latencyMs: null },
  { name: 'generate-targeted-practice', status: 'loading', message: 'Pinging...', latencyMs: null },
]

// ── Service checkers ───────────────────────────────────────────────

async function checkDb(): Promise<Pick<ServiceStatus, 'status' | 'message' | 'latencyMs'>> {
  const start = performance.now()
  try {
    const { error } = await supabase.from('documents').select('id', { count: 'exact', head: true }).limit(1)
    const latency = Math.round(performance.now() - start)
    if (error) return { status: 'error', message: `DB query failed: ${error.message}`, latencyMs: latency }
    return { status: 'ok', message: 'Connected', latencyMs: latency }
  } catch (err) {
    const latency = Math.round(performance.now() - start)
    return { status: 'error', message: `DB error: ${(err as Error).message}`, latencyMs: latency }
  }
}

async function checkEdgeFunction(name: string): Promise<Pick<ServiceStatus, 'status' | 'message' | 'latencyMs'>> {
  // We can't call the full edge function without a valid documentId, so we
  // just verify the function endpoint is reachable by sending an empty POST
  // and accepting any response (even 4xx/5xx) as "deployed".
  // An empty body ensures no Mistral credits are consumed.
  const start = performance.now()

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const url = import.meta.env.DEV
      ? `/api/functions/${name}`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

    const result = await safeFetch<{ error?: string }>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: '{}',
      timeout: 10_000, // 10s timeout for health checks
    })

    const latency = Math.round(performance.now() - start)

    if (result.error) {
      const msg = result.error.message.toLowerCase()
      // Any non-network error response means the function IS deployed and responding
      if (msg.includes('timeout') || msg.includes('unreachable') || msg.includes('abort')) {
        return { status: 'error', message: result.error.message, latencyMs: latency }
      }
      return { status: 'ok', message: `Deployed (responded: ${result.error.message})`, latencyMs: latency }
    }

    return { status: 'ok', message: 'Responded', latencyMs: latency }
  } catch (err) {
    const latency = Math.round(performance.now() - start)
    return { status: 'error', message: `Unreachable: ${(err as Error).message}`, latencyMs: latency }
  }
}

// ── Component ──────────────────────────────────────────────────────

function HealthPage() {
  const [services, setServices] = useState<ServiceStatus[]>(INITIAL_SERVICES)
  const [allDone, setAllDone] = useState(false)

  const runAllChecks = useCallback(async () => {
    setServices(INITIAL_SERVICES)
    setAllDone(false)

    // DB check
    const dbResult = await checkDb()
    setServices((prev) =>
      prev.map((s) => (s.name === 'Supabase DB' ? { ...s, ...dbResult } : s)),
    )

    // Edge function checks in parallel
    const edgeNames = INITIAL_SERVICES.slice(1).map((s) => s.name)
    const edgeResults = await Promise.allSettled(
      edgeNames.map((name) => checkEdgeFunction(name)),
    )

    setServices((prev) =>
      prev.map((s) => {
        const idx = edgeNames.indexOf(s.name)
        if (idx >= 0) {
          const result = edgeResults[idx]
          if (result.status === 'fulfilled') {
            return { ...s, ...result.value }
          }
          return { ...s, status: 'error' as const, message: 'Check failed', latencyMs: null }
        }
        return s
      }),
    )

    setAllDone(true)
  }, [])

  useEffect(() => {
    runAllChecks()
  }, [runAllChecks])

  // If not dev mode, show a simple message
  if (!import.meta.env.DEV) {
    return (
      <PageContainer>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Card className="max-w-md text-center p-8">
            <h1 className="text-title-2 text-text mb-2">Health Check</h1>
            <p className="text-body text-text-secondary">
              This page is only available in development mode. Set <code className="rounded bg-bg-muted px-1.5 py-0.5 text-caption font-mono">VITE_DEV=true</code> to enable.
            </p>
          </Card>
        </div>
      </PageContainer>
    )
  }

  const okCount = services.filter((s) => s.status === 'ok').length
  const errorCount = services.filter((s) => s.status === 'error').length

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display text-text">Service Health</h1>
            <p className="mt-1 text-callout text-text-secondary">
              Pre-flight check — pings each service and reports status.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={runAllChecks}
            leadingIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>

        {/* Summary badges */}
        {allDone && (
          <div className="flex items-center gap-3">
            <Badge variant={okCount === services.length ? 'success' : 'info'}>
              {okCount}/{services.length} healthy
            </Badge>
            {errorCount > 0 && (
              <Badge variant="warning">
                {errorCount} failing
              </Badge>
            )}
          </div>
        )}

        {/* Service list */}
        <div className="space-y-3">
          {services.map((service) => {
            const isOk = service.status === 'ok'
            const isLoading = service.status === 'loading'

            return (
              <Card key={service.name} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status icon */}
                  <div className="shrink-0">
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                    ) : isOk ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-danger" />
                    )}
                  </div>

                  {/* Service info */}
                  <div className="min-w-0">
                    <p className="text-label font-medium text-text truncate">
                      {service.name}
                    </p>
                    <p className={`text-small truncate ${
                      isOk ? 'text-success' : isLoading ? 'text-text-muted' : 'text-danger'
                    }`}>
                      {service.message}
                    </p>
                  </div>
                </div>

                {/* Latency */}
                <div className="shrink-0 text-right">
                  {service.latencyMs !== null && (
                    <span className={`text-caption tabular-nums ${
                      service.latencyMs < 500 ? 'text-text-muted' : 'text-warning'
                    }`}>
                      {service.latencyMs}ms
                    </span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {/* Legend */}
        <div className="rounded-lg border border-border bg-surface-subtle p-4 text-small text-text-secondary">
          <p className="font-medium text-text mb-1">How to read this</p>
          <ul className="space-y-1 list-disc list-inside">
            <li><strong className="text-text">Green:</strong> Service is deployed and responding.</li>
            <li><strong className="text-text">Red:</strong> Service is unreachable or throwing errors — investigate before recording.</li>
            <li>Edge functions are checked by sending a minimal payload; a &quot;document not found&quot; response means the function IS healthy.</li>
            <li>Timestamps and latencies are approximate (includes network round-trip).</li>
          </ul>
        </div>
      </div>
    </PageContainer>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/health',
  component: HealthPage,
})
