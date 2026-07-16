# 🎤 Lecture-to-Mastery — Demo Script for Next Byte Hacks V3

> **Total Time:** ~3 minutes  
> **Setup:** Browser loaded at `http://localhost:5173`, logged out or fresh session

---

## 🎬 Act 1 — Hook (30 sec)

### Step 1: The Problem

> "Students spend hours re-reading lecture notes and manually creating study materials. Existing AI tools hallucinate answers or rely on general knowledge instead of the student's actual lecture."

### Step 2: The Landing Page

Call out what you see on screen:

- **"Lecture-to-Mastery"** branding
- **Sidebar** with XP/level system, nav items (Ask All Notes, Library, Progress, Settings)
- **"Try as guest"** button → *Click it*

> "No account needed. One click gets you in."

---

## 🎬 Act 2 — First Impression (45 sec)

### Step 3: Load Demo Data

- Click **"Load Demo"** button on the Library page
- Point out the toast: *"Demo document added! Indexing in progress..."*

> "One click loads a Data Structures lecture, chunks the text, generates vector embeddings, and stores everything in a searchable Postgres database with pgvector."

### Step 4: Document Grid

After indexing completes (~10s), the document card appears:

- **Title:** "Data Structures: Arrays, Linked Lists & Big-O"
- **Badge:** "text" source type
- **Status:** "Ready" with green dot
- **Date:** Creation timestamp

> "Clean document library with at-a-glance status indicators."

---

## 🎬 Act 3 — Feature Walkthrough (90 sec)

### Step 5: Summary Tab (15 sec)

Click the document card → opens workspace with 6 tabs.

- **TL;DR** callout with blue accent bar
- **Key Points** checklist (numbered items with checkmarks)
- **Key Terms** grid (term-definition cards)
- **Mode switcher:** Detailed / ELI5 / Cheat Sheet
- **Concept Map** toggle in the sub-tab bar

> *Call out:* "Summary modes let you customize the depth — from a 5-year-old explanation to exam-ready cheat sheet."

### Step 6: Flashcards — The SM-2 Killer Feature (25 sec)

Click **Flashcards** tab.

- *Idle state shows:* "Generate Flashcards" button + number input (default 10)
- **Pro move:** Lower the count to 3 for faster demo
- Click **"Generate Flashcards"** → wait 10-15 seconds

Cards appear:

1. **Click the card** → it flips with a 3D animation
2. **Rating buttons** appear: Again / Hard / Good / Easy

> "This isn't just a flashcard viewer. Each rating feeds into the SM-2 algorithm — the gold standard for spaced repetition — running server-side on Supabase Edge Functions."

Rate a card as "Good" — next card appears.

> *After rating all:* "The score screen shows your rating breakdown and — most importantly — the **Next Review Schedule**. Each card gets its own review date computed by the SM-2 algorithm."

### Step 7: Quiz Tab (20 sec)

Click **Quiz** tab.

- Number input (default 8) lets you control difficulty quantity
- Click **"Generate Quiz"** → wait 10-15 seconds

> "Configurable question count. AI generates multiple-choice questions grounded in the lecture content only."

- Select an answer → click **"Submit Answer"**
- Shows: correct/wrong indicator + explanation
- Progress bar at top
- Click **"Next Question"** → repeat
- Finish quiz → **Score screen** with per-question review

> "Best score tracking across attempts. Retake to improve or regenerate fresh questions."

### Step 8: RAG Chat (20 sec)

Click **Chat** tab.

> "The RAG Chat is the crown jewel. Ask any question about the lecture — the app retrieves the most relevant chunks via vector similarity search and answers using ONLY that context."

- Type: *"What is Big-O notation?"*
- Press Enter → answer appears with **source citations** `[chunkIndex] snippet`

> "No hallucination. If the answer isn't in the lecture, the AI says so."

- Test the fallback: *"What is the capital of France?"*
- Response should be: *"I don't know based on this document."*

---

## 🎬 Act 4 — Closing (15 sec)

### Step 9: Summary Call

> "Lecture-to-Mastery combines four study modalities — Summary, Flashcards (with SM-2), Quiz, and RAG Chat — all grounded in the student's own material. Vector search + Mistral AI + spaced repetition = the ultimate study companion."

### Key Numbers to Emphasize

| Metric | Value |
|--------|-------|
| Edge Functions | 10 Deno-powered serverless functions |
| Database Migrations | 10 versioned SQL migrations |
| Study Modalities | 4 (Summary, Quiz, Flashcards, Chat) |
| SM-2 Algorithm | Server-side, persistent scheduling |
| Tech Stack | React 19 + Vite + Supabase + pgvector + Mistral AI |
| Pages/Tabs | Library, 6-tab workspace, Progress, Settings, Corpus Chat |

---

## 🚨 Pro Tips

- **Before demoing:** Run `npm run dev` and do a test run of Load Demo + Flashcards to ensure Mistral API isn't rate-limited
- **If Mistral is slow:** Use the pre-cached Summary as a fallback while waiting for generation
- **Keyboard shortcut:** `Cmd+K` (or `Ctrl+K`) opens global search — great for a quick "wow" moment
- **Dark mode:** Toggle in Settings for visual variety
- **Mobile responsiveness:** Resize the browser to show the hamburger menu on narrow screens

---

## ⚠️ Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Something went wrong" toast | Refresh page and retry |
| Flashcards generate slowly | Mistral API cold start — wait up to 20 seconds |
| Quiz generates empty | Ensure the document has enough content (800+ chars) |
| Chat says "I don't know" | Try a more specific question about the lecture content |
| Rate limiting | Wait 30 seconds and retry |
