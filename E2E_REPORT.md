# Lecture-to-Mastery

**Turn any lecture into a personalized study session — summaries, quizzes, flashcards, and an AI tutor that answers questions grounded in your material.**

Built for Next Byte Hacks V3

Generated on: July 1, 2026

---

## 1. Executive Summary

Lecture-to-Mastery is a web application that converts lecture material (PDF uploads or pasted text) into four active study tools: a structured summary, auto-generated flashcards, auto-generated multiple-choice quizzes, and a document-grounded RAG chat. The frontend is built with Vite, React 19, TypeScript 6, TanStack Router, Zustand, and Tailwind CSS. The backend uses Supabase (PostgreSQL 17 with the pgvector extension) and five Deno-based Edge Functions. All AI is powered by the Mistral API -- `mistral-embed` for vector embeddings (1024 dimensions) and `mistral-small-latest` for text generation with JSON-forced output. The app wins on technical complexity by combining pgvector cosine similarity search with a grounded-generation RAG pipeline inside serverless edge functions, all orchestrated through a single Mistral API key. For the hackathon, it scores on innovation (grounded RAG for study material), execution (five working edge functions with retry logic and validation), functionality (four complete study modalities), and presentation (polished Tailwind UI with responsive design, loading states, and toast notifications).

---

## 2. Problem & Context

Students preparing for exams spend hours re-reading lecture notes, manually highlighting passages, and handwriting flashcards. Passive review is inefficient: studies consistently show that active recall (quizzing), spaced repetition (flashcards), and self-explanation produce significantly better retention than re-reading. Existing tools fail to address this gap:

- **Generic AI chatbots** (ChatGPT, etc.) answer from general knowledge and frequently hallucinate, giving confident but incorrect answers that mislead students.
- **Flashcard apps** (Anki, Quizlet) require students to hand-craft every card -- a time-consuming process that many students skip.
- **Quiz generators** exist but typically produce shallow, generic questions unrelated to the specific lecture.
- **PDF highlighters** are passive -- they do not transform the material into study aids.

The social-good angle is clear: students on limited budgets cannot afford private tutors or premium study platforms. Lecture-to-Mastery runs on a single Mistral API key (free tier available) and Supabase free tier, making the marginal cost per student effectively zero. By grounding every AI output in the student's own lecture, it eliminates hallucination and delivers an experience closer to a subject-matter tutor than a generic chatbot.

---

## 3. Product Overview

### 3.1 Summary
One click generates a structured summary: a one-to-two-sentence TL;DR callout, 3-7 key bullet points, and a glossary of key terms with definitions. The system samples evenly across the document's chunks (up to 12 samples), sends them to Mistral with a strict JSON schema enforced via `response_format: json_object`, validates the output, and retries once on failure. Results are not persisted server-side -- each generation is ephemeral, and the user can regenerate freely.

### 3.2 Flashcards
The app generates N (default 10) question-answer flashcard pairs from the document. The system prompts Mistral for a JSON object containing a `flashcards` array, validates each card (non-empty front and back), retries once for any shortfall, deletes prior cards for the document, and inserts the new set into the `flashcards` table. The frontend implements a study flow: the user sees the front, clicks to flip, then self-rates the card (Again / Hard / Good / Easy). A session summary shows the distribution, and cards rated "Again" can be restudied in a second pass.

### 3.3 Quiz
The app generates N (default 8) multiple-choice questions, each with exactly 4 options, a `correct_index` (0-3), and an explanation string. The edge function uses the same sampling, JSON-schema prompting, validation, retry-once, delete-and-insert pattern as flashcards. The frontend provides a complete quiz-taking experience: progress bar, option selection with visual feedback, submission with correct/incorrect highlighting, explanation display, per-question review on the score screen, and Retake / Regenerate buttons.

### 3.4 RAG Chat
The RAG chat is the crown jewel. The user asks a natural-language question. The `rag-query` edge function embeds the question using `mistral-embed`, retrieves the top 5 most similar chunks via the `match_chunks` RPC (cosine similarity on pgvector), constructs a system prompt that instructs Mistral to answer _only_ from the provided context, and returns the generated answer plus source citations. If no relevant chunks are found, or the context does not contain the answer, the model is instructed to respond "I don't know based on this document." The frontend displays the answer with citation cards showing chunk index and a 140-character snippet beneath each.

---

## 4. User Journeys

### 4.1 First Upload + Indexing

1. User lands on the Library page (`/`). The `EmptyState` component renders with "No documents yet", a description, and two buttons: "Add Document" and "Load Demo".
2. User clicks "Add Document". The `UploadDialog` modal opens with two mode tabs: "Upload PDF" and "Paste text".
3. User selects **Upload PDF**, drags a file onto the dropzone (or clicks to browse), enters a title, and clicks "Add to Library".
4. The `UploadDialog` reads the PDF via `pdfjs-dist`, extracts text page by page using `getTextContent()`, and joins pages with double newlines.
5. The text is chunked client-side via `chunkText()` into ~800-character segments with ~100-character overlap.
6. A `documents` row is inserted via Supabase client with `{ title, source_type: 'pdf' }` (or `'text'`).
7. All chunk rows are inserted into `chunks` with `{ document_id, content, chunk_index, embedding: null }`.
8. The `embedDocument(doc.id)` call invokes the `embed-document` edge function, which batches chunks (32 per batch, 300ms delay between batches), sends them to Mistral `mistral-embed`, validates 1024-dimension vectors, and updates each chunk row's `embedding` column.
9. A success toast appears: `"<title> added successfully"`. The document card appears in the grid.
10. UI state during upload: dialog shows "Saving..." then "Indexing..." on the submit button. Both buttons and inputs are disabled. Errors display inline in red.

### 4.2 Studying via Summary

1. User clicks the document card on the Library page. TanStack Router navigates to `/doc/$docId`.
2. The workspace header shows the document title, source type badge, and creation date.
3. The tab bar shows four tabs: Summary (active by default), Flashcards, Quiz, Chat.
4. The `SummaryPanel` component calls `summarizeDocument(docId)` on mount (cached in state to avoid re-fetching on tab switch).
5. The `summarize-document` edge function loads all chunks for the document, samples up to 12 evenly across the document, builds a system prompt with strict JSON schema instructions, sends to Mistral with `response_format: json_object`, validates the response, and returns the structured summary.
6. The UI renders:
   - A purple-tinted TL;DR callout card at the top.
   - A "Key Points" list with checkmark SVG icons.
   - A "Key Terms" 2-column grid of term-definition cards.
   - A "Regenerate" ghost button at the bottom right.
7. During loading, a Spinner + skeleton pulse placeholders are shown. On error, a red banner with a Retry button appears.

### 4.3 Flashcards

1. User switches to the Flashcards tab. The `FlashcardPanel` component renders an idle `EmptyState` with a "Generate Flashcards" button.
2. User clicks "Generate Flashcards". The frontend calls `generateFlashcards(docId, 10)`, which invokes the `generate-flashcards` edge function.
3. The edge function samples chunks, prompts Mistral for `{ flashcards: [{ front, back }] }`, validates each card (non-empty strings), retries once for shortfall, deletes existing flashcards for the document, and inserts the new set.
4. The frontend then calls `fetchFlashcards(docId)` to retrieve `{ id, front, back }` rows from the `flashcards` table.
5. The study session begins. The user sees the front of card 1 with "Click to reveal answer" hint.
6. User clicks the card. It flips to show the back. Four rating buttons appear: Again (red), Hard (amber), Good (green), Easy (blue).
7. User rates the card. The progress bar advances. The next card appears.
8. After all cards are rated, a score screen shows counts per rating. If any cards were rated "Again", a "Restudy N cards" button lets the user re-study only those cards. A "Generate New Set" button regenerates.
9. Errors during generation show a red banner with the error message.

### 4.4 Taking a Quiz

1. User switches to the Quiz tab. The `QuizPanel` component renders an idle `EmptyState` with a "Generate Quiz" button.
2. User clicks "Generate Quiz". The frontend calls `generateQuiz(docId, 8)`, which invokes the `generate-quiz` edge function.
3. The edge function samples chunks, prompts Mistral for `{ questions: [{ question, options: [4 strings], correct_index, explanation }] }`, validates each question, retries once for shortfall, deletes existing questions for the document, and inserts the valid set.
4. The frontend then calls `fetchQuiz(docId)` to retrieve the questions.
5. The quiz starts. A progress bar shows question 1/N. The question text is displayed with 4 options (labeled A, B, C, D).
6. User clicks an option (it highlights in purple). User clicks "Submit Answer".
7. The UI shows: correct option highlighted green, wrong selection (if any) highlighted red, explanation card below the options.
8. User clicks "Next Question" (or "See Results" on the last question).
9. The score screen shows `correctCount / totalQuestions` with a message. Below is a per-question review list showing each question, whether it was correct, and the user's answer vs. correct answer for wrong ones.
10. Buttons: "Retake" (same questions, reset answers), "Regenerate" (new questions from AI).

### 4.5 RAG Chat

1. User switches to the Chat tab. The `ChatPanel` component renders an `EmptyState` in the center of the scrollable message area: "Ask about this document."
2. User types a question in the input field at the bottom and presses Enter (or clicks "Send").
3. The user's message appears as a right-aligned indigo bubble. A "Thinking..." left-aligned bubble with a Spinner appears.
4. The frontend calls `ragQuery(docId, question)`, which invokes the `rag-query` edge function.
5. The edge function:
   - Embeds the question via Mistral `mistral-embed` -> 1024-dim vector.
   - Calls `match_chunks(query_embedding, doc_id, 5)` RPC -> returns up to 5 chunk rows with content, chunk_index, and similarity score.
   - If 0 matches: returns `{ answer: "I don't know based on this document.", sources: [] }`.
   - Builds a context string from matched chunks, prefixed with `[chunk_index]`.
   - Constructs a system prompt that instructs Mistral to answer _only_ from the context.
   - Calls `mistral-small-latest` with `temperature: 0.2`.
   - Extracts the answer and builds a sources array with `{ chunkIndex, snippet }` (snippet = first 140 chars).
   - Returns `{ answer, sources }`.
6. The assistant bubble appears left-aligned with the answer text. Below it, source citation cards show `[chunkIndex] snippet...`.
7. If the user asks something outside the document (e.g., "What is the capital of France?"), the assistant responds "I don't know based on this document." with no sources.
8. The input field is disabled during loading. Errors show a red banner with a "Retry" button that resends the last question.

---

## 5. System Architecture

```
                               FRONTEND (Cloudflare Pages)
+-------------------------------------------------------------------------------+
|  Vite + React 19 + TypeScript 6  |  TanStack Router  |  Zustand  |  Tailwind  |
|                                                                               |
|  +----------+  +------------+  +--------------+  +--------+  +-------------+  |
|  | Library  |  |  Summary   |  |  Flashcards  |  |  Quiz  |  |  RAG Chat   |  |
|  |  Page    |  |   Panel    |  |    Panel     |  |  Panel |  |    Panel    |  |
|  +----------+  +------------+  +--------------+  +--------+  +-------------+  |
|       |              |                |               |              |        |
|       +--------------+----------------+---------------+--------------+        |
|                                    |                                         |
|                        +-----------v------------+                            |
|                        |  @supabase/supabase-js  |                            |
|                        |  (anon key, client-side) |                            |
|                        +-----------^------------+                            |
+------------------------------------+-----------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------------+
|                         SUPABASE (Managed Cloud)                               |
|                                                                               |
|  +------------------------------------------------------------------------+  |
|  |                     PostgreSQL 17 + pgvector                            |  |
|  |                                                                         |  |
|  |  +--------------+  +------------------+  +---------------+             |  |
|  |  |  documents   |  |     chunks       |  | quiz_questions|             |  |
|  |  |  (table)     |--|  (table + vec)   |  |   (table)     |             |  |
|  |  +------^-------+  +--------^---------+  +-------^-------+             |  |
|  |         |                   |                     |                     |  |
|  |         +-------------------+---------------------+                     |  |
|  |                              |                                         |  |
|  |                    +---------v----------+                               |  |
|  |                    |    flashcards      |                               |  |
|  |                    |     (table)        |                               |  |
|  |                    +--------------------+                               |  |
|  |                                                                         |  |
|  |  RPC: match_chunks(query_embedding, doc_id, match_count)               |  |
|  |       -> returns (id uuid, content text, chunk_index int,               |  |
|  |                    similarity float)                                    |  |
|  |       Uses ivfflat index on chunks.embedding with vector_cosine_ops    |  |
|  +------------------------------------------------------------------------+  |
|                                     |                                       |
|  +------------------------------------------------------------------------+  |
|  |                     Edge Functions (Deno 2)                            |  |
|  |                                                                         |  |
|  |  +-----------------+  +-----------------+  +--------------------------+ |  |
|  |  | embed-document  |  |   rag-query     |  |  summarize-document     | |  |
|  |  | Input: docId    |  | Input: docId,   |  |  Input: docId           | |  |
|  |  | Calls: Mistral  |  |   question      |  |  Calls: Mistral chat    | |  |
|  |  |   embed (batch) |  | Calls: embed +  |  |  Output: JSON summary   | |  |
|  |  | Updates: chunks |  |   chat + RPC    |  |  (ephemeral)            | |  |
|  |  |   .embedding    |  | Output: answer  |  +--------------------------+ |  |
|  |  +-----------------+  |   + sources[]   |  +--------------------------+ |  |
|  |                       +-----------------+  |  generate-flashcards     | |  |
|  |  +-----------------+  +-----------------+  |  Input: docId, count     | |  |
|  |  | generate-quiz   |  | rag-query (cont)|  |  Calls: Mistral chat    | |  |
|  |  | Input: docId,   |  |   Full path:    |  |  Persists: flashcards   | |  |
|  |  |   count         |  |   question ->   |  |  table                   | |  |
|  |  | Calls: Mistral  |  |   embed question|  +--------------------------+ |  |
|  |  |   chat +        |  |   -> match_chunks|                              |  |
|  |  |   validate JSON |  |   -> context ->  |                              |  |
|  |  | Persists: quiz  |  |   Mistral chat   |                              |  |
|  |  |   _questions    |  |   -> answer + src|                              |  |
|  |  +-----------------+  +-----------------+                              |  |
|  +------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                     |
                                     v
                   +------------------------------------+
                   |          Mistral AI API             |
                   |  https://api.mistral.ai/v1/         |
                   |                                    |
                   |  POST /embeddings                   |
                   |    - model: mistral-embed           |
                   |    - output: 1024-dim vector        |
                   |                                    |
                   |  POST /chat/completions             |
                   |    - model: mistral-small-latest    |
                   |    - response_format: json_object   |
                   |    - temperature: 0.2               |
                   +------------------------------------+
```

### Component Walkthrough

**Frontend (Cloudflare Pages):**
- `src/main.tsx` -- Entry point. Initializes the TanStack Router with a route tree of three routes: `__root` (layout with Sidebar), `index` (Library), and `doc.$docId` (Document workspace).
- `src/routes/__root.tsx` -- Root layout: Sidebar on the left, `<Outlet />` for child routes, ToastContainer for notifications.
- `src/routes/index.tsx` -- Library page. Displays a document grid or an EmptyState. Handles demo loading, PDF/text upload via `UploadDialog`.
- `src/routes/doc.$docId.tsx` -- Document workspace. Contains SummaryPanel, FlashcardPanel, QuizPanel, and ChatPanel. Tab switching via `Tabs` component.
- `src/stores/useAppStore.ts` -- Zustand store for documents array and loading state. `fetchDocuments()` reads from Supabase `documents` table.
- `src/lib/supabase.ts` -- Initializes Supabase client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/lib/api.ts` -- Client wrappers for invoking each edge function via `supabase.functions.invoke()`.
- `src/lib/chunk.ts` -- Pure function for text chunking.
- `src/lib/demoContent.ts` -- A ~2000-word lecture on Data Structures for the one-click demo.
- Components: Badge, Button, Card, EmptyState, Sidebar, Spinner, Tabs, Toast, UploadDialog -- all reusable, with TypeScript interfaces.

**Supabase Database:**
- PostgreSQL 17 with pgvector extension.
- Four tables: `documents`, `chunks` (with `vector(1024)` column), `flashcards`, `quiz_questions`.
- One RPC function: `match_chunks()` for cosine similarity search.
- One IVFFlat index on `chunks.embedding` with 100 lists.

**Supabase Edge Functions (Deno 2):**
- Five functions: `embed-document`, `rag-query`, `summarize-document`, `generate-flashcards`, `generate-quiz`.
- All use the Supabase service-role key (server-side) to bypass RLS.
- All implement CORS headers for OPTIONS preflight.
- All read `MISTRAL_API_KEY` from Deno.env.

**Mistral API:**
- Two endpoints used:
  - `POST /v1/embeddings` with model `mistral-embed` -> 1024-dim vector.
  - `POST /v1/chat/completions` with model `mistral-small-latest`, `response_format: json_object` for generation functions, `temperature: 0.2`.

### Full Request Path: RAG Query

1. User types "What is Big-O notation?" and presses Enter.
2. `ChatPanel.handleSend()` -> creates user message bubble -> calls `ragQuery(docId, question)`.
3. `ragQuery()` calls `supabase.functions.invoke('rag-query', { body: { documentId, question } })`.
4. Supabase routes to the deployed `rag-query` edge function.
5. The function reads `documentId` and `question` from the request body.
6. It creates a Supabase admin client (service-role key).
7. It calls Mistral `POST /v1/embeddings` with `input: [question]`, model `mistral-embed`.
8. It validates the response: must have `data[0].embedding` of length 1024.
9. It calls `supabase.rpc('match_chunks', { query_embedding, doc_id: documentId, match_count: 5 })`.
10. It checks the returned rows. If 0, returns `{ answer: "I don't know based on this document.", sources: [] }`.
11. It builds a context string: `[0] chunk content\n\n[1] chunk content\n\n...`.
12. It constructs a system prompt with grounding instructions ("ONLY on the provided document context... If the context does not contain the answer, reply exactly 'I don't know based on this document.'").
13. It calls Mistral `POST /v1/chat/completions` with the system prompt and user question, `temperature: 0.2` (no `json_object` -- free text answer).
14. It extracts the answer from `choices[0].message.content`.
15. It builds a `sources` array from the matched chunks (snippet = first 140 chars).
16. It returns `{ answer, sources }` as JSON with CORS headers.
17. The frontend receives the response, creates an assistant message bubble, and renders the answer + source citations.
18. The input field re-enables. The "Thinking..." spinner is removed.

---

## 6. Data Model

### Table: `documents`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Auto-generated |
| `title` | `text` | `NOT NULL` | User-provided title |
| `source_type` | `text` | `NOT NULL DEFAULT 'pdf'` | Either `'pdf'` or `'text'` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | Auto-set on insert |

### Table: `chunks`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Auto-generated |
| `document_id` | `uuid` | `NOT NULL REFERENCES documents(id) ON DELETE CASCADE` | FK to documents |
| `content` | `text` | `NOT NULL` | The chunk text (~800 chars) |
| `chunk_index` | `int` | `NOT NULL` | Ordinal position in document (0-based) |
| `embedding` | `vector(1024)` | nullable | Mistral-embed output; set by embed-document |

**Index:**
```sql
CREATE INDEX idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

The IVFFlat (Inverted File with Flat) index partitions the vector space into 100 lists (centroids) using k-means during creation. At query time, only the nearest lists (determined by the index's `probes` parameter, default 1) are searched, trading a small accuracy loss for significant speedup over brute-force. `vector_cosine_ops` specifies that the index uses cosine distance, matching the `<=>` operator used in the `match_chunks` RPC.

### Table: `flashcards`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Auto-generated |
| `document_id` | `uuid` | `NOT NULL REFERENCES documents(id) ON DELETE CASCADE` | FK to documents |
| `front` | `text` | `NOT NULL` | Question or term (shorter) |
| `back` | `text` | `NOT NULL` | Answer or definition |
| `ease` | `real` | `NOT NULL DEFAULT 2.5` | SM-2 ease factor (reserved, not yet used) |
| `interval_days` | `int` | `NOT NULL DEFAULT 0` | SM-2 interval (reserved, not yet used) |
| `due_at` | `timestamptz` | `NOT NULL DEFAULT now()` | SM-2 next review date (reserved, not yet used) |

### Table: `quiz_questions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Auto-generated |
| `document_id` | `uuid` | `NOT NULL REFERENCES documents(id) ON DELETE CASCADE` | FK to documents |
| `question` | `text` | `NOT NULL` | Question text |
| `options` | `jsonb` | `NOT NULL` | Array of 4 strings |
| `correct_index` | `int` | `NOT NULL` | 0-3, index into options array |
| `explanation` | `text` | nullable | Explanation of the correct answer |

### RPC: `match_chunks`

```sql
CREATE FUNCTION match_chunks(
  query_embedding vector(1024),
  doc_id uuid,
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, content text, chunk_index int, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    content,
    chunk_index,
    1 - (embedding <=> query_embedding) AS similarity
  FROM chunks
  WHERE document_id = doc_id
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

Semantics: Computes cosine distance (`<=>` operator) between the query embedding and each chunk's embedding, filters to only chunks belonging to the specified document, orders by distance ascending (most similar first), returns up to `match_count` rows, and converts distance to similarity via `1 - distance` (so 1.0 = identical, 0.0 = orthogonal/opposite).

### Relationships

```
documents (1) ---< (N) chunks
documents (1) ---< (N) flashcards
documents (1) ---< (N) quiz_questions
```

All child tables have `ON DELETE CASCADE` -- deleting a document removes all its chunks, flashcards, and quiz questions.

---

## 7. RAG Pipeline (Deep Dive)

### 7.1 Ingestion

1. **PDF path:** `UploadDialog` reads the file via `pdfjs-dist`. For each page, it calls `page.getTextContent()` and joins `item.str` fields with spaces. Pages are joined with double newlines.
2. **Text path:** The pasted text is used as-is.
3. **Minimum length check:** Both paths require >= 200 characters. If the PDF produces less text, the user is prompted to use the "Paste text" mode instead.

### 7.2 Chunking Parameters

The `chunkText()` function in `src/lib/chunk.ts`:

- Target size: ~800 characters per chunk.
- Overlap: ~100 characters between adjacent chunks.
- Algorithm: Splits on sentence boundaries (period, exclamation, question mark followed by space or end). Accumulates sentences until adding the next sentence would exceed 800 characters. Walks backward from the end of the chunk to find ~100 characters of overlap, then starts the next chunk from that overlap boundary.
- Pure function, no external dependencies.

Example: A 4000-character document with 40 sentences would produce approximately 5-6 chunks depending on sentence length distribution.

### 7.3 Embedding (Batch)

The `embed-document` edge function:

1. Queries `chunks` for the document where `embedding IS NULL`, ordered by `chunk_index`.
2. Processes in batches of 32 (`BATCH_SIZE = 32`).
3. For each batch, sends `POST /v1/embeddings` with `model: mistral-embed`, `input: [texts]`.
4. Validates response: `result.data` must exist, length must equal batch length, each `data[j].embedding` must exist and have length exactly 1024.
5. Updates each chunk's `embedding` column via `supabase.from('chunks').update({ embedding: emb }).eq('id', id)`.
6. Waits 300ms between batches (`RATE_LIMIT_DELAY_MS = 300`).
7. Tracks failures per chunk: if Mistral returns an error for a batch, or if validation fails, the chunk indices are reported in `failedIndexes`.
8. Returns `{ ok, embedded, failedCount, failedIndexes }`.

The 300ms delay is a conservative rate-limit measure for Mistral's free/developer tier. The 32-batch size balances throughput against the Mistral embedding model's input limit.

### 7.4 Retrieval (match_chunks top-5)

In the `rag-query` edge function:

1. The user's question is embedded with the same `mistral-embed` model (single input, not batched).
2. The resulting 1024-dim vector is passed to `match_chunks(query_embedding, doc_id, 5)`.
3. The RPC returns up to 5 chunk rows: `id`, `content`, `chunk_index`, `similarity` (cosine similarity, 0.0 to 1.0).
4. If 0 chunks are returned, the function short-circuits and returns `"I don't know based on this document."`.

### 7.5 Grounded Generation

1. Context is built from the matched chunks: each chunk is formatted as `[chunk_index] chunk_content`, joined with double newlines.
2. The system prompt is:
   ```
   You are a helpful study assistant. Answer the user's question based ONLY on the provided document context below. If the context does not contain the answer, reply exactly "I don't know based on this document." Never use outside knowledge. Never make up information.

   Document context:
   [0] first chunk content...
   [2] second chunk content...
   ```
3. `mistral-small-latest` is called with `temperature: 0.2` (low temperature for factual precision), no `json_object` (free-text answer).
4. Answer is extracted from `choices[0].message.content`.
5. Sources are built: each matched chunk's first 140 characters as `snippet`, plus the `chunk_index`.

### Exact JSON Shapes (rag-query)

**Request to edge function:**
```json
{
  "documentId": "uuid-string",
  "question": "What is Big-O notation?"
}
```

**Successful response:**
```json
{
  "answer": "Big-O notation is the language used to describe the efficiency of algorithms. It describes the upper bound of an algorithm's growth rate as the input size increases toward infinity. It ignores constant factors and focuses on the dominant term.",
  "sources": [
    {
      "chunkIndex": 2,
      "snippet": "Big-O notation is the language we use to describe the efficiency of algorithms. It describes the upper bound of an algorithm's growth rate as the input size increas"
    },
    {
      "chunkIndex": 1,
      "snippet": "A linked list solves the sizing problem of arrays by using a completely different approach to memory layout. Instead of storing elements contiguously, each element"
    }
  ]
}
```

**Empty retrieval response:**
```json
{
  "answer": "I don't know based on this document.",
  "sources": []
}
```

**Error response:**
```json
{
  "answer": "",
  "sources": [],
  "error": "Embedding API error: 429 Too Many Requests"
}
```

---

## 8. AI Feature Contracts

All three generation functions (`summarize-document`, `generate-flashcards`, `generate-quiz`) follow the same pattern:
1. Load chunks for the document, sample up to 12 evenly.
2. Build a system prompt with the exact JSON schema demanded via `response_format: json_object`.
3. Call Mistral `chat/completions` with `model: mistral-small-latest`, `temperature: 0.2`.
4. Parse the JSON response.
5. Validate against a schema-specific function.
6. If validation fails, retry once.
7. If retry also fails, throw an error.

### 8.1 summarize-document

**System prompt:** Instructs Mistral to output ONLY valid JSON with this exact shape:
```json
{
  "tldr": "one or two sentence summary of the entire document",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "keyTerms": [
    {"term": "term name", "definition": "brief definition"}
  ]
}
```

**Validation rules (`validateSummary`):**
- `tldr`: must be non-empty string.
- `keyPoints`: must be array of 3-7 strings. Each element must be a string.
- `keyTerms`: must be array. Each element must have string `term` and string `definition`.

**Retry behavior:** If `callMistral()` throws (Mistral API error, non-JSON response, or validation failure), retry exactly once with the same prompt. If retry fails, throw the final error.

**Persistence:** None. The summary is returned directly in the edge function response and displayed in the UI. Regenerating calls the function again.

### 8.2 generate-flashcards

**System prompt:** Instructs Mistral to output ONLY valid JSON with this exact shape:
```json
{
  "flashcards": [
    {
      "front": "concise question or term",
      "back": "clear answer or definition"
    }
  ]
}
```

The prompt includes the requested count (default 10) and instructions that each card should test understanding of a key concept, term, or relationship.

**Validation rules (`validateFlashcard`):**
- `front`: non-empty string.
- `back`: non-empty string.

**Retry behavior:**
1. First attempt: call Mistral with requested count. Filter valid cards.
2. If valid cards < requested count: compute shortfall, call Mistral again with the shortfall count and an extra instruction: "Previously generated X valid flashcards. Generate Y more."
3. The second call may throw; if so, use whatever valid cards were obtained from the first call.
4. If 0 valid cards after retry, throw an error.

**Persistence:** Deletes all existing flashcards for the document (`supabase.from('flashcards').delete().eq('document_id', documentId)`), then inserts the valid cards.

### 8.3 generate-quiz

**System prompt:** Instructs Mistral to output ONLY valid JSON with this exact shape:
```json
{
  "questions": [
    {
      "question": "question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "why this answer is correct"
    }
  ]
}
```

The prompt includes the requested count (default 8), the rule that each question must have exactly 4 options, and that `correct_index` must be 0-3.

**Validation rules (`validateQuestion`):**
- `question`: non-empty string.
- `options`: array of exactly 4 strings, each non-empty.
- `correct_index`: integer, 0-3 inclusive.
- `explanation`: non-empty string.

**Retry behavior:** Same as flashcards: first attempt, shortfall retry if needed, throw if 0 valid after retry.

**Persistence:** Deletes all existing quiz questions for the document, then inserts the valid questions.

---

## 9. API Surface

All edge functions are deployed to Supabase and invoked via `supabase.functions.invoke('<name>', { body })`.

All functions accept `OPTIONS` preflight and return CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

All functions use the Supabase service-role key (server-side) to bypass Row-Level Security.

| Function | Input JSON | Output JSON (success) | Side Effects | Error Modes |
|----------|-----------|----------------------|--------------|-------------|
| `embed-document` | `{ documentId: string }` | `{ ok: true, embedded: number, failedCount: number, failedIndexes: number[] }` | Updates `chunks.embedding` for the document | Missing env vars, Mistral API error/rate-limit, invalid embedding dimensions |
| `rag-query` | `{ documentId: string, question: string }` | `{ answer: string, sources: [{ chunkIndex: number, snippet: string }] }` | None (read-only) | Missing env vars, Mistral API error (embed or chat), invalid embedding, empty question |
| `summarize-document` | `{ documentId: string }` | `{ tldr: string, keyPoints: string[], keyTerms: [{ term: string, definition: string }] }` | None (ephemeral) | Missing env vars, Mistral API error, invalid JSON, validation failure after retry, no chunks |
| `generate-flashcards` | `{ documentId: string, count?: number }` | `{ ok: true, inserted: number }` | Deletes + inserts rows in `flashcards` table | Missing env vars, Mistral API error, invalid JSON, 0 valid cards after retry, no chunks |
| `generate-quiz` | `{ documentId: string, count?: number }` | `{ ok: true, inserted: number }` | Deletes + inserts rows in `quiz_questions` table | Missing env vars, Mistral API error, invalid JSON, 0 valid questions after retry, no chunks |

Error responses all return HTTP 500 with:
```json
{ "ok": false, "error": "description" }
```
(For `rag-query` and `summarize-document`, the error key is just `"error"`.)

---

## 10. Security & Privacy

### 10.1 Secret Handling

`MISTRAL_API_KEY` is set as a Supabase secret:
```bash
npx supabase secrets set MISTRAL_API_KEY=<key>
```

It is accessed server-side only, inside edge functions, via `Deno.env.get('MISTRAL_API_KEY')`. It is never sent to the frontend. The frontend has no direct access to Mistral -- all AI calls go through edge functions.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also accessed via `Deno.env.get()` in each edge function. They are auto-injected by Supabase for hosted functions.

Frontend env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are public by nature -- the anon key is designed to be client-side and is restricted by RLS.

### 10.2 Client/Anon vs Service-Role Boundary

- **Client (anon key):** Used in the browser for direct Supabase queries (`documents` SELECT/INSERT, `chunks` INSERT). Protected by Row-Level Security.
- **Service-role key:** Used in edge functions only. Bypasses RLS. Required for write operations that the client should not perform directly (updating embeddings, bulk deletes/inserts for flashcards and quiz questions).

### 10.3 RLS Posture (Demo)

For the hackathon demo, RLS is **not configured** on any table. This means:
- The anon key can perform any operation on any table.
- This is acceptable for a demo/solo-build context where there is no multi-user auth.

**How to harden for production:**
1. Enable RLS on all four tables:
   ```sql
   ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
   ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
   ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
   ```
2. Create policies that allow users to read/write only their own documents:
   ```sql
   -- Add user_id column to documents
   ALTER TABLE documents ADD COLUMN user_id uuid REFERENCES auth.users(id);

   -- Policy for documents
   CREATE POLICY "Users manage own documents" ON documents
     FOR ALL USING (auth.uid() = user_id);

   -- For child tables, use subquery
   CREATE POLICY "Users manage own chunks" ON chunks
     FOR ALL USING (
       document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
     );
   ```
3. For edge functions, the service-role key continues to bypass RLS, which is correct.

### 10.4 Input-Size Limits

- PDF upload: limited by browser memory (typically 100s of MB before issues) and pdfjs-dist performance.
- Pasted text: no explicit limit, but the `chunkText` function processes the entire string in memory.
- RAG query question: no explicit limit in the edge function, but Mistral's chat model has a context window (typically 32k tokens).

### 10.5 Abuse / Rate-Limit Considerations

- **Mistral API rate limits:** Mistral free/developer tiers have per-minute rate limits. The `embed-document` function mitigates this with a 300ms delay between batches. Generation functions (`summarize-document`, `generate-flashcards`, `generate-quiz`) make 1-2 calls per request and have no built-in delay.
- **Supabase rate limits:** Free tier Supabase projects have rate limits on edge function invocations and database requests. If a user rapidly generates quizzes, they may hit these limits.
- **No per-user rate limiting:** Since the demo has no auth, there is no way to rate-limit per user. A malicious actor could repeatedly hit the edge functions and run up Mistral API costs.
- **Mitigation strategies:** Add Supabase WAF rules, implement per-IP rate limiting via Supabase Auth or a middleware, or add user authentication to gate access.

---

## 11. Error Handling & Resilience

### 11.1 Failure Modes per Feature

| Failure Mode | Feature(s) | User-Facing Handling | System-Level Handling |
|-------------|-----------|---------------------|----------------------|
| Bad PDF (corrupt, image-only, password-protected) | Upload | Error message: "Failed to read PDF: [details]" from UploadDialog | `pdfjs-dist` throws; caught in try/catch, error shown to user |
| Empty text (< 200 chars) | Upload | Error message: "Please paste at least 200 characters." (or PDF-specific variant) | Client-side check before any API calls |
| Mistral timeout | All AI features | Error banner with "Retry" button | Edge function throws after fetch timeout; Supabase functions have a default 60s timeout |
| Mistral rate limit (429) | All AI features | Error banner with "Retry" button | Mistral returns HTTP 429; edge function catches and re-throws as `Mistral API error: 429 ...`. `embed-document` continues to next batch (skips failed batch). |
| Mistral server error (5xx) | All AI features | Error banner with "Retry" button | Caught and re-thrown. `embed-document` skips the batch. |
| Invalid AI JSON | summarize-document, generate-flashcards, generate-quiz | Error banner with description | `JSON.parse` throws -> caught -> retry once. If retry fails, re-thrown. |
| Empty retrieval (no matching chunks) | RAG Chat | "I don't know based on this document." | `match_chunks` returns 0 rows -> short-circuit response |
| Database connection error | All | Error banner with "Retry" button | `supabase.from()` throws -> caught -> returned as HTTP 500 |
| Missing env vars | All AI features | Error banner | Edge function throws before making any Mistral calls |

### 11.2 User-Facing Error States in Code

- **UploadDialog:** Red error banner below the submit area. Shows specific messages for: missing title, no file, wrong file type, PDF read failure, short text, insert failure, indexing failure.
- **SummaryPanel:** Red error banner with Retry button. On initial load error, the banner replaces the loading state. On regenerate error, the banner appears above the summary.
- **FlashcardPanel:** Red error banner with error message. Generation errors show in idle state. Study session errors show below the card.
- **QuizPanel:** Red error banner. Generation errors show in idle state. Taking-a-quiz errors show below the options.
- **ChatPanel:** Red error banner with "Retry" button. The retry button resends the last question. The "Thinking..." spinner is hidden when the error appears.
- **Toast system:** Global toast notifications for success (green) and error (red) via `showToast(type, message)`. Auto-dismiss after 4 seconds.

---

## 12. Performance & Cost

### 12.1 Where Latency Lives

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Chunking (client-side) | < 10ms | Pure JS, synchronous |
| Document/chunk insert (Supabase) | 50-200ms | Network round-trip |
| Embedding (per chunk, batched 32) | ~500ms per batch | Mistral `mistral-embed` is fast |
| Full document indexing (10 chunks) | ~3-5 seconds | 1 batch + 300ms delay |
| Full document indexing (100 chunks) | ~6-8 seconds | 4 batches + 3 x 300ms delays |
| RAG query (embed + RPC + chat) | 2-4 seconds | Slowest: Mistral chat generation |
| Summary generation | 5-10 seconds | Mistral chat with large context |
| Quiz generation (8 questions) | 8-15 seconds | May do 2 Mistral calls (retry path) |
| Flashcard generation (10 cards) | 8-15 seconds | May do 2 Mistral calls (retry path) |

### 12.2 Batching Strategy

`embed-document` uses batch size 32 with 300ms delay between batches. This is a deliberate trade-off:
- **Larger batch (e.g., 64):** Faster total time, but more tokens lost if a single batch fails.
- **Smaller batch (e.g., 16):** More granular error recovery, but more total requests and higher overhead.
- **300ms delay:** Empirical rate-limit avoidance for Mistral's free tier. Can be reduced to 100ms or removed entirely on a paid plan.

### 12.3 Token / Cost Drivers

All costs flow through Mistral API. Supabase free tier covers the database and edge function invocations.

| Model | Pricing (approx) | Usage |
|-------|------------------|-------|
| `mistral-embed` | ~$0.10 per 1M tokens | Used for embedding chunks and questions. A 1000-word lecture (~7k chars = ~1.5k tokens) produces ~2 chunks x 32 batch = negligible cost. |
| `mistral-small-latest` (input) | ~$0.20 per 1M tokens | Summary: ~12 chunks x ~200 tokens = 2400 input tokens. Quiz: similar. RAG chat: depends on matched chunks + user question. |
| `mistral-small-latest` (output) | ~$0.60 per 1M tokens | Summary output: ~500 tokens. Quiz output: ~2000 tokens (8 questions * 250 tokens). Flashcard output: ~1500 tokens. |

**Estimated cost per study session:**
- Document indexing (20 chunks): ~1 API call to embed (1 batch) = < $0.001.
- Summary generation: 1 API call = ~$0.001.
- Quiz generation (8 questions): 1-2 API calls = ~$0.002.
- 10 RAG queries: 10 embed calls + 10 chat calls = ~$0.005.
- Total per lecture session: ~$0.01.

### 12.4 Cost-Control Levers

1. **Reduce batch size** in embed-document to 16 (more conservative, slower, but fewer tokens per failed batch).
2. **Reduce match_count** in rag-query from 5 to 3 (fewer tokens in context, faster, but potentially less grounded answers).
3. **Disable retry** for quiz/flashcard generation (accept fewer valid items).
4. **Reduce requested count** for quizzes (default 8) and flashcards (default 10) -- user-configurable.
5. **Cache summaries** per document version to avoid regenerating on every tab switch (currently not cached server-side; frontend caches in state per session).
6. **Set a Mistral usage limit** (Mistral console allows setting spend caps).

---

## 13. Testing & QA

### 13.1 Pre-Demo Smoke-Test Checklist

```
[ ] Load Demo
    [ ] Click "Load Demo" button on Library page
    [ ] Toast: "Demo document added! Indexing in progress..."
    [ ] Document card appears: "Data Structures: Arrays, Linked Lists & Big-O"
    [ ] Badge shows "text" source type
    [ ] Wait ~15 seconds for indexing

[ ] Summary Tab
    [ ] Click document card -> workspace opens
    [ ] Summary tab auto-loads with TL;DR, Key Points, Key Terms
    [ ] Click "Regenerate" -> new summary loads
    [ ] Loading skeleton shows during generation

[ ] Quiz Tab
    [ ] Switch to Quiz tab
    [ ] Click "Generate Quiz" -> loading spinner -> 8 questions appear
    [ ] Progress bar shows question 1/8
    [ ] Select answer -> "Submit Answer" enabled
    [ ] Click "Submit Answer" -> correct/incorrect highlight + explanation
    [ ] Click "Next Question" through all 8
    [ ] Score screen: correct count, per-question review
    [ ] "Retake" resets with same questions
    [ ] "Regenerate" creates new questions

[ ] Flashcards Tab
    [ ] Switch to Flashcards tab
    [ ] Click "Generate Flashcards" -> loading spinner -> cards appear
    [ ] Click card -> flips to show back
    [ ] Rating buttons appear: Again, Hard, Good, Easy
    [ ] Rate each card -> progress bar advances
    [ ] Score screen with rating breakdown
    [ ] "Restudy N cards" filters to "Again" cards only
    [ ] "Generate New Set" creates new cards

[ ] RAG Chat Tab
    [ ] Switch to Chat tab
    [ ] Ask "What is Big-O notation?" -> answer appears with source citations
    [ ] Ask "What is the difference between arrays and linked lists?" -> grounded answer
    [ ] Ask "What is the capital of France?" -> "I don't know based on this document."
    [ ] Empty state shows when no messages exist
    [ ] "Thinking..." indicator during loading
    [ ] Error state: retry button resends last question

[ ] General UX
    [ ] Toast notifications on success/error
    [ ] Loading spinners during async operations
    [ ] Error states show friendly messages + Retry
    [ ] Sidebar navigation works
    [ ] Mobile responsive: sidebar collapses
    [ ] 360px viewport: no overflow, all content visible
```

### 13.2 Manual Test Cases

| Test Case | Input | Steps | Expected Result |
|-----------|-------|-------|-----------------|
| Upload PDF | A valid PDF (e.g., lecture slides saved as PDF) | 1. Click "Add Document". 2. Click "Upload PDF". 3. Select PDF. 4. Enter title. 5. Click "Add to Library". | Document appears in grid. After indexing (~15s), clicking document shows all 4 features working. |
| Upload text | 500+ chars of lecture text | 1. Click "Add Document". 2. Click "Paste text". 3. Paste text. 4. Enter title. 5. Submit. | Same as above. |
| Short text (< 200 chars) | "Hello world" | Paste and submit. | Error: "Please paste at least 200 characters." |
| Non-PDF file | A .txt file renamed to .pdf | Upload via PDF mode. | Error: "File must be a PDF." (detected by MIME type or extension check) |
| Generate quiz with short document | A 300-char document | 1. Upload. 2. Wait for indexing. 3. Generate quiz. | Quiz generates with fewer than 8 questions (Mistral does its best). Validation accepts whatever Mistral produces. |
| RAG question outside document | "What is the meaning of life?" | Ask in Chat tab. | Answer: "I don't know based on this document." with no sources. |
| Rapid quiz generation | Click "Generate Quiz" 5 times in a row. | 1. Switch to Quiz tab. 2. Click Generate repeatedly. | First request starts. Subsequent requests may hit Mistral rate limits. Error displayed when 429 occurs. |
| Empty document | Upload a document with 0 chunks (should not happen due to 200-char check, but test edge case). | N/A | Not reachable via UI. Edge function returns "No chunks found" error. |
| PDF with special characters | A PDF containing math symbols, Unicode, or code. | Upload and index. | Chunks should preserve special characters. Summary/quiz/chat should handle them. |
| Very long document (50+ pages) | A 10k+ word document (e.g., a textbook chapter). | Upload. | Indexing takes longer (multiple batches + delays). Summary samples 12 chunks. Quiz/chat work on sampled content. |
| Browser refresh during quiz | User is mid-quiz. | Refresh the page. | Quiz state is lost (stored in React state, not persisted). User must regenerate. This is expected behavior for the demo. |

---

## 14. Deployment & Ops

### 14.1 Frontend (Cloudflare Pages)

**Build command:** `npm run build` (runs `tsc -b && vite build`)

**Output directory:** `dist/`

**Environment variables (required):**
| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://<project-id>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<anon-key-from-supabase-dashboard>` |

**Deploy steps:**
1. Build locally: `npm run build`
2. Deploy via Wrangler CLI:
   ```bash
   npx wrangler pages deploy dist/ --project-name lecture-to-mastery
   npx wrangler pages secret put VITE_SUPABASE_URL
   npx wrangler pages secret put VITE_SUPABASE_ANON_KEY
   ```
3. Alternatively, upload `dist/` through the Cloudflare Dashboard (Workers & Pages > Create > Pages > Direct Upload).

**Rollback:** Cloudflare Pages retains deployment history. In the dashboard, view "Deployments" and click "Rollback" on a previous successful deployment.

### 14.2 Backend (Supabase)

**Database migration:**
```bash
npx supabase link --project-ref <project-id>
npx supabase db push
```
This applies `0001_init.sql` (creates tables, extension, index, RPC) and `0002_add_chunk_index_to_match.sql` (updates RPC to include `chunk_index`).

**Edge function deployment:**
```bash
npx supabase functions deploy embed-document
npx supabase functions deploy rag-query
npx supabase functions deploy summarize-document
npx supabase functions deploy generate-flashcards
npx supabase functions deploy generate-quiz
```

**Set secrets:**
```bash
npx supabase secrets set MISTRAL_API_KEY=<your-mistral-api-key>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase for hosted functions.

**Verify:**
```bash
npx supabase functions list
```

**Rollback:** Re-deploy a previous version of the function from your local git history:
```bash
git checkout <previous-commit> -- supabase/functions/<name>/index.ts
npx supabase functions deploy <name>
```

### 14.3 Environment Variables Reference

| Variable | Where Set | Used By | Purpose |
|----------|-----------|---------|---------|
| `VITE_SUPABASE_URL` | Frontend (Cloudflare Pages env / `.env` file) | `src/lib/supabase.ts` | Supabase project URL for client |
| `VITE_SUPABASE_ANON_KEY` | Frontend (Cloudflare Pages env / `.env` file) | `src/lib/supabase.ts` | Supabase anon key for client |
| `SUPABASE_URL` | Auto-injected by Supabase for hosted functions | Edge functions | Supabase project URL for service-role client |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase for hosted functions | Edge functions | Service-role key (bypasses RLS) |
| `MISTRAL_API_KEY` | `supabase secrets set` | All 5 edge functions | Mistral AI API authentication |

---

## 15. Hackathon Judging Alignment

| Criterion (25% each) | How Lecture-to-Mastery Scores | Specific Features / Decisions | Biggest Risk |
|---------------------|-------------------------------|------------------------------|--------------|
| **Innovation** | Combines pgvector RAG with grounded LLM generation in a study-tool context. The "I don't know" fallback, source citations, and chunk-index tracking are deliberate design choices not found in generic study tools. | RAG pipeline with chunk-level source attribution; mistral-embed for domain-specific embeddings; SM-2 reserved columns in schema for future spaced repetition; hybrid PDF+text ingestion | Generic "AI study tool" label -- judges may not immediately distinguish from ChatGPT wrappers. Mitigation: Demo the grounding ("What is the capital of France?" -> refusal) to prove document-specificity. |
| **Technical Complexity** | Five Deno edge functions with CORS, retry logic, batch embedding, JSON schema validation, and pgvector integration. Front-end has four concurrent state-driven panels with Tab switching. | pgvector IVFFlat index; `match_chunks` RPC with cosine similarity; batch-32 embedding with rate-limit backoff; JSON validation with retry-once; TanStack Router with parameterized routes | Complexity is backend-heavy; judges may not see the edge function code. Mitigation: Show the `rag-query` flow diagram and mention the batch/retry/validation logic during presentation. |
| **Functionality & Execution** | All four features (Summary, Flashcards, Quiz, Chat) work end-to-end. Complete loading, empty, error, and edge-case states. Toast notifications, responsive sidebar. | Loading skeletons, error banners with Retry, EmptyState for idle states, 200-char minimum text validation, PDF error handling, source citations in chat, explanation cards in quiz, rating-based flashcard restudy | Mistral API could fail during demo (network, rate limit, auth). Mitigation: Pre-cache demo content; have retry button ready; mention offline fallback plan. |
| **Presentation** | Polished Tailwind UI with consistent design system (Badge, Button, Card, Spinner, Tabs, Toast, EmptyState). Responsive mobile layout. Clean information hierarchy. Workspace tab bar with icons. | 4-tab workspace with `tabIcons`; gradient progress bars; hover/active states on cards and buttons; toast animations; mobile hamburger menu; consistent rounded-xl + shadow-sm design language | Loading states are not instantaneous -- 5-15 second waits may feel slow. Mitigation: Use skeleton loading animations (already implemented); start quiz/summary generation on tab switch for perceived speed. |

---

## 16. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mistral API outage during demo | Low | Critical (all features break) | Pre-load demo content before presentation; have screenshots/video backup; mention that local dev uses the same functions |
| Mistral API rate limit (429) during demo | Medium | High (quiz/summary generation fails) | 300ms delay in embed-document; retry-once in generation functions; retry button in UI |
| Mistral returns invalid JSON | Medium | Medium (generation fails, retried once) | Retry-once logic; clear error message to user |
| pgvector query time degrades with many chunks | Low (demo scale) | Low | IVFFlat index handles up to millions of vectors; at demo scale (< 1000 chunks) queries are sub-millisecond |
| Browser compatibility issues (pdfjs-dist) | Low | Medium (PDF upload fails on some browsers) | "Paste text" alternative works on all browsers; error message guides user to paste mode |
| CORS error on edge function invocation | Low | High (all AI features broken) | All functions return CORS headers; verified working during development |
| Supabase free tier limits exceeded | Low (demo scale) | Medium | Only 1-2 users during demo; free tier allows 500K database requests and 500K edge function invocations |
| Security: no auth, anyone can access | Medium (if deployed publicly) | Medium | Acceptable for demo; add Supabase Auth + RLS for post-hackathon; WAF rules on Cloudflare |
| Deep link to non-existent document ID | Low | Low | `DocWorkspace` shows "Document not found" EmptyState if `documents.find()` returns undefined |

---

## 17. Roadmap

### Post-Hackathon Priority Order

1. **Spaced Repetition (SM-2 Algorithm)** -- The `flashcards` table already has `ease`, `interval_days`, and `due_at` columns reserved for the SM-2 algorithm. Implement the scheduler: after each rating, compute next interval based on the rating (Again=reset, Hard=1.25x, Good=2x, Easy=3x, capped at max interval). Show only cards where `due_at <= now()` in the study session. This is the single highest-value addition because it transforms flashcards from a one-time review into a long-term learning system.

2. **Progress Tracking** -- Add a dashboard that shows study statistics per document: number of flashcards mastered (SM-2 ease >= 2.5 and interval > 7 days), quiz scores over time, number of RAG queries asked, and a "strength" meter for each document. Store progress events in a new `study_events` table (`document_id`, `event_type`, `event_data jsonb`, `created_at`). This scores on Functionality (shows judges the app's completeness) and Presentation (visual charts).

3. **Multi-User Authentication** -- Add Supabase Auth (email/password or Magic Link) and enable RLS on all tables (see Section 10.3 for the exact policies). Each user sees only their own documents. This is a prerequisite for any real-world deployment and unlocks future features like shared study groups.

4. **Flashcard Spaced Repetition API** -- After SM-2 is implemented on the frontend, create an edge function `review-flashcard` that accepts `{ flashcardId, rating }`, computes the new SM-2 schedule (ease factor, interval, due date), and updates the `flashcards` row. This moves scheduling logic server-side so it persists across devices.

5. **Document Regeneration / Re-indexing** -- Add a "Re-index" button that re-embeds all chunks for a document (useful if the Mistral embedding model updates or if some chunks failed during initial indexing). The `embed-document` function already only processes chunks where `embedding IS NULL`, so the client would need to null out embeddings and then call `embedDocument`.

6. **Export Flashcards to Anki** -- Add an "Export" button that generates an APKG file (Anki's package format) from the flashcards table. Anki's format is a SQLite database with specific column names, compressed as a ZIP. This is a high-value feature for students who already use Anki.

7. **Document History / Versioning** -- Allow re-uploading a corrected version of a document while preserving old chunks and study progress. Complex; defer unless users request it.

---

## 18. Appendix

### 18.1 Glossary of Key Terms

| Term | Definition |
|------|------------|
| **Chunk** | A segment of text (~800 characters) split from a larger document, with ~100-character overlap between adjacent chunks. Each chunk gets a vector embedding. |
| **Cosine Similarity** | A measure of similarity between two non-zero vectors, computed as `1 - cosine_distance`. Values range from 0 (orthogonal, no similarity) to 1 (identical direction). |
| **Edge Function** | A serverless Deno function running on Supabase's edge runtime. Each function is a single TypeScript file with an HTTP endpoint. |
| **Grounded Generation** | An LLM generation technique where the model is instructed to answer using only a provided context, with an explicit "I don't know" fallback to prevent hallucination. |
| **IVFFlat** | Inverted File with Flat -- an approximate nearest-neighbor index for vector similarity search. Partitions vectors into lists (clusters) at index time, then searches only the nearest lists at query time. |
| **pgvector** | A PostgreSQL extension that adds a `vector` data type and similarity search operators (`<=>` for cosine distance, `<#>` for inner product, `<->` for L2 distance). |
| **RAG** | Retrieval-Augmented Generation -- a pattern where a user query is first used to retrieve relevant documents (or chunks), then the retrieved content is fed as context to an LLM to generate a grounded answer. |
| **RLS** | Row-Level Security -- a PostgreSQL feature that restricts which rows a user can query or modify based on a policy expression (e.g., `auth.uid() = user_id`). |
| **RPC** | Remote Procedure Call -- in Supabase, a PostgreSQL function callable over the REST API via `supabase.rpc()`. |
| **SM-2** | The SuperMemo-2 spaced repetition algorithm. Each flashcard has an ease factor (starting at 2.5), an interval in days, and a due date. Ratings of 0-5 adjust these values to schedule reviews at optimal intervals. |
| **Service-Role Key** | A Supabase API key with full access to all tables, bypassing RLS. Used server-side only, never exposed to the client. |
| **TanStack Router** | A type-safe routing library for React with first-class TypeScript inference for route parameters, search params, and loader data. |

### 18.2 Full Environment Variables List

| Variable | Required | Where | Example Value | Notes |
|----------|----------|-------|---------------|-------|
| `VITE_SUPABASE_URL` | Yes | `.env` + Cloudflare Pages env | `https://xjsukouwsymcqxfhajyv.supabase.co` | Public; embedded in frontend bundle |
| `VITE_SUPABASE_ANON_KEY` | Yes | `.env` + Cloudflare Pages env | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Public; embedded in frontend bundle |
| `SUPABASE_URL` | Auto | Edge Functions (Deno.env) | (set by Supabase platform) | Injected automatically for hosted functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Edge Functions (Deno.env) | (set by Supabase platform) | Injected automatically for hosted functions |
| `MISTRAL_API_KEY` | Yes | `supabase secrets set` | `kQ1234abcd...` | Server-side only; used by all 5 edge functions |

### 18.3 OPEN QUESTIONS

The following were deliberately left undecided or ambiguous during the build and should be resolved before production deployment:

1. **Flashcard SM-2 scheduling** -- The `ease`, `interval_days`, and `due_at` columns exist in the `flashcards` table but are never updated by any edge function or frontend code. The frontend's rating system (Again/Hard/Good/Easy) does not persist schedules. The roadmap (Section 17, item 1) proposes implementing this, but the exact mapping from rating to SM-2 quality score (0-5) has not been decided. Recommended mapping: Again=1, Hard=2, Good=4, Easy=5.

2. **User authentication** -- There is no auth. All documents are visible to anyone who has the anon key. RLS is not enabled. This is acceptable for a hackathon demo but must be resolved before any public deployment. See Section 10.3 for the recommended RLS policies.

3. **Pagination for large document grids** -- The Library page fetches all documents with no pagination or limit. For a demo with 1-5 documents this is fine. For production with hundreds of documents, add server-side pagination with `limit` and `offset` or cursor-based pagination.

4. **Flashcards API is not deployed** -- The `DEPLOY.md` file in the repository notes that `generate-flashcards` was skipped during initial deployment ("Step 8 was deferred"). The function exists in `supabase/functions/generate-flashcards/index.ts` and is fully implemented, but has not been deployed. This should be deployed before demo if the Flashcards feature is to be demonstrated.

5. **Error message for failed indexing on upload** -- When `embedDocument` fails during upload, the error message says "You can re-index later" but there is no "Re-index" button in the UI. The user would need to delete and re-upload the document. Resolve this by adding a re-index button or by making indexing a background retry operation.

6. **PDF worker path** -- The `UploadDialog` sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a URL constructed from `import.meta.url`. This works in Vite dev but may break in the production Cloudflare Pages build if the worker file is not properly bundled or served. Verify that `pdfjs-dist/build/pdf.worker.min.mjs` resolves correctly in the production build.

7. **Cost risks for public deployment** -- Without auth, anyone who discovers the URL can call the edge functions, incurring Mistral API costs. For any public deployment, add authentication and per-user rate limits. Even with auth, set a Mistral spend cap in the Mistral console.

8. **`count` parameter in quiz/flashcard generation** -- The frontend hardcodes `count = 8` for quizzes and `count = 10` for flashcards. These are not user-configurable. The edge functions accept a `count` parameter, so adding a slider or number input in the UI would be straightforward.

9. **Caching summary between sessions** -- The summary is currently ephemeral (not persisted to any table). Regenerating on a different device or after a browser refresh requires a new Mistral API call. For cost savings, persist the summary JSON to a `summaries` table or a JSON column on `documents`.

10. **PDF extraction quality** -- `pdfjs-dist`'s `getTextContent()` extracts text without formatting, tables, or images. A PDF with complex layouts (multi-column, math equations, diagrams) will produce garbled text. The "Paste text" mode is the recommended fallback for such documents. No plan to improve this for the hackathon.

---

*End of report.*
