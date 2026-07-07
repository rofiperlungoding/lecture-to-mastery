/**
 * Split text into ~800-character chunks with ~100-character overlap.
 * Prefers splitting on sentence boundaries (. ! ?).
 * Pure function, no external dependencies.
 */
export function chunkText(text: string): string[] {
  // Split on sentence boundaries (period, exclamation, question mark followed by space or end)
  const raw = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const sentences = raw.map((s) => s.trim()).filter(Boolean)
  if (sentences.length === 0) return []

  const chunks: string[] = []
  let i = 0

  while (i < sentences.length) {
    let content = sentences[i]
    let j = i

    // Accumulate sentences until we hit ~800 chars
    while (j + 1 < sentences.length) {
      const next = content + ' ' + sentences[j + 1]
      if (next.length > 800) break
      content = next
      j++
    }

    chunks.push(content)

    if (j + 1 >= sentences.length) break // No more sentences left

    // Walk backward from the end of this chunk to find the overlap start (~100 chars)
    let overlapLen = 0
    let k = j
    while (k >= i && overlapLen < 100) {
      overlapLen += sentences[k].length + (k < j ? 1 : 0)
      k--
    }
    i = Math.max(k + 1, i + 1) // Next chunk starts from the overlap boundary
  }

  return chunks
}
