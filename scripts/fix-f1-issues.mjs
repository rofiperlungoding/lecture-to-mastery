import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const indexPath = path.join(ROOT, 'src', 'routes', 'index.tsx');
let index = fs.readFileSync(indexPath, 'utf-8');

// === Fix 1: Replace the loadDemo function with fixed version ===

const newLoadDemo = `  const demoPhaseRef = useRef(demoPhase);
  useEffect(() => { demoPhaseRef.current = demoPhase; }, [demoPhase]);

  const loadDemo = async () => {
    setDemoLoading(true);
    setDemoPhase('saving');
    setEmbedProgress(null);
    setEmbedError(null);

    let embeddingComplete = false;

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
        // Bail if already handled by embedPromise resolution or error
        if (demoPhaseRef.current === 'error' || demoPhaseRef.current === 'done' || embeddingComplete) {
          clearInterval(pollInterval);
          return;
        }
        polls++;
        try {
          const progress = await getEmbeddingProgress(doc.id);
          if (progress && progress.embedded >= progress.total && !embeddingComplete) {
            embeddingComplete = true;
            clearInterval(pollInterval);
            setDemoPhase('done');
            setEmbedProgress(progress);
            showToast("success", \`Demo fully indexed! \${progress.embedded} chunks ready.\`);
            setDemoLoading(false);
            setTimeout(() => setDemoPhase('idle'), 2_000);
            return;
          }
          if (progress) {
            setEmbedProgress(progress);
          }
        } catch { /* ignore polling errors */ }
        if (polls >= MAX_POLLS) {
          clearInterval(pollInterval);
          // If we hit max polls without completion, show a timeout error
          if (!embeddingComplete && demoPhaseRef.current !== 'error') {
            setDemoPhase('error');
            setEmbedError("Embedding is taking longer than expected. The document was saved but may not be fully indexed yet.");
            setDemoLoading(false);
          }
        }
      }, POLL_INTERVAL_MS);

      // Wait for the embed function to complete
      try {
        const embedResult = await embedPromise;
        clearInterval(pollInterval);

        if (embeddingComplete) return; // Already handled by poll

        if (embedResult.failedCount > 0) {
          setEmbedError(\`\${embedResult.failedCount} chunk(s) failed to index.\`);
          setDemoPhase('error');
          showToast("warning", \`Demo indexed with \${embedResult.failedCount} failed chunks. Click Retry or Re-index.\`);
          setFailedChunks((prev) => ({ ...prev, [doc.id]: embedResult.failedCount }));
        } else {
          embeddingComplete = true;
          setDemoPhase('done');
          setEmbedProgress({ embedded: embedResult.embedded, total: embedResult.embedded || 1 });
          showToast("success", \`Demo fully indexed! \${embedResult.embedded} chunks ready.\`);
        }
      } catch (err) {
        clearInterval(pollInterval);
        if (embeddingComplete) return; // Already handled by poll
        setEmbedError((err as Error).message);
        setDemoPhase('error');
        showToast("error", \`Embedding failed: \${(err as Error).message}. Click Retry.\`);
      }
    } catch (err) {
      setEmbedError((err as Error).message);
      setDemoPhase('error');
      showToast("error", \`Failed to load demo: \${(err as Error).message}\`);
    } finally {
      // Use ref to avoid stale closure
      if (demoPhaseRef.current !== 'embedding' && demoPhaseRef.current !== 'indexing') {
        setDemoLoading(false);
      }
    }
  };`;

// Find and replace the loadDemo function. We need to match the one we wrote earlier.
// Find from "const loadDemo" to the next function declaration or the closing of the block

// Strategy: Find the loadDemo function start and replace until the next function or const
const oldStart = '  const loadDemo = async () => {';
const startIdx = index.indexOf(oldStart);
if (startIdx === -1) {
  console.error('Could not find loadDemo function in index.tsx');
  process.exit(1);
}

// Find the end: look for the pattern that follows our function (comment line "const handleStudyWeakSpots")
const nextFn = '\n  const handleStudyWeakSpots';
const endIdx = index.indexOf(nextFn, startIdx);
if (endIdx === -1) {
  console.error('Could not find end of loadDemo function');
  process.exit(1);
}

// The old function goes from startIdx to endIdx
const before = index.slice(0, startIdx);
const after = index.slice(endIdx);
index = before + newLoadDemo + after;
console.log('✅ loadDemo function replaced');

// === Fix 2: Verify the button label replacements exist ===
// The button labels reference demoPhase, so they should pick up 'embedding' and 'error' states
const firstBtnLabel = index.indexOf('demoPhase');
if (firstBtnLabel === -1) {
  console.warn('⚠️ Could not find demoPhase in button labels');
}

fs.writeFileSync(indexPath, index, 'utf-8');
console.log('✅ src/routes/index.tsx updated with all fixes');
