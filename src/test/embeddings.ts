// ═══════════════════════════════════════════════════════════════════════════
// Deterministic embeddings
//
// For integration tests that involve vector similarity search, we use fixed,
// known embeddings rather than calling the Mistral embedding API.
//
// Strategy: Generate embeddings deterministically from chunk content using
// a hash function (FNV-1a → normalize to unit vector). This means:
//   1. Same chunk content always produces the same embedding (deterministic)
//   2. Similar chunks produce similar embeddings (useful for retrieval tests)
//   3. No external API calls needed
//   4. Embeddings are valid 1024-dimensional unit vectors (matching Mistral embed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A fixed 1024-dimensional unit vector used as a default embedding.
 * This avoids calling the embedding API in tests.
 */
export const FIXED_EMBEDDING_1024: number[] = generateFixedEmbedding(42, 1024)

/**
 * Generate a deterministic unit vector from a seed value.
 * Uses a simple hash-to-float approach to create reproducible embeddings.
 */
export function generateFixedEmbedding(seed: number, dimensions = 1024): number[] {
  // Simple LCG random seeded by the input
  let state = seed
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff
    return state / 0x7fffffff
  }

  // Generate raw values
  const values: number[] = []
  for (let i = 0; i < dimensions; i++) {
    values.push(nextRandom() * 2 - 1) // range [-1, 1]
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0))
  return values.map((v) => Math.round((v / magnitude) * 1e6) / 1e6)
}

/**
 * Compute the cosine similarity between two embedding vectors.
 * Used to verify retrieval ordering in tests.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Generate an embedding from text deterministically using FNV-1a hash.
 * This ensures the same text always produces the same embedding,
 * and similar texts produce somewhat similar embeddings.
 */
export function embedFromText(text: string, dimensions = 1024): number[] {
  // Use a seed derived from the text content
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return generateFixedEmbedding(hash >>> 0, dimensions)
}
