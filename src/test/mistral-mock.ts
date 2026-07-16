// ═══════════════════════════════════════════════════════════════════════════
// Mistral API Mock Server
//
// A lightweight HTTP server that mimics the Mistral AI API for deterministic
// edge function testing. Supports canned responses for:
//   - Embeddings (POST /v1/embeddings)
//   - Chat completions (POST /v1/chat/completions)
//   - Failure modes (timeout, 500, malformed JSON)
//
// To use in tests:
//   1. Start the mock server on a random port
//   2. Set MISTRAL_API_URL=http://localhost:<port> in the edge function env
//   3. Call setMockResponse() to configure what the next call returns
//   4. Run the edge function
//   5. Call getLastRequest() to inspect what was sent
//
// Edge functions call Mistral at their configured MISTRAL_API_URL.
// In test, point that env var at this mock server.
// ═══════════════════════════════════════════════════════════════════════════

import { createServer, type Server, IncomingMessage, ServerResponse } from 'http'

// ── Type definitions ──────────────────────────────────────────────────────

export interface EmbeddingResponse {
  id: string
  object: 'list'
  data: Array<{
    object: 'embedding'
    index: number
    embedding: number[]
  }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

export interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string
    }
    finish_reason: 'stop' | 'length'
  }>
  model: string
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export type MockResponse =
  | { type: 'embedding'; data: EmbeddingResponse }
  | { type: 'chat'; data: ChatCompletionResponse }
  | { type: 'error'; status: number; body: string }
  | { type: 'malformed'; body: string }

// ── Canned response builders ──────────────────────────────────────────────

/**
 * Build a canned embedding response for N vectors.
 */
export function makeEmbeddingResponse(
  dimensions: number,
  count: number,
  model = 'mistral-embed',
): EmbeddingResponse {
  // Use a simple deterministic vector
  const embedding: number[] = []
  for (let i = 0; i < dimensions; i++) {
    embedding.push(Math.sin(i) * 0.1) // deterministic, small values
  }

  return {
    id: `mock-embed-${Date.now()}`,
    object: 'list',
    data: Array.from({ length: count }, (_, i) => ({
      object: 'embedding' as const,
      index: i,
      embedding,
    })),
    model,
    usage: { prompt_tokens: 50 * count, total_tokens: 50 * count },
  }
}

/**
 * Build a canned chat completion response with the given content.
 */
export function makeChatResponse(
  content: string,
  model = 'mistral-small-latest',
): ChatCompletionResponse {
  return {
    id: `mock-chat-${Date.now()}`,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    model,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }
}

// ── Canned responses for each edge function type ──────────────────────────

/** Valid summary JSON that Mistral returns for summarize-document */
export const CANNED_SUMMARY_JSON = JSON.stringify({
  tldr: 'Plants convert sunlight into chemical energy through photosynthesis, which occurs in chloroplasts.',
  keyPoints: [
    'Photosynthesis converts light energy to chemical energy',
    'The process occurs in chloroplasts containing chlorophyll',
    'Two main stages: light-dependent reactions and Calvin cycle',
    'Factors affecting rate: light intensity, CO2, temperature',
  ],
  keyTerms: [
    { term: 'Chloroplast', definition: 'Organelle where photosynthesis occurs' },
    { term: 'Chlorophyll', definition: 'Green pigment that captures light energy' },
    { term: 'Calvin Cycle', definition: 'Light-independent reactions that fix CO2 into glucose' },
  ],
})

/** Valid summary JSON for the cheat-sheet mode */
export const CANNED_CHEAT_SHEET_JSON = JSON.stringify({
  tldr: 'Photosynthesis: sunlight + CO2 + H2O → glucose + O2',
  keyPoints: [
    '6CO2 + 6H2O → C6H12O6 + 6O2',
    'Light reactions: produce ATP and NADPH',
    'Calvin cycle: fixes carbon into glucose',
  ],
  keyTerms: [
    { term: 'RuBisCO', definition: 'Key enzyme in carbon fixation' },
  ],
})

/** Valid flashcard JSON array that Mistral returns for generate-flashcards */
export const CANNED_FLASHCARDS_JSON = JSON.stringify([
  { front: 'What is photosynthesis?', back: 'Plants convert light energy into chemical energy' },
  { front: 'Where does photosynthesis occur?', back: 'In the chloroplasts' },
  { front: 'What are the two stages of photosynthesis?', back: 'Light-dependent reactions and Calvin cycle' },
  { front: 'What three factors affect photosynthesis?', back: 'Light intensity, CO2 concentration, and temperature' },
])

/** Valid quiz JSON array that Mistral returns for generate-quiz */
export const CANNED_QUIZ_JSON = JSON.stringify([
  {
    question: 'What is the primary function of photosynthesis?',
    options: ['Convert light energy to chemical energy', 'Produce carbon dioxide', 'Break down glucose', 'Release oxygen'],
    correct_index: 0,
    explanation: 'Photosynthesis converts light energy into chemical energy stored in glucose.',
    concept: 'photosynthesis',
  },
  {
    question: 'Where does photosynthesis take place?',
    options: ['Mitochondria', 'Chloroplasts', 'Nucleus', 'Ribosomes'],
    correct_index: 1,
    explanation: 'Chloroplasts contain chlorophyll and are the site of photosynthesis.',
    concept: 'chloroplasts',
  },
  {
    question: 'What product of the light-dependent reactions is used in the Calvin cycle?',
    options: ['Glucose', 'ATP and NADPH', 'Oxygen', 'Carbon dioxide'],
    correct_index: 1,
    explanation: 'ATP and NADPH produced in light reactions power the Calvin cycle.',
    concept: 'light_reactions',
  },
])

/** Valid RAG answer (grounded) */
export const CANNED_RAG_ANSWER = 'Photosynthesis converts light energy into chemical energy in the chloroplasts.'

/** RAG refusal when question is not in document context */
export const CANNED_RAG_REFUSAL = 'I don\'t know based on this document.'

/** Valid practice exam question JSON */
export const CANNED_EXAM_JSON = JSON.stringify([
  {
    question: 'Which organelle performs photosynthesis?',
    options: ['Mitochondrion', 'Chloroplast', 'Nucleus', 'Ribosome'],
    correct_index: 1,
    explanation: 'Chloroplasts contain chlorophyll and perform photosynthesis.',
    concept: 'chloroplasts',
  },
  {
    question: 'What is the chemical formula for glucose?',
    options: ['C6H12O6', 'CO2', 'H2O', 'O2'],
    correct_index: 0,
    explanation: 'Glucose has the chemical formula C6H12O6.',
    concept: 'glucose',
  },
])

// ── Mock Server ───────────────────────────────────────────────────────────

export interface MockServerState {
  requests: Array<{ method: string; path: string; body: any; timestamp: Date }>
  nextResponse: MockResponse | null
  simulateDelay: number // ms
}

/**
 * Create a Mistral mock HTTP server. Returns the server instance and
 * a set of control functions.
 *
 * Usage:
 *   const { server, port, setResponse, getLastRequest, close } = createMockServer()
 *   await server.listen(0) // random port
 *   setResponse(makeChatResponse(CANNED_SUMMARY_JSON))
 *   // ... run test with MISTRAL_API_URL=http://localhost:${port} ...
 *   const lastReq = getLastRequest()
 *   await close()
 */
export interface MockServerHandle {
  server: Server
  port: number
  state: MockServerState
  started: boolean
  setResponse: (r: MockResponse | null) => void
  setDelay: (ms: number) => void
  getLastRequest: () => { method: string; path: string; body: any } | null
  getAllRequests: () => Array<{ method: string; path: string; body: any }>
  close: () => Promise<void>
}

/**
 * Create a Mistral mock HTTP server. Returns the server instance and
 * a set of control functions.
 *
 * Usage:
 *   const mock = createMockServer()
 *   await startMockServer(mock) // random port
 *   mock.setResponse(makeChatResponse(CANNED_SUMMARY_JSON))
 *   // ... run test with MISTRAL_API_URL=http://localhost:${mock.port} ...
 *   await mock.close()
 */
export function createMockServer(): MockServerHandle {
  const state: MockServerState = {
    requests: [],
    nextResponse: null,
    simulateDelay: 0,
  }

  // Build the handle with mutable properties
  const handle: MockServerHandle = {
    server: createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8')
        let parsedBody: any = null
        try { parsedBody = JSON.parse(rawBody) } catch { parsedBody = rawBody }

        // Record the request
        state.requests.push({
          method: req.method || 'UNKNOWN',
          path: req.url || '/',
          body: parsedBody,
          timestamp: new Date(),
        })

        // Simulate delay if configured (using synchronous wait for simplicity)
        if (state.simulateDelay > 0) {
          const start = Date.now()
          while (Date.now() - start < state.simulateDelay) { /* busy wait */ }
        }

        // Determine response
        const response = state.nextResponse

        if (!response) {
          // Default: return a generic embedding response
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(makeEmbeddingResponse(1024, 1)))
          return
        }

        switch (response.type) {
          case 'embedding':
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response.data))
            break
          case 'chat':
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response.data))
            break
          case 'error':
            res.writeHead(response.status, { 'Content-Type': 'text/plain' })
            res.end(response.body)
            break
          case 'malformed':
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(response.body) // intentionally not valid JSON
            break
        }
      })
    }),
    port: 0,
    state,
    started: false,
    setResponse: (r) => { state.nextResponse = r },
    setDelay: (ms) => { state.simulateDelay = ms },
    getLastRequest: () => state.requests.length > 0 ? state.requests[state.requests.length - 1] : null,
    getAllRequests: () => state.requests.map((r) => ({ method: r.method, path: r.path, body: r.body })),
    close: async () => {
      if (!handle.started) return
      // Close gracefully with a fallback timeout to prevent hanging
      await Promise.race([
        new Promise<void>((resolve) => handle.server.close(() => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ])
      handle.started = false
    },
  }

  return handle
}

/**
 * Start the mock server on a random available port.
 * Returns the port number and marks the server as started.
 */
export function startMockServer(mock: MockServerHandle): Promise<number> {
  return new Promise((resolve, reject) => {
    mock.server.listen(0, () => {
      const addr = mock.server.address()
      if (addr && typeof addr === 'object') {
        mock.started = true
        mock.port = addr.port
        resolve(addr.port)
      } else {
        reject(new Error('Failed to get server port'))
      }
    })
  })
}
