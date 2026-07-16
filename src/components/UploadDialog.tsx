import { useState, useRef, useEffect, type FormEvent } from "react";
import { fetchCourses, addDocumentToCourse } from "../lib/api";
import { ingestText } from "../lib/ingest";
import {
  fetchYouTubeTranscript,
  extractOfficeText,
  ocrImage,
  transcribeAudio,
} from "../lib/importers";
import { useAppStore } from "../stores/useAppStore";
import { showToast } from "./Toast";
import { Dialog } from "./Dialog";
import { Button } from "./Button";
import { Input } from "./Input";
import {
  Upload,
  FileText,
  FileX,
  Clipboard,
  Check,
  Loader2,
  BookMarked,
  PlayCircle,
  File,
  Image,
  Music,
  Link,
} from "lucide-react";
import { usePressable } from "../hooks/usePressable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
}

type SourceMode =
  | "pdf"
  | "text"
  | "youtube"
  | "office"
  | "image"
  | "audio";

interface SourceTab {
  id: SourceMode;
  label: string;
  icon: React.ReactNode;
  accept?: string;
}

const SOURCE_TABS: SourceTab[] = [
  { id: "pdf", label: "PDF", icon: <Upload className="h-4 w-4" />, accept: ".pdf,application/pdf" },
  { id: "text", label: "Text", icon: <Clipboard className="h-4 w-4" /> },
  { id: "youtube", label: "YouTube", icon: <PlayCircle className="h-4 w-4" /> },
  { id: "office", label: "Office", icon: <File className="h-4 w-4" />, accept: ".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { id: "image", label: "Image", icon: <Image className="h-4 w-4" />, accept: "image/*" },
  { id: "audio", label: "Audio", icon: <Music className="h-4 w-4" />, accept: "audio/*" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Drop Zone Component (reusable for file-based sources)
// ---------------------------------------------------------------------------

function DropZone({
  file,
  dragOver,
  loading,
  accept,
  onDrop,
  onFileSelect,
  onClear,
  onDragOver,
  onDragLeave,
}: {
  file: File | null;
  dragOver: boolean;
  loading: boolean;
  accept: string;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (f: File | null) => void;
  onClear: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pressable = usePressable();

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-hairline bg-surface px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-text truncate font-medium">{file.name}</p>
          <p className="text-small text-text-tertiary">{formatFileSize(file.size)}</p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
            aria-label="Remove file"
            {...pressable}
          >
            <FileX className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={[
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150 ease-standard",
        dragOver
          ? "border-brand-500 bg-brand-50"
          : "border-border-hairline bg-surface-subtle hover:border-border-strong hover:bg-surface",
      ].join(" ")}
      {...pressable}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        disabled={loading}
      />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-tertiary">
        <Upload className="h-6 w-6" />
      </div>
      <p className="text-label text-text-secondary">Drop a file here, or click to browse</p>
      <p className="mt-1 text-small text-text-tertiary">
        {accept.includes("pdf") && "PDF files up to 10 MB"}
        {accept.includes("docx") && "DOCX / PPTX files up to 10 MB"}
        {accept.includes("image") && "Images (PNG, JPG, etc.) up to 10 MB"}
        {accept.includes("audio") && "Audio files (MP3, WAV, M4A, etc.) up to 25 MB"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

function ProgressBar({
  phase,
  customLabel,
}: {
  phase: "saving" | "indexing" | "done" | "extracting" | "transcribing";
  customLabel?: string;
}) {
  const pct =
    phase === "saving" ? 40
    : phase === "extracting" ? 20
    : phase === "transcribing" ? 25
    : phase === "indexing" ? 75
    : 100;

  const labels: Record<string, string> = {
    saving: "Saving document...",
    extracting: "Extracting content...",
    transcribing: "Transcribing audio...",
    indexing: "Indexing content...",
    done: "Done!",
  };

  const label = customLabel || labels[phase] || phase;

  return (
    <div className="rounded-lg border border-border-hairline bg-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-small">
        <span className="flex items-center gap-1.5 text-text-secondary">
          {phase === "done" ? (
            <Check className="h-3.5 w-3.5 text-mastery-high" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
          )}
          {label}
        </span>
        <span className="tabular-nums text-text-tertiary">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source tab components
// ---------------------------------------------------------------------------

function PdfTab({
  file,
  dragOver,
  loading,
  onDrop,
  onFileSelect,
  onClear,
  onDragOver,
  onDragLeave,
}: {
  file: File | null;
  dragOver: boolean;
  loading: boolean;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (f: File | null) => void;
  onClear: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
}) {
  return (
    <DropZone
      file={file}
      dragOver={dragOver}
      loading={loading}
      accept=".pdf,application/pdf"
      onDrop={onDrop}
      onFileSelect={onFileSelect}
      onClear={onClear}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    />
  );
}

function TextTab({
  pastedText,
  loading,
  onChange,
}: {
  pastedText: string;
  loading: boolean;
  onChange: (text: string) => void;
}) {
  const charCount = pastedText.trim().length;
  return (
    <div>
      <textarea
        value={pastedText}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your lecture notes, slides text, or any study material here..."
        rows={8}
        disabled={loading}
        className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-body text-text placeholder:text-text-muted transition-all duration-150 ease-standard focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 min-h-[140px] leading-relaxed"
      />
      <div className="mt-1 flex justify-end">
        <span className="text-caption text-text-tertiary tabular-nums">
          {charCount.toLocaleString()} character{charCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

function YoutubeTab({
  youtubeUrl,
  loading,
  onChange,
}: {
  youtubeUrl: string;
  loading: boolean;
  onChange: (url: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-border-hairline bg-surface-subtle px-4 py-3 text-small text-text-secondary">
        <PlayCircle className="h-4 w-4 text-red-500" />
        <span>Enter a YouTube video URL. Works with any video that has captions (auto-generated or manual).</span>
      </div>
      <div className="relative">
        <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="url"
          value={youtubeUrl}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          disabled={loading}
          className="w-full rounded-md border border-border bg-surface py-2.5 pl-9 pr-3 text-body text-text placeholder-text-muted transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function OfficeTab({
  file,
  loading,
  onFileSelect,
  onClear,
}: {
  file: File | null;
  loading: boolean;
  onFileSelect: (f: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pressable = usePressable();

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-hairline bg-surface px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
          <File className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-text truncate font-medium">{file.name}</p>
          <p className="text-small text-text-tertiary">{formatFileSize(file.size)}</p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
            aria-label="Remove file"
            {...pressable}
          >
            <FileX className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150 ease-standard border-border-hairline bg-surface-subtle hover:border-border-strong hover:bg-surface"
      {...pressable}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pptx"
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        disabled={loading}
      />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-tertiary">
        <File className="h-6 w-6" />
      </div>
      <p className="text-label text-text-secondary">Select a DOCX or PPTX file</p>
      <p className="mt-1 text-small text-text-tertiary">Word documents and PowerPoint presentations up to 10 MB</p>
    </div>
  );
}

function ImageTab({
  file,
  loading,
  onFileSelect,
  onClear,
}: {
  file: File | null;
  loading: boolean;
  onFileSelect: (f: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pressable = usePressable();

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-hairline bg-surface px-4 py-3">
        {file.type.startsWith("image/") && (
          <img
            src={URL.createObjectURL(file)}
            alt="Preview"
            className="h-14 w-14 shrink-0 rounded-lg object-cover border border-border"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-label text-text truncate font-medium">{file.name}</p>
          <p className="text-small text-text-tertiary">{formatFileSize(file.size)}</p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
            aria-label="Remove file"
            {...pressable}
          >
            <FileX className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150 ease-standard border-border-hairline bg-surface-subtle hover:border-border-strong hover:bg-surface"
      {...pressable}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        disabled={loading}
      />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-tertiary">
        <Image className="h-6 w-6" />
      </div>
      <p className="text-label text-text-secondary">Upload an image of notes or slides</p>
      <p className="mt-1 text-small text-text-tertiary">PNG, JPG, etc. up to 10 MB</p>
    </div>
  );
}

function AudioTab({
  file,
  loading,
  onFileSelect,
  onClear,
}: {
  file: File | null;
  loading: boolean;
  onFileSelect: (f: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pressable = usePressable();

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-hairline bg-surface px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
          <Music className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-label text-text truncate font-medium">{file.name}</p>
          <p className="text-small text-text-tertiary">{formatFileSize(file.size)}</p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
            aria-label="Remove file"
            {...pressable}
          >
            <FileX className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150 ease-standard border-border-hairline bg-surface-subtle hover:border-border-strong hover:bg-surface"
      {...pressable}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        disabled={loading}
      />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-tertiary">
        <Music className="h-6 w-6" />
      </div>
      <p className="text-label text-text-secondary">Upload an audio recording of a lecture</p>
      <p className="mt-1 text-small text-text-tertiary">MP3, WAV, M4A, etc. up to 25 MB</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function UploadDialog({ open, onClose }: UploadDialogProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("pdf");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressPhase, setProgressPhase] = useState<
    "saving" | "indexing" | "done" | "extracting" | "transcribing" | null
  >(null);
  const [dragOver, setDragOver] = useState(false);
  const [userCourses, setUserCourses] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const addDocument = useAppStore((s) => s.addDocument);

  useEffect(() => {
    if (open) {
      fetchCourses()
        .then((c) =>
          setUserCourses(c.map(({ id, title }) => ({ id, title })))
        )
        .catch(() => {});
    }
  }, [open]);

  const reset = () => {
    setTitle("");
    setFile(null);
    setPastedText("");
    setYoutubeUrl("");
    setError(null);
    setProgressPhase(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const getSourceType = (): string => {
    switch (sourceMode) {
      case "pdf": return "pdf";
      case "text": return "text";
      case "youtube": return "youtube";
      case "office": {
        if (file) {
          const name = file.name.toLowerCase();
          if (name.endsWith(".docx")) return "docx";
          if (name.endsWith(".pptx")) return "pptx";
        }
        return "office";
      }
      case "image": return "image";
      case "audio": return "audio";
    }
  };

  const getMaxFileSize = (): number => {
    switch (sourceMode) {
      case "pdf":
      case "office":
      case "image": return 10 * 1024 * 1024;
      case "audio": return 25 * 1024 * 1024;
      default: return 10 * 1024 * 1024;
    }
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

    setLoading(true);

    try {
      // ── Step 1: Get raw text from the source ──────────────────────────
      let rawText = "";
      let sourceMeta: Record<string, unknown> | null = null;

      if (sourceMode === "pdf") {
        // PDF extraction
        if (!file) { setError("Please select a PDF file."); setLoading(false); return; }
        if (file.size > getMaxFileSize()) { setError("PDF must be under 10 MB."); setLoading(false); return; }

        setProgressPhase("extracting");
        const pdfjsLib = await import("pdfjs-dist");
        const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          const text = tc.items.map((it: any) => it.str).join(" ");
          pages.push(text);
        }
        rawText = pages.join("\n\n").trim();
        sourceMeta = { pageCount: pdf.numPages };
      } else if (sourceMode === "text") {
        rawText = pastedText.trim();
        if (!rawText) { setError("Please paste some text."); setLoading(false); return; }
        if (rawText.length > 100000) { setError("Pasted text must be under 100,000 characters."); setLoading(false); return; }
      } else if (sourceMode === "youtube") {
        if (!youtubeUrl.trim()) { setError("Please enter a YouTube URL."); setLoading(false); return; }
        setProgressPhase("extracting");
        const result = await fetchYouTubeTranscript(youtubeUrl.trim());
        rawText = result.text;
        sourceMeta = result.sourceMeta as Record<string, unknown>;
      } else if (sourceMode === "office") {
        if (!file) { setError("Please select a DOCX or PPTX file."); setLoading(false); return; }
        if (file.size > getMaxFileSize()) { setError("File must be under 10 MB."); setLoading(false); return; }
        setProgressPhase("extracting");
        const result = await extractOfficeText(file);
        rawText = result.text;
        sourceMeta = { fileName: file.name, originalFormat: result.sourceType };
      } else if (sourceMode === "image") {
        if (!file) { setError("Please select an image."); setLoading(false); return; }
        if (file.size > getMaxFileSize()) { setError("Image must be under 10 MB."); setLoading(false); return; }
        setProgressPhase("extracting");
        const result = await ocrImage(file);
        rawText = result.text;
        sourceMeta = result.sourceMeta as Record<string, unknown>;
      } else if (sourceMode === "audio") {
        if (!file) { setError("Please select an audio file."); setLoading(false); return; }
        if (file.size > getMaxFileSize()) { setError("Audio must be under 25 MB."); setLoading(false); return; }
        setProgressPhase("transcribing");
        const result = await transcribeAudio(file);
        rawText = result.text;
        sourceMeta = result.sourceMeta as Record<string, unknown>;
      }

      if (rawText.length < 200) {
        const msg = sourceMode === "youtube"
          ? 'The YouTube transcript is too short (< 200 chars). Try a longer video or use "Paste text" instead.'
          : "The extracted text is too short (< 200 chars). Please use a different source.";
        setError(msg);
        setLoading(false);
        return;
      }

      // ── Step 2: Ingest via shared pipeline ────────────────────────────
      setProgressPhase("saving");
      const result = await ingestText({
        title: trimmedTitle,
        rawText,
        sourceType: getSourceType(),
        sourceMeta,
      });

      setProgressPhase("done");
      addDocument(result.doc);

      if (result.failedCount > 0) {
        showToast(
          "warning",
          `"${trimmedTitle}" added, but ${result.failedCount} chunks failed to index.`
        );
      } else {
        showToast("success", `"${trimmedTitle}" added successfully`);
      }

      // Optional: assign to course
      if (selectedCourseId) {
        await addDocumentToCourse(selectedCourseId, result.doc.id);
        showToast("success", "Assigned to course");
      }

      setTimeout(() => handleClose(), 600);
    } catch (err) {
      const message = (err as Error).message;
      // Improve error messages for common failures
      if (message.includes("Too short") || message.includes("little text")) {
        setError(message);
      } else if (sourceMode === "youtube" && message.includes("transcript")) {
        setError(
          "Could not fetch transcript. The video may have no captions available. Try a different video or use 'Paste text' instead."
        );
      } else if (sourceMode === "image" && message.includes("NO_TEXT_FOUND")) {
        setError(
          "No readable text could be extracted from this image. It may be blurry, contain only graphics, or the handwriting is not machine-readable."
        );
      } else {
        setError(`${sourceMode === "youtube" ? "YouTube" : sourceMode === "audio" ? "Audio" : sourceMode === "image" ? "OCR" : "Import"} failed: ${message}`);
      }
      setProgressPhase(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      // Auto-detect source mode from file extension
      const name = f.name.toLowerCase();
      if (name.endsWith(".pdf")) setSourceMode("pdf");
      else if (name.endsWith(".docx") || name.endsWith(".pptx")) setSourceMode("office");
      else if (f.type.startsWith("image/")) setSourceMode("image");
      else if (f.type.startsWith("audio/")) setSourceMode("audio");
    }
  };

  const buttonLabel = (() => {
    if (loading) {
      if (progressPhase === "extracting") return "Extracting...";
      if (progressPhase === "transcribing") return "Transcribing...";
      if (progressPhase === "indexing") return "Indexing...";
      return "Saving...";
    }
    return "Add to Library";
  })();

  return (
    <Dialog open={open} onClose={handleClose} title="Add Document" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <Input
          label="Title"
          placeholder='e.g. "Lecture 3 – Linear Regression"'
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setTitle(e.target.value)
          }
          disabled={loading}
        />

        {/* Source tabs */}
        <div className="flex flex-wrap gap-0 border-b border-border-hairline">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSourceMode(tab.id);
                setFile(null);
                setPastedText("");
                setYoutubeUrl("");
                setError(null);
              }}
              className={`relative px-3 py-2.5 text-label transition-colors duration-150 ${
                sourceMode === tab.id
                  ? "text-text"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
              disabled={loading}
            >
              <span className="mr-1.5 inline-block">{tab.icon}</span>
              {tab.label}
              {sourceMode === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          ))}
        </div>

        {/* Source content */}
        {sourceMode === "pdf" && (
          <PdfTab
            file={file}
            dragOver={dragOver}
            loading={loading}
            onDrop={handleDrop}
            onFileSelect={(f) => setFile(f)}
            onClear={() => setFile(null)}
            onDragOver={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
          />
        )}
        {sourceMode === "text" && (
          <TextTab
            pastedText={pastedText}
            loading={loading}
            onChange={(t) => setPastedText(t)}
          />
        )}
        {sourceMode === "youtube" && (
          <YoutubeTab
            youtubeUrl={youtubeUrl}
            loading={loading}
            onChange={(u) => setYoutubeUrl(u)}
          />
        )}
        {sourceMode === "office" && (
          <OfficeTab
            file={file}
            loading={loading}
            onFileSelect={(f) => setFile(f)}
            onClear={() => setFile(null)}
          />
        )}
        {sourceMode === "image" && (
          <ImageTab
            file={file}
            loading={loading}
            onFileSelect={(f) => setFile(f)}
            onClear={() => setFile(null)}
          />
        )}
        {sourceMode === "audio" && (
          <AudioTab
            file={file}
            loading={loading}
            onFileSelect={(f) => setFile(f)}
            onClear={() => setFile(null)}
          />
        )}

        {/* Course assignment */}
        {!loading && userCourses.length > 0 && (
          <div>
            <label className="mb-1.5 block text-small font-medium text-text-secondary">
              Assign to course{" "}
              <span className="text-text-muted">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {userCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() =>
                    setSelectedCourseId(
                      selectedCourseId === course.id ? null : course.id
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label transition-colors ${
                    selectedCourseId === course.id
                      ? "bg-brand-500 text-white"
                      : "border border-border bg-surface text-text-secondary hover:bg-surface-subtle"
                  }`}
                >
                  <BookMarked className="h-3.5 w-3.5" />
                  {course.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {progressPhase && progressPhase !== "done" && (
          <ProgressBar
            phase={progressPhase}
            customLabel={
              progressPhase === "extracting"
                ? sourceMode === "youtube"
                  ? "Fetching transcript..."
                  : sourceMode === "pdf"
                    ? "Reading PDF..."
                    : sourceMode === "office"
                      ? "Extracting text..."
                      : "Processing image..."
                : progressPhase === "transcribing"
                  ? "Transcribing audio..."
                  : undefined
            }
          />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-error/30 bg-danger-subtle px-4 py-3 text-small text-danger-on-subtle">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-danger">⚠</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-border-hairline pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={loading} disabled={loading}>
            {buttonLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default UploadDialog;
