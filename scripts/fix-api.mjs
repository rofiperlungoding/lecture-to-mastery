import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');

// ===== 1. Update src/lib/api.ts =====
const apiPath = path.join(ROOT, 'src', 'lib', 'api.ts');
let api = fs.readFileSync(apiPath, 'utf-8');

// Add getTotalChunksCount + getEmbeddingProgress after getFailedChunksCount
const marker = 'export interface RagQueryResult {';
const insertIndex = api.indexOf(marker);
const newFunctions = `

/**
 * Count ALL chunks for a document (including embedded ones).
 */
export async function getTotalChunksCount(documentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .eq("document_id", documentId)
  if (error) throw new Error("Failed to count chunks: " + error.message)
  return count ?? 0
}

/**
 * Poll for embedding progress. Returns { embedded, total } or null if not found.
 * Use this after calling embedDocument to show real-time progress.
 */
export async function getEmbeddingProgress(documentId: string): Promise<{ embedded: number; total: number } | null> {
  try {
    const totalReq = supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId)
    const nullReq = supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId)
      .is("embedding", null)
    const [totalRes, nullRes] = await Promise.all([totalReq, nullReq])
    const total = totalRes.count ?? 0
    const nullCount = nullRes.count ?? 0
    if (total === 0) return null
    return { embedded: total - nullCount, total }
  } catch { return null }
}

`;

api = api.slice(0, insertIndex) + newFunctions + api.slice(insertIndex);

// Update EmbedResult to include totalChunks
api = api.replace(
  'export interface EmbedResult {\n  embedded: number\n  failedCount: number\n  failedIndexes: number[]\n}',
  'export interface EmbedResult {\n  embedded: number\n  failedCount: number\n  failedIndexes: number[]\n  totalChunks?: number\n}'
);

// Update embedDocument to use 120s timeout
const oldEmbed = `export async function embedDocument(documentId: string): Promise<EmbedResult> {
  const { data, error } = await invokeEdgeFunction<EmbedResult>('embed-document', { documentId })
  if (error) throw new Error(\`Embedding failed: \${error.message}\`)
  return data ?? { embedded: 0, failedCount: 0, failedIndexes: [] }
}`;

const newEmbed = `export async function embedDocument(documentId: string): Promise<EmbedResult> {
  // F1: Increased timeout to 120s (Mistral can be slow, esp. with retries)
  const { data, error } = await invokeEdgeFunction<EmbedResult>('embed-document', { documentId }, { timeout: 120_000 })
  if (error) throw new Error(\`Embedding failed: \${error.message}\`)
  return data ?? { embedded: 0, failedCount: 0, failedIndexes: [], totalChunks: 0 }
}`;

api = api.replace(oldEmbed, newEmbed);

fs.writeFileSync(apiPath, api, 'utf-8');
console.log('✅ src/lib/api.ts updated');

// ===== 2. Update src/routes/index.tsx - embed progress in loadDemo() =====
const indexPath = path.join(ROOT, 'src', 'routes', 'index.tsx');
let index = fs.readFileSync(indexPath, 'utf-8');

// Add import for getEmbeddingProgress
index = index.replace(
  'embedDocument, resetDocumentEmbeddings, getFailedChunksCount,',
  'embedDocument, resetDocumentEmbeddings, getFailedChunksCount, getEmbeddingProgress, getTotalChunksCount,'
);

// Update demoPhase type to include embedding progress states
index = index.replace(
  "const [demoPhase, setDemoPhase] = useState<'idle' | 'saving' | 'indexing'>('idle');",
  "const [demoPhase, setDemoPhase] = useState<'idle' | 'saving' | 'indexing' | 'embedding' | 'done' | 'error'>('idle');"
);

// Add embedding progress state
index = index.replace(
  "// Failed chunks + reindexing",
  "// Embedding progress for real-time feedback\n  const [embedProgress, setEmbedProgress] = useState<{ embedded: number; total: number } | null>(null);\n  const [embedError, setEmbedError] = useState<string | null>(null);\n  const demoDocIdRef = useRef<string | null>(null);\n\n  // Failed chunks + reindexing"
);

// Replace loadDemo function with the new version with bounded polling
const oldLoadDemo = `  const loadDemo = async () => {
    setDemoLoading(true);
    setDemoPhase('saving');
    try {
      const chunks = chunkText(demoContent);

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          title: "Data Structures: Arrays, Linked Lists & Big-O",
          source_type: "text",
        })
        .select()
        .single();

      if (docErr) throw docErr;
      if (!doc) throw new Error("No document returned");

      const chunkRows = chunks.map((content, idx) => ({
        document_id: doc.id,
        content,
        chunk_index: idx,
        embedding: null,
      }));

      const { error: chunkErr } = await supabase
        .from("chunks")
        .insert(chunkRows);
      if (chunkErr) throw chunkErr;

      addDocument(doc);

      setDemoPhase('indexing');
      showToast("success", "Document saved. Now indexing...");

      const embedResult = await embedDocument(doc.id);
      if (embedResult.failedCount > 0) {
        showToast("warning", \`Demo indexed with \${embedResult.failedCount} failed chunks. Click Re-index on the document card to retry.\`);
        setFailedChunks((prev) => ({ ...prev, [doc.id]: embedResult.failedCount }));
      } else {
        showToast("success", \`Demo fully indexed! \${embedResult.embedded} chunks ready.\`);
      }
    } catch (err) {
      showToast("error", \`Failed to load demo: \${(err as Error).message}\`);
    } finally {
      setDemoLoading(false);
      setDemoPhase('idle');
    }
  };`;

const newLoadDemo = `  const loadDemo = async () => {
    setDemoLoading(true);
    setDemoPhase('saving');
    setEmbedProgress(null);
    setEmbedError(null);
    try {
      const chunks = chunkText(demoContent);

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          title: "Data Structures: Arrays, Linked Lists & Big-O",
          source_type: "text",
        })
        .select()
        .single();

      if (docErr) throw docErr;
      if (!doc) throw new Error("No document returned");

      const chunkRows = chunks.map((content, idx) => ({
        document_id: doc.id,
        content,
        chunk_index: idx,
        embedding: null,
      }));

      const { error: chunkErr } = await supabase
        .from("chunks")
        .insert(chunkRows);
      if (chunkErr) throw chunkErr;

      addDocument(doc);
      demoDocIdRef.current = doc.id;

      setDemoPhase('indexing');
      showToast("success", "Document saved. Now indexing...");

      // Fire the embed-document edge function (don't await — let it poll)
      const embedPromise = embedDocument(doc.id);

      // Poll for progress every 2s, up to 120s (max 60 polls)
      setDemoPhase('embedding');
      const POLL_INTERVAL_MS = 2_000;
      const MAX_POLLS = 60;
      let polls = 0;

      const pollInterval = setInterval(async () => {
        polls++;
        try {
          const progress = await getEmbeddingProgress(doc.id);
          if (progress) {
            setEmbedProgress(progress);
            if (progress.embedded >= progress.total) {
              clearInterval(pollInterval);
              setDemoPhase('done');
              showToast("success", \`Demo fully indexed! \${progress.embedded} chunks ready.\`);
              setDemoLoading(false);
              setTimeout(() => setDemoPhase('idle'), 2_000);
              return;
            }
          }
        } catch { /* ignore polling errors */ }
        if (polls >= MAX_POLLS) {
          clearInterval(pollInterval);
        }
      }, POLL_INTERVAL_MS);

      // Wait for the embed function to complete
      try {
        const embedResult = await embedPromise;
        clearInterval(pollInterval);

        if (embedResult.failedCount > 0) {
          setEmbedError(\`\${embedResult.failedCount} chunk(s) failed to index.\`);
          setDemoPhase('error');
          showToast("warning", \`Demo indexed with \${embedResult.failedCount} failed chunks. Click Retry or Re-index.\`);
          setFailedChunks((prev) => ({ ...prev, [doc.id]: embedResult.failedCount }));
        } else {
          setDemoPhase('done');
          setEmbedProgress({ embedded: embedResult.embedded, total: embedResult.embedded });
          showToast("success", \`Demo fully indexed! \${embedResult.embedded} chunks ready.\`);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setEmbedError((err as Error).message);
        setDemoPhase('error');
        showToast("error", \`Embedding failed: \${(err as Error).message}. Click Retry.\`);
      }
    } catch (err) {
      setEmbedError((err as Error).message);
      setDemoPhase('error');
      showToast("error", \`Failed to load demo: \${(err as Error).message}\`);
    } finally {
      // Don't reset demoLoading here — the polling or error state handles it
      if (demoPhase !== 'embedding' && demoPhase !== 'indexing') {
        setDemoLoading(false);
      }
    }
  };`;

index = index.replace(oldLoadDemo, newLoadDemo);

// Add retry logic: wrap loadDemo content to allow retry
// Also update demo button text for embedding phase
index = index.replace(
  "{demoLoading ? (demoPhase === 'saving' ? 'Saving...' : 'Indexing...') : \"Load Demo\"}",
  `{demoLoading
    ? demoPhase === 'saving' ? 'Saving...'
      : demoPhase === 'embedding' && embedProgress
        ? \`Embedding \${embedProgress.embedded}/\${embedProgress.total}...\`
        : demoPhase === 'error' ? 'Retry'
        : 'Indexing...'
    : demoPhase === 'done' ? 'Done ✓'
    : "Load Demo"}`
);

// Same for the second instance of the button label
index = index.replace(
  "{demoLoading ? (demoPhase === 'saving' ? 'Saving...' : 'Indexing...') : \"Load Demo\"}",
  `{demoLoading
    ? demoPhase === 'saving' ? 'Saving...'
      : demoPhase === 'embedding' && embedProgress
        ? \`Embedding \${embedProgress.embedded}/\${embedProgress.total}...\`
        : demoPhase === 'error' ? 'Retry'
        : 'Indexing...'
    : demoPhase === 'done' ? 'Done ✓'
    : "Load Demo"}`
);

fs.writeFileSync(indexPath, index, 'utf-8');
console.log('✅ src/routes/index.tsx updated');
