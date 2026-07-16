// ═══════════════════════════════════════════════════════════════════════════
// Fixture documents — known, stable text content for deterministic tests
//
// Each fixture has stable content, a predictable word/sentence count, and
// covers the edge cases needed for testing chunking, summarization, quiz
// generation, flashcard generation, and RAG.
// ═══════════════════════════════════════════════════════════════════════════

export interface FixtureDocument {
  id: string
  title: string
  sourceType: string
  language: string
  content: string
  /** Expected number of chunks when chunked with chunkText */
  expectedChunkCount: number
  /** Key phrases that must be present after chunking */
  keyPhrases: string[]
}

/**
 * Short lecture on Photosynthesis (~200 words, ~1200 chars)
 * Suitable for: summary, quiz, flashcard generation tests
 */
export const PHOTOSYNTHESIS_LECTURE: FixtureDocument = {
  id: 'fixture-photosynthesis',
  title: 'Introduction to Photosynthesis',
  sourceType: 'text',
  language: 'en',
  content: `Photosynthesis is the process by which plants convert light energy into chemical energy. This process takes place in the chloroplasts, which contain chlorophyll. The overall chemical equation for photosynthesis is: carbon dioxide plus water yields glucose plus oxygen.

Photosynthesis occurs in two main stages: the light-dependent reactions and the Calvin cycle. The light-dependent reactions require sunlight and produce ATP and NADPH. These energy carriers are then used in the Calvin cycle to fix carbon dioxide into glucose.

Several factors affect the rate of photosynthesis. These include light intensity, carbon dioxide concentration, and temperature. Understanding these factors is important for agriculture and horticulture. Scientists continue to study photosynthesis to improve crop yields and develop sustainable energy solutions.`,
  expectedChunkCount: 1,
  keyPhrases: [
    'plants convert light energy',
    'light-dependent reactions',
    'Calvin cycle',
    'carbon dioxide concentration',
  ],
}

/**
 * Medium lecture on Data Structures (~800 words, ~4800 chars)
 * Suitable for: chunking tests, multi-chunk operations, RAG tests
 */
export const DATA_STRUCTURES_LECTURE: FixtureDocument = {
  id: 'fixture-data-structures',
  title: 'Introduction to Data Structures',
  sourceType: 'text',
  language: 'en',
  content: `A data structure is a way of organizing and storing data in a computer so that it can be accessed and modified efficiently. Different data structures are suited for different kinds of applications. Some are highly specialized for specific tasks.

Arrays are the simplest data structure. They store elements in contiguous memory locations and provide constant-time access to any element by its index. However, inserting or deleting elements in the middle of an array requires shifting all subsequent elements, which takes linear time.

Linked lists consist of nodes where each node contains data and a reference to the next node. Singly linked lists have a single pointer to the next node, while doubly linked lists also have a pointer to the previous node. Linked lists allow constant-time insertions and deletions at known positions, but accessing an element by index takes linear time.

Stacks follow the Last-In-First-Out (LIFO) principle. Elements are added and removed from the top of the stack. This makes stacks ideal for undo operations in text editors, parsing expressions, and managing function calls in programming languages.

Queues follow the First-In-First-Out (FIFO) principle. Elements are added at the rear and removed from the front. Queues are used in breadth-first search algorithms, print spooling, and handling requests in web servers.

Trees are hierarchical data structures with a root node and child nodes. Binary trees have at most two children per node. Binary search trees maintain the property that for each node, all values in the left subtree are smaller and all values in the right subtree are larger. This enables efficient searching, insertion, and deletion operations.

Hash tables store key-value pairs and use a hash function to compute an index into an array of buckets. In the average case, hash tables provide constant-time lookup, insertion, and deletion. However, hash collisions can degrade performance to linear time in the worst case.

Choosing the right data structure depends on the specific requirements of your application. Consider factors such as the types of operations you need to perform, the expected data size, and the performance characteristics of each data structure.`,
  expectedChunkCount: 2,
  keyPhrases: [
    'contiguous memory locations',
    'Last-In-First-Out',
    'breadth-first search',
    'hash collisions',
  ],
}

/**
 * Edge case: Very short content (single sentence)
 * Tests that the system handles minimal content gracefully.
 */
export const VERY_SHORT_DOC: FixtureDocument = {
  id: 'fixture-very-short',
  title: 'Brief Note',
  sourceType: 'text',
  language: 'en',
  content: 'This is a very short document with only one sentence.',
  expectedChunkCount: 1,
  keyPhrases: ['very short document'],
}

/**
 * Edge case: Content with special characters and formatting
 * Tests sanitization and special character handling.
 */
export const SPECIAL_CHARS_DOC: FixtureDocument = {
  id: 'fixture-special-chars',
  title: 'Special Characters & Symbols',
  sourceType: 'text',
  language: 'en',
  content: `Special characters test: underscores_in_text, hyphens-in-text, and numbers 12345. 
Email address: test@example.com. URL: https://example.com/page?query=value&sort=asc. 
HTML entities: &amp; &lt; &gt; &quot;. Unicode: 你好世界 (Chinese), こんにちは (Japanese). 
Math symbols: ∑ ∫ π √ ∞ ≠. Code: const x = arr.filter((i) => i > 0).`, // NOTE: Despite containing a ".", this is still valid as the dot is inside a code expression.
  expectedChunkCount: 1,
  keyPhrases: ['test@example.com', 'https://', 'Unicode', 'Math symbols'],
}

/**
 * Edge case: Non-English content (German)
 * Tests language-agnostic processing.
 */
export const GERMAN_TEXT: FixtureDocument = {
  id: 'fixture-german',
  title: 'Deutsche Einführung',
  sourceType: 'text',
  language: 'de',
  content: `Die Photosynthese ist der Prozess, bei dem Pflanzen Lichtenergie in chemische Energie umwandeln. Dieser Prozess findet in den Chloroplasten statt, die Chlorophyll enthalten.

Die Photosynthese besteht aus zwei Hauptphasen: den lichtabhängigen Reaktionen und dem Calvin-Zyklus. Die lichtabhängigen Reaktionen benötigen Sonnenlicht und produzieren ATP und NADPH.

Mehrere Faktoren beeinflussen die Photosyntheserate. Dazu gehören Lichtintensität, Kohlenstoffdioxid-Konzentration und Temperatur.`,
  expectedChunkCount: 1,
  keyPhrases: ['Photosynthese', 'Chloroplasten', 'Calvin-Zyklus'],
}

/**
 * Edge case: Near-empty content
 * Tests handling of minimal/malformed content.
 */
export const NEAR_EMPTY_DOC: FixtureDocument = {
  id: 'fixture-near-empty',
  title: 'Empty',
  sourceType: 'text',
  language: 'en',
  content: '',
  expectedChunkCount: 0,
  keyPhrases: [],
}

/**
 * All fixtures in one array for iteration.
 */
export const ALL_FIXTURES: FixtureDocument[] = [
  PHOTOSYNTHESIS_LECTURE,
  DATA_STRUCTURES_LECTURE,
  VERY_SHORT_DOC,
  SPECIAL_CHARS_DOC,
  GERMAN_TEXT,
  NEAR_EMPTY_DOC,
]

/** Look up a fixture by ID */
export function getFixture(id: string): FixtureDocument | undefined {
  return ALL_FIXTURES.find((f) => f.id === id)
}
