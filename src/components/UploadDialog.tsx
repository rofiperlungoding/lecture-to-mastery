import { useState, useRef, type FormEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "../lib/supabase";
import { chunkText } from "../lib/chunk";
import { embedDocument } from "../lib/api";
import { useAppStore } from "../stores/useAppStore";
import { showToast } from "./Toast";
import { Button } from "./Button";
import { Input } from "./Input";
import { X, Upload, FileText, FileX } from "lucide-react";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "pdf" | "text";

export function UploadDialog({ open, onClose }: UploadDialogProps) {
  const [mode, setMode] = useState<Mode>("pdf");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addDocument = useAppStore((s) => s.addDocument);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setFile(null);
    setPastedText("");
    setError(null);
    setMode("pdf");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (trimmedTitle.length > 200) {
      setError("Title must be under 200 characters.");
      return;
    }

    let rawText = "";

    if (mode === "pdf") {
      if (!file) {
        setError("Please select a PDF file.");
        return;
      }
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        setError("File must be a PDF.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("PDF must be under 10 MB.");
        return;
      }

      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          const text = tc.items.map((it) => (it as any).str).join(" ");
          pages.push(text);
        }
        rawText = pages.join("\n\n").trim();
      } catch (err) {
        setError(`Failed to read PDF: ${(err as Error).message}`);
        setLoading(false);
        return;
      }
    } else {
      rawText = pastedText.trim();
      if (!rawText) {
        setError("Please paste some text.");
        return;
      }
      if (rawText.length > 100000) {
        setError("Pasted text must be under 100,000 characters.");
        return;
      }
    }

    setLoading(true);

    if (rawText.length < 200) {
      setError(
        mode === "pdf"
          ? 'The PDF contains very little text (< 200 chars). Try copying the text and using "Paste text" instead.'
          : "Please paste at least 200 characters.",
      );
      setLoading(false);
      return;
    }

    const chunks = chunkText(rawText);
    const sourceType = mode === "pdf" ? "pdf" : "text";

    try {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({ title: trimmedTitle, source_type: sourceType })
        .select()
        .single();

      if (docErr) throw docErr;
      if (!doc) throw new Error("No document returned after insert.");

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

      setIndexing(true);
      try {
        await embedDocument(doc.id);
      } catch (embedErr) {
        setError(
          `Document saved, but indexing failed: ${(embedErr as Error).message}. You can re-index later.`,
        );
        setIndexing(false);
        setLoading(false);
        return;
      }

      setIndexing(false);
      addDocument(doc);
      showToast("success", `"${trimmedTitle}" added successfully`);
      handleClose();
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white dark:bg-[#161618] border border-border dark:border-[#27272A] shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border dark:border-[#27272A] px-6 py-4">
          <h2
            id="upload-dialog-title"
            className="text-h3 text-text dark:text-[#FAFAFA]"
          >
            Add Document
          </h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-text-muted dark:text-[#71717A] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text-secondary dark:hover:text-[#A1A1AA] transition-colors duration-150"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {/* Title input */}
          <Input
            label="Title"
            placeholder="e.g. Lecture 3 – Linear Regression"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setTitle(e.target.value)
            }
            disabled={loading}
          />

          {/* Mode tabs */}
          <div className="flex gap-0 border-b border-border dark:border-[#27272A]">
            <button
              type="button"
              onClick={() => {
                setMode("pdf");
                setError(null);
              }}
              className={`relative px-4 py-2.5 text-label transition-colors duration-150 ${
                mode === "pdf"
                  ? "text-text dark:text-[#FAFAFA]"
                  : "text-text-muted dark:text-[#71717A] hover:text-text-secondary dark:hover:text-[#A1A1AA]"
              }`}
              disabled={loading}
            >
              Upload PDF
              {mode === "pdf" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("text");
                setError(null);
              }}
              className={`relative px-4 py-2.5 text-label transition-colors duration-150 ${
                mode === "text"
                  ? "text-text dark:text-[#FAFAFA]"
                  : "text-text-muted dark:text-[#71717A] hover:text-text-secondary dark:hover:text-[#A1A1AA]"
              }`}
              disabled={loading}
            >
              Paste text
              {mode === "text" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          </div>

          {/* PDF dropzone */}
          {mode === "pdf" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150 ${
                dragOver
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20"
                  : "border-border dark:border-[#27272A] bg-bg-subtle dark:bg-[#1C1C1F] hover:border-border-strong dark:hover:border-[#3F3F46]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              {file ? (
                <div className="flex items-center gap-3 w-full justify-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/20 text-brand-500">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="text-left min-w-0 max-w-[60%]">
                    <p className="truncate text-label text-text dark:text-[#FAFAFA] font-medium">
                      {file.name}
                    </p>
                    <p className="text-small text-text-muted dark:text-[#71717A]">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  {!loading && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="rounded-md p-1.5 text-text-muted dark:text-[#71717A] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text-secondary dark:hover:text-[#A1A1AA] transition-colors duration-150"
                    >
                      <FileX className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-muted dark:bg-[#1C1C1F] text-text-muted dark:text-[#71717A]">
                    <Upload className="h-6 w-6" />
                  </span>
                  <p className="text-label text-text-secondary dark:text-[#A1A1AA]">
                    Drop a PDF here, or click to browse
                  </p>
                  <p className="mt-1 text-small text-text-muted dark:text-[#71717A]">
                    PDF files only
                  </p>
                </>
              )}
            </div>
          )}

          {/* Text textarea */}
          {mode === "text" && (
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste your lecture notes here..."
              rows={8}
              className="w-full resize-none rounded-md border border-border dark:border-[#27272A] bg-white dark:bg-[#1C1C1F] px-3 py-2.5 text-body text-text dark:text-[#FAFAFA] placeholder-text-muted dark:placeholder-[#71717A] transition-colors duration-150 ease-out focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]"
              disabled={loading}
            />
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-small text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-border dark:border-[#27272A] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={loading || indexing}
              disabled={loading || indexing}
            >
              {indexing
                ? "Indexing..."
                : loading
                  ? "Saving..."
                  : "Add to Library"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default UploadDialog;
