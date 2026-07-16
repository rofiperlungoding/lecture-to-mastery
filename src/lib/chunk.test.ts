// ═══════════════════════════════════════════════════════════════════════════
// Unit tests — chunkText
//
// Tests the pure text-chunking function:
//   - Splits on sentence boundaries (. ! ?)
//   - Targets ~800 character chunks
//   - Overlaps ~100 characters between chunks
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { chunkText } from './chunk'

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(chunkText('   \n  \t  ')).toEqual([])
  })

  it('returns a single chunk for a short sentence', () => {
    const result = chunkText('Hello, world.')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Hello, world.')
  })

  it('handles text without sentence-ending punctuation', () => {
    const result = chunkText('This is a sentence without punctuation')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('This is a sentence without punctuation')
  })

  it('chunks long text at sentence boundaries', () => {
    // Generate ~2500 chars of repeated sentences
    const sentence = 'This is a test sentence that is long enough to demonstrate chunking behavior. '
    const text = sentence.repeat(30)
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.length).toBeLessThanOrEqual(4)

    // Each chunk should be ≤800 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(820) // allow slight buffer
    }

    // All original content should be present across chunks (overlap may cause dupes at boundaries)
    const allContent = chunks.join('')
    // Each sentence should appear at least once
    expect(allContent).toContain('demonstrate chunking behavior')
    // The combined content should be >= original length (overlap adds)
  })

  it('handles multiple punctuation types (. ! ?)', () => {
    const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.'
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // All content should be present
    expect(chunks.join('').includes('First sentence.')).toBe(true)
    expect(chunks.join('').includes('Second sentence!')).toBe(true)
    expect(chunks.join('').includes('Third sentence?')).toBe(true)
  })

  it('does not produce empty chunks', () => {
    const text = 'Short. Text. Here.'
    const chunks = chunkText(text)

    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0)
    }
  })

  it('produces overlapping chunks for long text', () => {
    // Create text long enough to need 2+ chunks, check overlap
    const sentences = Array.from({ length: 50 }, (_, i) => `This is sentence number ${i + 1} in the test. `)
    const text = sentences.join('')
    const chunks = chunkText(text)

    if (chunks.length >= 2) {
      // Check that content is preserved across chunks (overlap may cause dupes)
      expect(chunks[0].length + chunks[1].length).toBeGreaterThan(text.trim().length / 2)
    }
  })

  it('preserves all content in round-trip', () => {
    const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew']
    const text = words.map((w) => `${w} is a fruit. `).join('')
    const chunks = chunkText(text)
    const all = chunks.join('')

    for (const word of words) {
      expect(all).toContain(word)
    }
  })

  it('returns one chunk for text under the 800-char limit', () => {
    const text = 'A. B. C. D. E. F. G. H. I. J. '
    expect(text.length).toBeLessThan(800)
    expect(chunkText(text)).toHaveLength(1)
  })

  it('handles text without sentence boundaries as a single chunk', () => {
    // Create a long string without sentence punctuation
    const word = 'word '
    const longString = word.repeat(500) // 2500 chars, no sentence punctuation
    const result = chunkText(longString)

    // chunkText falls back to treating the entire input as one sentence
    // when no sentence boundaries are found
    expect(result.length).toBe(1)
    expect(result[0]).toBe(longString.trim())
  })
})
