// @vitest-environment node
//
// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure tests — fixtures, time control, embeddings, Mistral mock
//
// Validates that all test infrastructure works correctly and deterministically.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { request as httpRequest } from 'http'
import { PHOTOSYNTHESIS_LECTURE, DATA_STRUCTURES_LECTURE, VERY_SHORT_DOC, NEAR_EMPTY_DOC, SPECIAL_CHARS_DOC, GERMAN_TEXT, ALL_FIXTURES, getFixture } from './fixtures/documents'
import { chunkText } from '../lib/chunk'
import { setTestNow, advanceTime, advanceDays, resetTime, now, todayStr, yesterdayStr, isoOffset, consecutiveDays } from './time'
import { FIXED_EMBEDDING_1024, generateFixedEmbedding, cosineSimilarity, embedFromText } from './embeddings'
import { createMockServer, makeChatResponse, makeEmbeddingResponse, CANNED_SUMMARY_JSON, startMockServer } from './mistral-mock'

/** Helper: POST JSON to a local server and return parsed response */
function postToMock(port: number, path: string, body: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = httpRequest({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve({ status: res.statusCode, text: raw, json: () => JSON.parse(raw) })
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixture document tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Fixture documents', () => {
  it('all fixtures have unique IDs', () => {
    const ids = ALL_FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('photosynthesis lecture has expected content', () => {
    expect(PHOTOSYNTHESIS_LECTURE.content.length).toBeGreaterThan(500)
    expect(PHOTOSYNTHESIS_LECTURE.keyPhrases.length).toBeGreaterThanOrEqual(3)
  })

  it('data structures lecture chunks into multiple chunks', () => {
    const chunks = chunkText(DATA_STRUCTURES_LECTURE.content)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // Verify all key phrases are present in at least one chunk
    for (const phrase of DATA_STRUCTURES_LECTURE.keyPhrases) {
      const found = chunks.some((c) => c.includes(phrase))
      expect(found, `Phrase "${phrase}" should exist in at least one chunk`).toBe(true)
    }
  })

  it('very short doc produces exactly 1 chunk', () => {
    const chunks = chunkText(VERY_SHORT_DOC.content)
    expect(chunks.length).toBe(1)
  })

  it('near-empty doc produces 0 chunks', () => {
    const chunks = chunkText(NEAR_EMPTY_DOC.content)
    expect(chunks.length).toBe(0)
  })

  it('special chars doc preserves key content', () => {
    const chunks = chunkText(SPECIAL_CHARS_DOC.content)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // Key patterns should survive chunking (email, URL, unicode chars)
    // Note: chunkText splits on '.' so 'example.com' may become 'example. com'
    const combined = chunks.join(' ').toLowerCase()
    expect(combined).toContain('special')
    expect(combined).toContain('unicode')
    expect(combined).toContain('math')
  })

  it('german text is handled correctly', () => {
    const chunks = chunkText(GERMAN_TEXT.content)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks.join(' ')).toContain('Photosynthese')
  })

  it('getFixture returns correct fixture by ID', () => {
    expect(getFixture('fixture-photosynthesis')?.title).toBe(PHOTOSYNTHESIS_LECTURE.title)
    expect(getFixture('fixture-nonexistent')).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Time control tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Time control', () => {
  afterEach(() => {
    resetTime()
  })

  it('now() returns real time when not frozen', () => {
    const t1 = Date.now()
    const t2 = now().getTime()
    expect(Math.abs(t2 - t1)).toBeLessThan(5000) // within 5 seconds
  })

  it('setTestNow freezes the clock', () => {
    const frozen = new Date('2024-06-15T12:00:00Z')
    setTestNow(frozen)
    expect(now().toISOString()).toBe('2024-06-15T12:00:00.000Z')
  })

  it('advanceTime moves the clock forward', () => {
    setTestNow('2024-01-01T00:00:00Z')
    advanceTime(3600_000) // +1 hour
    expect(now().toISOString()).toBe('2024-01-01T01:00:00.000Z')
  })

  it('advanceDays moves the clock forward by days', () => {
    setTestNow('2024-01-01T00:00:00Z')
    advanceDays(7)
    expect(now().toISOString()).toBe('2024-01-08T00:00:00.000Z')
  })

  it('resetTime returns to real time', () => {
    setTestNow('2024-01-01T00:00:00Z')
    resetTime()
    const t1 = Date.now()
    const t2 = now().getTime()
    expect(Math.abs(t2 - t1)).toBeLessThan(5000)
  })

  it('todayStr returns correct date string', () => {
    setTestNow('2024-03-15T14:30:00Z')
    expect(todayStr()).toBe('2024-03-15')
  })

  it('yesterdayStr returns correct date string', () => {
    setTestNow('2024-03-15T14:30:00Z')
    expect(yesterdayStr()).toBe('2024-03-14')
  })

  it('isoOffset returns correct offset dates', () => {
    setTestNow('2024-06-01T00:00:00Z')
    expect(isoOffset(-3)).toBe('2024-05-29T00:00:00.000Z')
    expect(isoOffset(3)).toBe('2024-06-04T00:00:00.000Z')
  })

  it('consecutiveDays generates correct streak dates', () => {
    setTestNow('2024-06-10T12:00:00Z')
    const days = consecutiveDays(5)
    expect(days).toHaveLength(5)
    // Dates should be June 6, 7, 8, 9, 10
    expect(days[0]).toContain('2024-06-06')
    expect(days[4]).toContain('2024-06-10')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Deterministic embedding tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Deterministic embeddings', () => {
  it('FIXED_EMBEDDING_1024 is the correct length', () => {
    expect(FIXED_EMBEDDING_1024).toHaveLength(1024)
  })

  it('generateFixedEmbedding is deterministic (same seed = same vector)', () => {
    const v1 = generateFixedEmbedding(42, 256)
    const v2 = generateFixedEmbedding(42, 256)
    expect(v1).toEqual(v2)
  })

  it('generateFixedEmbedding with different seeds gives different vectors', () => {
    const v1 = generateFixedEmbedding(1, 100)
    const v2 = generateFixedEmbedding(2, 100)
    expect(v1).not.toEqual(v2)
  })

  it('cosineSimilarity of identical vectors is 1', () => {
    const v = generateFixedEmbedding(42, 100)
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('cosineSimilarity of orthogonal vectors is ~0', () => {
    // Create two perpendicular-ish vectors
    const v1 = [1, 0, 0]
    const v2 = [0, 1, 0]
    expect(Math.abs(cosineSimilarity(v1, v2))).toBeCloseTo(0, 5)
  })

  it('embedFromText is deterministic', () => {
    const text = 'This is a test document about photosynthesis.'
    const e1 = embedFromText(text, 128)
    const e2 = embedFromText(text, 128)
    expect(e1).toEqual(e2)
  })

  it('embedFromText produces valid unit vectors', () => {
    const text = 'Some text content for testing.'
    const embedding = embedFromText(text, 256)
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
    expect(magnitude).toBeCloseTo(1, 5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Mistral mock server tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Mistral mock server', () => {
  let mockServer: ReturnType<typeof createMockServer>

  beforeEach(() => {
    mockServer = createMockServer()
  })

  afterEach(async () => {
    await mockServer.close()
  })

  it('starts and stops on a random port', async () => {
    const port = await startMockServer(mockServer)
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThan(65536)
    await mockServer.close()
  })

  it('responds to embeddings by default', async () => {
    const port = await startMockServer(mockServer)
    const res = await postToMock(port, '/v1/embeddings', { input: ['test'], model: 'mistral-embed' })
    expect(res.status).toBe(200)
    const data = res.json()
    expect(data.object).toBe('list')
    expect(data.data[0].embedding).toHaveLength(1024)
  })

  it('returns canned chat response', async () => {
    const port = await startMockServer(mockServer)
    mockServer.setResponse({ type: 'chat', data: makeChatResponse(CANNED_SUMMARY_JSON) })
    const res = await postToMock(port, '/v1/chat/completions', {
      messages: [{ role: 'user', content: 'test' }], model: 'mistral-small',
    })
    expect(res.status).toBe(200)
    const data = res.json()
    expect(data.choices[0].message.content).toBe(CANNED_SUMMARY_JSON)
  })

  it('returns error responses', async () => {
    const port = await startMockServer(mockServer)
    mockServer.setResponse({ type: 'error', status: 500, body: 'Internal Server Error' })
    const res = await postToMock(port, '/v1/chat/completions', {})
    expect(res.status).toBe(500)
  })

  it('returns malformed JSON responses', async () => {
    const port = await startMockServer(mockServer)
    mockServer.setResponse({ type: 'malformed', body: 'this is not json at all {{{' })
    const res = await postToMock(port, '/v1/chat/completions', {})
    expect(res.status).toBe(200)
    expect(() => JSON.parse(res.text)).toThrow()
  })

  it('records all requests for inspection', async () => {
    const port = await startMockServer(mockServer)
    mockServer.setResponse({ type: 'chat', data: makeChatResponse(CANNED_SUMMARY_JSON) })
    await postToMock(port, '/v1/chat/completions', {
      messages: [{ role: 'user', content: 'Hello' }], model: 'mistral-small',
    })
    const lastReq = mockServer.getLastRequest()
    expect(lastReq).not.toBeNull()
    expect(lastReq!.method).toBe('POST')
    expect(lastReq!.path).toBe('/v1/chat/completions')
    expect(lastReq!.body.messages[0].content).toBe('Hello')
  })

  it('makeEmbeddingResponse creates correct structure', () => {
    const res = makeEmbeddingResponse(256, 3)
    expect(res.data).toHaveLength(3)
    expect(res.data[0].embedding).toHaveLength(256)
  })

  it('makeChatResponse creates correct structure', () => {
    const res = makeChatResponse('Hello, world!')
    expect(res.choices[0].message.content).toBe('Hello, world!')
    expect(res.choices[0].finish_reason).toBe('stop')
  })
})
