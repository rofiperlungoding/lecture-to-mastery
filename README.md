# Lecture-to-Mastery 🎓

**Turn any lecture into a personalized study session — summaries, quizzes, flashcards, and an AI tutor that answers questions grounded in your material.**

**Live App:** [https://master.lecture-to-mastery.pages.dev](https://master.lecture-to-mastery.pages.dev)

Built for **Next Byte Hacks V3**.

---

## The Problem

Students spend hours re-reading lecture notes, passively highlighting text, and manually creating study materials. Traditional study methods are time-consuming, and most AI study tools hallucinate answers or rely on general knowledge rather than the specific lecture content the student needs to master.

---

## The Solution

Lecture-to-Mastery ingests a lecture PDF (or pasted notes), chunks the text, generates vector embeddings, and stores everything in a searchable PostgreSQL + pgvector database. The app then provides four study modalities powered by Mistral AI, all grounded in the student's own material:

- **Summary** — AI generates a TL;DR, key bullet points, and a glossary of important terms from the lecture  - **Flashcards** — SM-2 spaced-repetition cards generated from lecture content. Flip cards, rate your recall (Again/Hard/Good/Easy), and the app schedules future reviews using the SM-2 algorithm. "Due today" mode filters cards ready for review.
  - **Quiz** — Multiple-choice quiz generated from the lecture with configurable question count (3–20), instant feedback, explanations, and progress tracking with best-score persistence.
  - **RAG Chat** — Ask any question; the app retrieves the most relevant chunks via vector similarity search, then answers using only the lecture context — no hallucination. Source citations shown with chunk references.

---

## Key Features

### 📝 Summary  - One-click TL;DR extraction with a clean callout card
  - Key Points checklist (3–7 items) prioritized by importance
  - Key Terms glossary with term-definition pairs in a grid layout
  - Multiple summary modes: Detailed, ELI5 (simplified), and Cheat Sheet (concise)
  - Interactive Concept Map generation showing relationships between topics
  - Regenerate button for fresh summaries
  - Cached results to avoid redundant AI calls

### ❓ Quiz
- AI generates N multiple-choice questions from the lecture (4 options each) — configurable count (3–20)
- Interactive flow: select answer → submit → see correct/incorrect with explanation
- Progress bar tracks completion
- Score screen with per-question review
- Best score tracking across attempts
- Retake (same questions) and Regenerate (new questions) modes

### 💬 RAG Chat
- Ask natural-language questions about the lecture
- Vector similarity search (pgvector) finds the 5 most relevant chunks
- Mistral answers using ONLY the retrieved context — refuses if answer isn't in the material
- Source citations shown below each answer (chunk index + snippet)
- Graceful error handling with retry button

### 🃏 Flashcards (SM-2 Spaced Repetition)
- AI generates flashcards from lecture content — configurable count (3–30)
- Interactive study flow: flip card → rate recall (Again/Hard/Good/Easy)
- SM-2 algorithm computes ease factor, interval, and next review date
- "Due today" mode filters cards ready for review, with due-count badge
- Score screen with rating breakdown and next-review schedule
- Restudy mode for cards rated "Again"
- Persistent scheduling across sessions (server-side SM-2 edge function)

### 💬 RAG Chat
- Ask natural-language questions about the lecture
- Vector similarity search (pgvector) finds the 5 most relevant chunks
- Mistral answers using ONLY the retrieved context — refuses if answer isn't in the material
- Source citations shown below each answer (chunk index + snippet)
- Graceful error handling with retry button

### 📚 Library & Document Management
- Upload PDFs (drag-and-drop or file picker) or paste raw text
- "Load Demo" button to instantly ingest a sample Data Structures lecture
- Document grid with badges (PDF / text) and creation dates
- Rename and delete documents with confirmation
- Re-index button to retry failed chunk embeddings
- Embedding progress visibility (failed chunk counts shown)
- Mobile-responsive sidebar with hamburger menu

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, Vite 8 |
| **Routing** | TanStack Router 1.x |
| **State Management** | Zustand 5 |
| **Styling** | Tailwind CSS 3, PostCSS, Autoprefixer |
| **Backend / Database** | Supabase (PostgreSQL 17 + pgvector) |
| **Edge Functions** | Supabase Edge Functions (Deno 2) |
| **AI / ML (Embeddings)** | Mistral AI (`mistral-embed`) — 1024-dim vectors |
| **AI / ML (Chat)** | Multi-provider: Groq (`llama-3.3-70b`), Cerebras (`llama-3.3-70b`), Mistral (`mistral-small-latest`) — automatic failover + round-robin |
| **PDF Parsing** | pdfjs-dist 6 |
| **Linting** | Oxlint |
| **Hosting** | Cloudflare Pages (frontend), Supabase (backend) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)               │
│  ┌──────────┐  ┌──────────┐  ┌───────┐  ┌───────────────┐  │
│  │ Library  │  │ Summary  │  │ Quiz  │  │  RAG Chat     │  │
│  │  Page    │  │   Tab    │  │  Tab  │  │     Tab       │  │
│  └────┬─────┘  └────┬─────┘  └───┬───┘  └───────┬───────┘  │
│       │              │            │              │          │
│       ▼              ▼            ▼              ▼          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Supabase Client (supabase-js)            │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │  Documents  │  │   Chunks     │  │ Quiz Q's    │ │   │
│  │  │   (table)   │  │ (table+vec)  │  │  (table)    │ │   │
│  │  └─────────────┘  └──────────────┘  └─────────────┘ │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                  Supabase Edge Functions (Deno)               │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  ingest PDF  │───▶│   chunkText   │───▶│embed-document  │  │
│  │  or text     │    │  (~800 chars) │    │(Mistral embed) │  │
│  └──────────────┘    └──────────────┘    └───────┬────────┘  │
│                                                    │          │
│  ┌──────────────┐    ┌──────────────┐             │          │
│  │rag-query     │◀───│ match_chunks │◀────────────┘          │
│  │(Mistral chat)│    │ (pgvector)   │                        │
│  └──────────────┘    └──────────────┘                        │
│                                                               │
│  ┌──────────────────┐    ┌────────────────┐                  │
│  │summarize-document │    │generate-quiz   │                  │
│  │(Mistral chat)     │    │(Mistral chat)  │                  │
│  └──────────────────┘    └────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │   Mistral AI API    │
              │  ┌───────────────┐  │
              │  │ mistral-embed │  │
              │  │ (embeddings)  │  │
              │  ├───────────────┤  │
              │  │mistral-small  │  │
              │  │ (chat/answer) │  │
              │  └───────────────┘  │
              └─────────────────────┘
```

### Data Flow

1. **Ingest** — User uploads a PDF or pastes text → text is extracted (pdfjs-dist for PDFs)
2. **Chunk** — Text is split into ~800-character segments with ~100-character overlap, preferring sentence boundaries
3. **Embed** — Each chunk is sent to Mistral `mistral-embed` → returns a 1024-dimension vector
4. **Store** — Chunks + embeddings are stored in Supabase `chunks` table with a pgvector IVFFlat index
5. **Retrieve** — A user question is embedded with the same model → cosine similarity search via `match_chunks()` RPC → top 5 chunks returned
6. **Answer** — Retrieved chunks form the context for a multi-provider chat completion (Groq → Cerebras → Mistral, with automatic failover and round-robin load distribution) → answer grounded in the lecture only

---

## Local Setup

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works) with the project ID handy
- A Mistral AI API key (free tier: [console.mistral.ai](https://console.mistral.ai))

### Step 1: Clone and Install

```bash
git clone <your-repo-url>
cd lecture-to-mastery
npm install
```

### Step 2: Environment Variables

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

> These values are found in your Supabase project dashboard under **Settings → API**.

### Step 3: Database Migrations

Link your local project to Supabase and apply migrations:

```bash
npx supabase link --project-ref <your-project-id>
npx supabase db push
```

This applies the migrations from `supabase/migrations/`:
- `0001_init.sql` — Creates `documents`, `chunks`, `flashcards`, and `quiz_questions` tables, enables `pgvector`, creates the `match_chunks()` similarity search function
- `0002_add_chunk_index_to_match.sql` — Updates `match_chunks()` to return `chunk_index`

### Step 4: Set Mistral API Key

```bash
npx supabase secrets set MISTRAL_API_KEY=<your-mistral-api-key>
```

### Step 5: Deploy Edge Functions

```bash
npx supabase functions deploy embed-document
npx supabase functions deploy rag-query
npx supabase functions deploy summarize-document
npx supabase functions deploy generate-quiz
npx supabase functions deploy generate-flashcards
npx supabase functions deploy review-flashcard
npx supabase functions deploy generate-concept-map
npx supabase functions deploy global-search
npx supabase functions deploy corpus-rag-query
npx supabase functions deploy delete-account
```

Verify they deployed:

```bash
npx supabase functions list
```

### Step 6: Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Step 7: Test the Demo

1. Click **"Load Demo"** on the Library page
2. Wait ~10–15 seconds for indexing to finish
3. Click the document card → explore Summary, Quiz, Flashcards, and Chat tabs

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (default: port 5173) |
| `npm run build` | TypeScript check + production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript type-check without emitting files |
| `npm run lint` | Run Oxlint across the codebase |
| `npx supabase functions deploy <name>` | Deploy a specific edge function |

---

## Deployment

### Frontend (Cloudflare Pages)

```bash
npm run build
# Output: dist/

# Via Wrangler CLI:
npx wrangler pages deploy dist/ --project-name lecture-to-mastery
npx wrangler pages secret put VITE_SUPABASE_URL
npx wrangler pages secret put VITE_SUPABASE_ANON_KEY
```

Or upload `dist/` manually through the [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages.

### Edge Functions (Supabase)

Already deployed in Step 5 above. Update individual functions as needed:

```bash
npx supabase functions deploy <function-name>
```

---

## Project Structure

```
lecture-to-mastery/
├── src/
│   ├── components/       # Reusable UI (Badge, Button, Card, Sidebar, Tabs, Toast, etc.)
│   ├── lib/
│   │   ├── api.ts        # Client API wrappers for edge functions
│   │   ├── chunk.ts      # Text chunking algorithm
│   │   ├── demoContent.ts # Sample lecture for one-click demo
│   │   ├── export.ts     # Document export (PDF/HTML/Markdown)
│   │   ├── gamification.ts # XP, levels, streaks, achievements
│   │   └── supabase.ts   # Supabase client init
│   ├── routes/           # TanStack Router pages
│   │   ├── __root.tsx    # Root layout with sidebar + toast container
│   │   ├── index.tsx     # Library page (document grid + upload/load-demo)
│   │   ├── doc.$docId.tsx # Document workspace (6 tabs: Exam, Summary, Flashcards, Quiz, Chat, Notes)
│   │   ├── login.tsx     # Auth page (sign in / create account / guest)
│   │   ├── progress.tsx  # Dashboard with XP, streaks, achievements
│   │   ├── settings.tsx  # Account settings & delete-account
│   │   ├── corpus-chat.tsx # Ask across all documents
│   │   └── print.$docId.tsx # Print-friendly document view
│   ├── stores/           # Zustand state (app, auth, theme)
│   ├── types/            # TypeScript interfaces (db.ts)
│   └── styles/           # Tailwind globals with dark mode overrides
├── supabase/
│   ├── functions/        # 10 edge functions (Deno 2)
│   └── migrations/       # 10 database migration SQL files
├── DEPLOY.md             # Full deploy guide + smoke-test checklist
├── E2E_REPORT.md         # End-to-end test report
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Edge Functions Reference

| Function | Trigger | Purpose |
|----------|---------|---------|
| `embed-document` | Manual (on upload/re-index) | Chunk text and generate embeddings via Mistral `mistral-embed` |
| `rag-query` | Chat message | Vector similarity search + Mistral chat completion for Q&A |
| `summarize-document` | Summary tab | Generate TL;DR, key points, key terms via Mistral |
| `generate-quiz` | Quiz tab | Generate multiple-choice questions from lecture content |
| `generate-flashcards` | Flashcards tab | Generate flashcard front/back pairs from lecture content |
| `review-flashcard` | Flashcard rating | Server-side SM-2 computation (ease, interval, due date) |
| `generate-targeted-practice` | Practice tab | Generate targeted quiz questions + flashcards on specific concepts |
| `generate-course-practice` | Course Practice | Generate practice across entire course with concept coverage |
| `rag-query-course` | Course Chat | RAG across all documents in a course |
| `generate-concept-map` | Concept map tab | Generate topic relationship graph |
| `global-search` | Global search bar | Cross-document vector similarity search |
| `corpus-rag-query` | Ask All Notes | RAG across all user documents |
| `delete-account` | Settings | Permanently delete user account and all data |
| `ocr-image` | Image upload | OCR text extraction from images |

## Gamification System

| Feature | Details |
|---------|---------|
| **XP** | Earned by studying documents, completing quizzes, chatting, and reviewing flashcards |
| **Levels** | Calculated from accumulated XP with increasing requirements per level |
| **Streaks** | Tracks consecutive days with at least one study session |
| **Achievements** | Night Owl (study after midnight), multi-document sessions |
| **XP Bar** | Visible in sidebar with progress to next level |

## Database Migrations

| Migration | Changes |
|-----------|---------|
| `0001_init.sql` | Core tables: documents, chunks (with pgvector), flashcards, quiz_questions, match_chunks function |
| `0002_add_chunk_index_to_match.sql` | Added chunk_index to match_chunks return type |
| `0003_add_ownership_rls.sql` | Row-level security + user_id columns on documents, chunks |
| `0004_rate_limits.sql` | API rate limiting configuration |
| `0005_add_progress_tracking.sql` | review_log and quiz_attempts tables with RLS |
| `0006_add_gamification.sql` | User profiles, XP, streaks, achievements |
| `0007_add_doc_artifacts.sql` | Cached document artifacts (summaries, concept maps) |
| `0008_exam_attempts.sql` | Practice exam tracking |
| `0009_add_match_chunks_all.sql` | Cross-document chunk matching function |
| `0010_add_notes_and_highlights.sql` | User notes and highlights tables |

---

## Built for Next Byte Hacks V3

This project was created for the **Next Byte Hacks V3** hackathon. It aims to demonstrate how combining vector search (pgvector) with modern LLMs (Mistral AI) can create a practical, grounded study tool that respects the student's actual lecture content rather than generating generic or hallucinated answers.

### What Makes It Stand Out

- **SM-2 Spaced Repetition** — Not just flashcard display; a real scheduling algorithm that computes ease factors and optimal review intervals on the server side
- **Grounded RAG** — The AI tutor refuses to answer if the answer isn't in the student's lecture, eliminating hallucination
- **Gamification** — XP, levels, and streaks make studying engaging
- **Resilient Architecture** — Partial embedding failures are surfaced with re-index capability, toast notifications, and retry buttons throughout
