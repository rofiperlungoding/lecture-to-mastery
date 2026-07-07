# Deploy Guide — Lecture-to-Mastery

## Prerequisites

- Supabase project `xjsukouwsymcqxfhajyv` (already linked via `supabase link`)
- Cloudflare account
- Mistral API key
- Node.js 20+

---

## 1. Set Supabase Secrets

```bash
cd lecture-to-mastery
npx supabase secrets set MISTRAL_API_KEY=<your-mistral-api-key>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected for hosted functions.

## 2. Deploy Edge Functions

```bash
# Deploy all 4 functions
npx supabase functions deploy embed-document
npx supabase functions deploy rag-query
npx supabase functions deploy summarize-document
npx supabase functions deploy generate-quiz
```

Note: `generate-flashcards` is not yet built (Step 8 was deferred). Skip it.

Verify each deployed:
```bash
npx supabase functions list
```

## 3. Deploy Frontend to Cloudflare Pages

### Build
```bash
npm run build
# Output: dist/
```

### Via Cloudflare Dashboard
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create → Pages
2. Connect your Git repo or upload `dist/` directly
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL` = `https://xjsukouwsymcqxfhajyv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-anon-key>`
6. Deploy

### Via Wrangler CLI
```bash
npm install -g wrangler
wrangler pages deploy dist/ --project-name lecture-to-mastery
wrangler pages secret put VITE_SUPABASE_URL
wrangler pages secret put VITE_SUPABASE_ANON_KEY
```

---

## Pre-Demo Quick Check

Run through this critical path before any demo:

```
1. LOAD DEMO
   □ Click "Load Demo" button
   □ Toast: "Demo document added! Indexing in progress..."
   □ Card appears: "Data Structures: Arrays, Linked Lists & Big-O"
   □ Wait ~15s for indexing to finish (embedding all chunks)

2. SUMMARY
   □ Click document card → workspace opens
   □ Summary tab auto-loads with TL;DR, Key Points, Key Terms
   □ Click "Regenerate" → new summary loads

3. QUIZ
   □ Switch to Quiz tab
   □ Click "Generate Quiz" → loading → 8 questions appear
   □ Select answer → Submit → correct/incorrect + explanation shown
   □ Click through all questions → Score screen with Retake/Regenerate

4. CHAT (RAG)
   □ Switch to Chat tab
   □ Ask "What is Big-O notation?" → answer with source citations
   □ Ask "What is the capital of France?" → "I don't know based on this document."
   □ Error state: type a query then disconnect → friendly message + Retry button
```

---

## Full Smoke-Test Checklist

Open the deployed URL (or http://localhost:5173 locally).

Open the deployed URL (or http://localhost:5173 locally).

### 1. Demo data ingestion
- [ ] Click **"Load Demo"** button on Library page
- [ ] Toast appears: "Demo document added! Indexing in progress..."
- [ ] Document card appears in the grid titled "Data Structures: Arrays, Linked Lists & Big-O"
- [ ] Wait ~10-15 seconds for indexing to finish

### 2. Summary tab
- [ ] Click the document card → opens workspace
- [ ] **Summary** tab loads automatically
- [ ] TL;DR callout card visible with 1-2 sentence summary
- [ ] Key Points checklist (3-7 items) visible
- [ ] Key Terms glossary grid (2+) visible
- [ ] "Regenerate" button works

### 3. Quiz tab
- [ ] Click **Quiz** tab
- [ ] Click **"Generate Quiz"** → loading state → questions appear
- [ ] Answer a question → click **Submit Answer** → correct/incorrect shown + explanation
- [ ] Click **Next Question** → progress bar advances
- [ ] Complete all questions → score screen appears
- [ ] **Retake** resets quiz state (same questions)
- [ ] **Regenerate** creates new questions

### 4. Chat tab (RAG)
- [ ] Click **Chat** tab
- [ ] Type "What is Big-O notation?" → press Enter
- [ ] "Thinking…" indicator → answer appears
- [ ] Source citations (small cards with chunk index + snippet) visible beneath answer
- [ ] Ask "What is the difference between arrays and linked lists?" → answer grounded in document
- [ ] Ask "What is the capital of France?" → "I don't know based on this document."

### 5. General UX
- [ ] Toast notifications appear on success/error
- [ ] Loading spinners show during async operations
- [ ] Error states show friendly messages + Retry button
- [ ] Sidebar navigation works (Library link)
- [ ] Mobile responsive: sidebar collapses with hamburger menu
- [ ] 360px viewport: all content visible, no overflow
