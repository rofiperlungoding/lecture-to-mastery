# Lecture-to-Mastery 🎓

**Turn any lecture into a personalized study session — summaries, quizzes, flashcards, and an AI tutor that answers questions grounded in your material.**

Built for **Next Byte Hacks V3**.

---

## The Problem

Students spend hours re-reading lecture notes, passively highlighting text, and manually creating study materials. Traditional study methods are time-consuming, and most AI study tools hallucinate answers or rely on general knowledge rather than the specific lecture content the student needs to master.

---

## The Solution

Lecture-to-Mastery ingests a lecture PDF (or pasted notes), chunks the text, generates vector embeddings, and stores everything in a searchable PostgreSQL + pgvector database. The app then provides four study modalities powered by Mistral AI, all grounded in the student's own material:

- **Summary** — AI generates a TL;DR, key bullet points, and a glossary of important terms from the lecture
- **Flashcards** — (Coming soon) Spaced-repetition cards generated from lecture content
- **Quiz** — Multiple-choice quiz generated from the lecture with instant feedback and explanations
- **RAG Chat** — Ask any question; the app retrieves the most relevant chunks via vector similarity search, then answers using only the lecture context — no hallucination

---

## Key Features

### 📝 Summary
- One-click TL;DR extraction with a clean callout card
- Key Points checklist (3–7 items) prioritized by importance
- Key Terms glossary with term-definition pairs in a grid layout
- Regenerate button for fresh summaries

### ❓ Quiz
- AI generates N multiple-choice questions from the lecture (4 options each)
- Interactive flow: select answer → submit → see correct/incorrect with explanation
- Progress bar tracks completion
- Score screen with per-question review
- Retake (same questions) and Regenerate (new questions) modes

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
| **AI / ML** | Mistral AI (`mistral-embed` + `mistral-small-latest`) |
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
6. **Answer** — Retrieved chunks form the context for a Mistral `mistral-small-latest` chat completion → answer grounded in the lecture only

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
3. Click the document card → explore Summary, Quiz, and Chat tabs

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (default: port 5173) |
| `npm run build` | TypeScript check + production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript type-check without emitting files |
| `npm run lint` | Run Oxlint across the codebase |

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
│   │   └── supabase.ts   # Supabase client init
│   ├── routes/           # TanStack Router pages
│   │   ├── __root.tsx    # Root layout
│   │   ├── index.tsx     # Library page
│   │   └── doc.$docId.tsx # Document workspace (Summary/Quiz/Chat)
│   ├── stores/           # Zustand state
│   ├── types/            # TypeScript interfaces (Document, Chunk, etc.)
│   └── styles/           # Tailwind globals
├── supabase/
│   ├── functions/        # Edge functions (Deno)
│   └── migrations/       # Database schema SQL
├── DEPLOY.md             # Full deploy guide + smoke-test checklist
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

---

## Built for Next Byte Hacks V3

This project was created for the **Next Byte Hacks V3** hackathon. It aims to demonstrate how combining vector search (pgvector) with modern LLMs (Mistral AI) can create a practical, grounded study tool that respects the student's actual lecture content rather than generating generic or hallucinated answers.
