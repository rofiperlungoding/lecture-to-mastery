import { useEffect, useState } from "react";
import { createRoute, Link } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { useAppStore } from "../stores/useAppStore";
import { supabase } from "../lib/supabase";
import { chunkText } from "../lib/chunk";
import { embedDocument } from "../lib/api";
import { demoContent } from "../lib/demoContent";
import { showToast } from "../components/Toast";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { Plus } from "lucide-react";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

function IndexPage() {
  const documents = useAppStore((s) => s.documents);
  const loadingDocs = useAppStore((s) => s.loadingDocs);
  const fetchDocuments = useAppStore((s) => s.fetchDocuments);
  const addDocument = useAppStore((s) => s.addDocument);
  const setUploadOpen = useAppStore((s) => s.setUploadOpen);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const loadDemo = async () => {
    setDemoLoading(true);
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
      showToast("success", "Demo document added! Indexing in progress...");

      embedDocument(doc.id).catch(() => {});
    } catch (err) {
      showToast("error", `Failed to load demo: ${(err as Error).message}`);
    } finally {
      setDemoLoading(false);
    }
  };

  if (loadingDocs) {
    return (
      <PageContainer className="flex items-center justify-center min-h-[60vh] bg-canvas dark:bg-[#0B0B0C]">
        <Spinner size="lg" />
      </PageContainer>
    );
  }

  if (documents.length === 0) {
    return (
      <PageContainer className="flex min-h-[60vh] items-center justify-center bg-canvas dark:bg-[#0B0B0C]">
        <EmptyState
          icon={<span className="text-2xl">📚</span>}
          title="No documents yet"
          description="Upload a lecture PDF, paste your notes, or load the demo to get started."
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button onClick={() => setUploadOpen(true)}>Add Document</Button>
              <Button
                variant="outline"
                onClick={loadDemo}
                isLoading={demoLoading}
                disabled={demoLoading}
              >
                {demoLoading ? "Loading..." : "Load Demo"}
              </Button>
            </div>
          }
        />
      </PageContainer>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas dark:bg-[#0B0B0C]">
      {/* Header anchor */}
      <div className="border-b border-border dark:border-[#27272A] bg-white dark:bg-[#161618]">
        <PageContainer className="py-5">
          <PageHeader
            title="Library"
            meta={`${documents.length} document${documents.length !== 1 ? "s" : ""}`}
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={loadDemo}
                  isLoading={demoLoading}
                  disabled={demoLoading}
                  size="sm"
                >
                  {demoLoading ? "Loading..." : "Load Demo"}
                </Button>
                <Button
                  onClick={() => setUploadOpen(true)}
                  leadingIcon={<Plus className="h-4 w-4" />}
                >
                  Add Document
                </Button>
              </>
            }
          />
        </PageContainer>
      </div>

      {/* Content canvas */}
      <div className="flex-1 overflow-auto">
        <PageContainer>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Link key={doc.id} to="/doc/$docId" params={{ docId: doc.id }}>
                <Card
                  hoverable
                  className="flex h-full min-h-[210px] flex-col bg-white dark:bg-[#161618] border border-border dark:border-[#27272A] rounded-xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/20 shadow-xs">
                    <svg
                      className="h-6 w-6 text-brand-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-h3 text-text dark:text-[#FAFAFA] line-clamp-2 leading-snug">
                    {doc.title}
                  </h3>
                  <div className="mt-auto flex items-center gap-3 pt-5">
                    <Badge variant="info">{doc.source_type}</Badge>
                    <span className="text-caption text-text-muted dark:text-[#71717A]">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-950/20 px-2.5 py-0.5 text-caption font-medium text-brand-700 dark:text-brand-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Ready
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </PageContainer>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: IndexPage,
});
