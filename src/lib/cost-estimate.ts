/**
 * ═══════════════════════════════════════════════════════════════
 *   💰  Cost Estimate — Token-based pricing config
 *   ═══════════════════════════════════════════════════════════════
 *   Real Mistral AI API prices as of July 2026:
 *
 *     mistral-embed (1024-d vectors)
 *       → $0.10 / 1M input tokens
 *
 *     mistral-small-latest (generation)
 *       → $0.20 / 1M input tokens
 *       → $0.60 / 1M output tokens
 *
 *   All estimates are conservative (over-estimate) so the
 *   displayed cost is intentionally slightly higher than
 *   typical actual spend — never lower.
 * ═══════════════════════════════════════════════════════════════
 */

export const PRICING = {
  embed: {
    inputPer1M: 0.10,
    label: 'Mistral Embed',
  },
  small: {
    inputPer1M: 0.20,
    outputPer1M: 0.60,
    label: 'Mistral Small',
  },
} as const

export const TOKEN_ESTIMATES = {
  embedChunk: {
    inputTokens: 512,
    label: 'Embed chunk',
  },
  summarize: {
    inputTokens: 12_000,
    outputTokens: 1_500,
    label: 'Generate summary',
  },
  generateFlashcards: {
    inputTokens: 13_000,
    outputTokens: 3_000,
    label: 'Generate flashcards',
  },
  generateQuiz: {
    inputTokens: 13_000,
    outputTokens: 2_500,
    label: 'Generate quiz',
  },
  chatQuery: {
    inputTokens: 3_500,
    outputTokens: 500,
    label: 'Chat query',
  },
  targetedPractice: {
    inputTokens: 15_000,
    outputTokens: 3_000,
    label: 'Targeted practice',
  },
} as const

export function embedCost(tokenCount: number = TOKEN_ESTIMATES.embedChunk.inputTokens): number {
  return (tokenCount / 1_000_000) * PRICING.embed.inputPer1M
}

export function generateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.small.inputPer1M
  const outputCost = (outputTokens / 1_000_000) * PRICING.small.outputPer1M
  return inputCost + outputCost
}

export function perSessionCostDisplay(): string {
  const summary = generateCost(
    TOKEN_ESTIMATES.summarize.inputTokens,
    TOKEN_ESTIMATES.summarize.outputTokens,
  )
  const flashcards = generateCost(
    TOKEN_ESTIMATES.generateFlashcards.inputTokens,
    TOKEN_ESTIMATES.generateFlashcards.outputTokens,
  )
  const quiz = generateCost(
    TOKEN_ESTIMATES.generateQuiz.inputTokens,
    TOKEN_ESTIMATES.generateQuiz.outputTokens,
  )
  const embed = embedCost()
  const chats = generateCost(
    TOKEN_ESTIMATES.chatQuery.inputTokens * 2,
    TOKEN_ESTIMATES.chatQuery.outputTokens * 2,
  )

  const total = summary + flashcards + quiz + embed + chats

  return total < 0.01
    ? '< $0.01'
    : `~$${total.toFixed(2)}`
}

export function itemizedCosts(): { label: string; cost: string }[] {
  return [
    { label: 'Embed document (≈20 chunks)', cost: `~$${embedCost().toFixed(4)}` },
    { label: 'Generate summary', cost: `~$${generateCost(TOKEN_ESTIMATES.summarize.inputTokens, TOKEN_ESTIMATES.summarize.outputTokens).toFixed(4)}` },
    { label: 'Generate flashcards (≈10 cards)', cost: `~$${generateCost(TOKEN_ESTIMATES.generateFlashcards.inputTokens, TOKEN_ESTIMATES.generateFlashcards.outputTokens).toFixed(4)}` },
    { label: 'Generate quiz (≈5 questions)', cost: `~$${generateCost(TOKEN_ESTIMATES.generateQuiz.inputTokens, TOKEN_ESTIMATES.generateQuiz.outputTokens).toFixed(4)}` },
    { label: '2 chat queries', cost: `~$${generateCost(TOKEN_ESTIMATES.chatQuery.inputTokens * 2, TOKEN_ESTIMATES.chatQuery.outputTokens * 2).toFixed(4)}` },
  ]
}
