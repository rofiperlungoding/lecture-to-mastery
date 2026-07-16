import { useEffect, useState, useCallback, useRef } from "react";
import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { Route as RootRoute } from "./__root";
import { useAppStore } from "../stores/useAppStore";
import { supabase } from "../lib/supabase";
import { chunkText } from "../lib/chunk";
import {
  embedDocument, resetDocumentEmbeddings, getFailedChunksCount, getEmbeddingProgress,
  getConceptMastery, generateTargetedPractice,
  getGlobalDueCount, getStudyStreak, getRecentActivity,
  getQuizHistory, getAvgMastery, getDocDueCounts, getDocMasteryMap,
  fetchCourses, createCourse, getAtRiskDocIds,
  type ActivityItem, type QuizAttemptSummary,
} from "../lib/api";
import { demoContent } from "../lib/demoContent";
import { showToast } from "../components/Toast";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Dialog } from "../components/Dialog";
import { Skeleton, SkeletonStatCard, SkeletonDocumentCard, SkeletonActivityItem } from "../components/Skeleton";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { QuizSparkline } from "../components/Charts";
import { EmptyState } from "../components/EmptyState";
import { DocumentCard } from "../components/DocumentCard";
import { ListRow } from "../components/ListRow";
import { FirstRunOnboarding } from "../components/FirstRunOnboarding";
import { IllusAllCaughtUp } from "../components/EmptyIllustrations";
import { Plus, Zap, Flame, Target, BookOpen, TrendingUp, Clock, Sparkles, CheckCircle, MessageSquare, Pin, Lightbulb, Layers, BookMarked, FolderPlus } from "lucide-react";
import { PageContainer } from "../components/PageContainer";
import { ACHIEVEMENT_DEFS, type UserStats } from "../types/db";
import {
  fetchEarnedAchievements, fetchUserStats,
  getNextAchievement, calcLevel,
} from "../lib/gamification";

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  subtitle?: string
  accent?: "brand" | "emerald" | "amber" | "violet"
  loading?: boolean
}

const accentMap = {
  brand: "bg-brand-50 dark:bg-brand-950/20 text-brand-600 dark:text-brand-400",
  emerald: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400",
}

function StatCard({ icon, label, value, subtitle, accent = "brand", loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </Card>
    )
  }
  return (
    <Card className="flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentMap[accent]}`}>
        {icon}
      </div>        <div className="min-w-0">
          <p className="text-subhead text-text-secondary truncate">{label}</p>
          <p className="text-title-2 tabular-nums text-text mt-0.5">
            {loading ? '—' : (
              <AnimatedCounter value={Number(value)} format={(v) => {
                if (label === 'Study streak') return `${v} day${v !== 1 ? 's' : ''}`
                if (label === 'Avg mastery') return `${v}%`
                return String(v)
              }} />
            )}
          </p>
          {subtitle && (
            <p className="text-footnote text-text-secondary mt-0.5">{subtitle}</p>
          )}
        </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Activity icon
// ---------------------------------------------------------------------------
function ActivityIcon({ eventType }: { eventType: string }) {
  const cls = "h-4 w-4"
  switch (eventType) {
    case "quiz_answer": return <Lightbulb className={cls} />
    case "quiz_completed": return <CheckCircle className={cls} />
    case "flashcard_review": return <Layers className={cls} />
    case "summary_view": return <BookOpen className={cls} />
    case "chat_query": return <MessageSquare className={cls} />
    default: return <Pin className={cls} />
  }
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500"
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface-muted overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

// ============================================================================
// Main page component
// ============================================================================
function IndexPage() {
  const navigate = useNavigate();
  const documents = useAppStore((s) => s.documents);
  const loadingDocs = useAppStore((s) => s.loadingDocs);
  const fetchDocuments = useAppStore((s) => s.fetchDocuments);
  const addDocument = useAppStore((s) => s.addDocument);
  const setUploadOpen = useAppStore((s) => s.setUploadOpen);

  // Course state
  const [courses, setCourses] = useState<Array<{ id: string; title: string; description: string; document_count: number; created_at: string }>>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Demo loading state
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoPhase, setDemoPhase] = useState<'idle' | 'saving' | 'indexing' | 'embedding' | 'done' | 'error'>('idle');

  // Embedding progress for real-time feedback
  const [embedProgress, setEmbedProgress] = useState<{ embedded: number; total: number } | null>(null);
  const [_embedError, setEmbedError] = useState<string | null>(null);
  const demoDocIdRef = useRef<string | null>(null);

  // Failed chunks + reindexing
  const [failedChunks, setFailedChunks] = useState<Record<string, number>>({});
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  // Weak spots
  const [weakSpots, setWeakSpots] = useState<Record<string, number>>({});
  const [studyingWeak, setStudyingWeak] = useState<string | null>(null);

  // Achievements & XP
  const [earnedAchievements, setEarnedAchievements] = useState<Set<string>>(new Set())
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [achievementsLoading, setAchievementsLoading] = useState(true)

  // At-risk retention
  const [atRiskDocs, setAtRiskDocs] = useState<Record<string, number>>({});
  const [atRiskTotal, setAtRiskTotal] = useState<number | null>(null);

  // Dashboard data
  const [dueCount, setDueCount] = useState<number | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  const [avgMastery, setAvgMastery] = useState<number | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [quizHistory, setQuizHistory] = useState<QuizAttemptSummary[] | null>(null)
  const [docDueCounts, setDocDueCounts] = useState<Record<string, number>>({})
  const [docMastery, setDocMastery] = useState<Record<string, number>>({})
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const dashboardFetched = useRef(false)

  useEffect(() => {
    fetchDocuments();
    fetchCourses().then((c) => { setCourses(c); setCoursesLoading(false); }).catch(() => setCoursesLoading(false));
  }, [fetchDocuments]);

  // Fetch all dashboard data once after documents load
  useEffect(() => {
    if (loadingDocs || dashboardFetched.current) return
    dashboardFetched.current = true
    setDashboardLoading(true)
    Promise.all([
      getGlobalDueCount().catch(() => 0),
      getStudyStreak().catch(() => 0),
      getAvgMastery().catch(() => 0),
      getRecentActivity(10).catch(() => []),
      getQuizHistory(10).catch(() => []),
      getDocDueCounts().catch(() => ({})),
      getDocMasteryMap().catch(() => ({})),
    ]).then(([due, str, mastery, act, quiz, dueMap, mastMap]) => {
      setDueCount(due)
      setStreak(str)
      setAvgMastery(mastery)
      setActivity(act)
      setQuizHistory(quiz)
      setDocDueCounts(dueMap)
      setDocMastery(mastMap)
    }).catch(() => {}).finally(() => setDashboardLoading(false))
  }, [loadingDocs])

  // Fetch achievements + user stats after dashboard data loads
  useEffect(() => {
    if (dashboardLoading) return
    setAchievementsLoading(true)
    Promise.all([
      fetchEarnedAchievements().catch(() => new Set<string>()),
      fetchUserStats().catch(() => null),
    ]).then(([earned, stats]) => {
      setEarnedAchievements(earned)
      setUserStats(stats)
    }).finally(() => setAchievementsLoading(false))
  }, [dashboardLoading])

  // Check for failed chunks, weak spots, and at-risk retention after documents load
  useEffect(() => {
    if (documents.length === 0) return;
    const checkIssues = async () => {
      const failedMap: Record<string, number> = {};
      const weakMap: Record<string, number> = {};
      const atRiskMap: Record<string, number> = {};

      // Fetch at-risk counts across all docs (uses retention model)
      try {
        const atRiskList = await getAtRiskDocIds()
        for (const { docId, count } of atRiskList) {
          atRiskMap[docId] = count
        }
      } catch { /* ignore */ }

      for (const doc of documents) {
        try {
          const count = await getFailedChunksCount(doc.id);
          if (count > 0) failedMap[doc.id] = count;
        } catch { /* ignore */ }
        try {
          const concepts = await getConceptMastery(doc.id);
          const weakCount = concepts.filter((c) => c.masteryPct < 70).length;
          if (weakCount > 0) weakMap[doc.id] = weakCount;
        } catch { /* ignore */ }
      }
      setFailedChunks(failedMap);
      setWeakSpots(weakMap);
      setAtRiskDocs(atRiskMap);
      setAtRiskTotal(Object.values(atRiskMap).reduce((sum, c) => sum + c, 0));
    };
    checkIssues();
  }, [documents]);

  const demoPhaseRef = useRef<string>(demoPhase);
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
            showToast("success", `Demo fully indexed! ${progress.embedded} chunks ready.`);
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
          setEmbedError(`${embedResult.failedCount} chunk(s) failed to index.`);
          setDemoPhase('error');
          showToast("warning", `Demo indexed with ${embedResult.failedCount} failed chunks. Click Retry or Re-index.`);
          setFailedChunks((prev) => ({ ...prev, [doc.id]: embedResult.failedCount }));
        } else {
          embeddingComplete = true;
          setDemoPhase('done');
          setEmbedProgress({ embedded: embedResult.embedded, total: embedResult.embedded || 1 });
          showToast("success", `Demo fully indexed! ${embedResult.embedded} chunks ready.`);
        }
      } catch (err) {
        clearInterval(pollInterval);
        if (embeddingComplete) return; // Already handled by poll
        setEmbedError((err as Error).message);
        setDemoPhase('error');
        showToast("error", `Embedding failed: ${(err as Error).message}. Click Retry.`);
      }
    } catch (err) {
      setEmbedError((err as Error).message);
      setDemoPhase('error');
      showToast("error", `Failed to load demo: ${(err as Error).message}`);
    } finally {
      // Use ref to avoid stale closure
      if (demoPhaseRef.current !== 'embedding' && demoPhaseRef.current !== 'indexing') {
        setDemoLoading(false);
      }
    }
  };
  const handleStudyWeakSpots = useCallback(async (docId: string, mode: 'quiz' | 'flashcards') => {
    setStudyingWeak(docId);
    try {
      await generateTargetedPractice(docId, mode);
      navigate({ to: `/doc/${docId}`, params: { docId } });
      showToast('success', `Targeted ${mode} generated for weak spots!`);
    } catch (err) {
      showToast('error', `Failed: ${(err as Error).message}`);
    } finally {
      setStudyingWeak(null);
    }
  }, [navigate]);

  const handleReindex = async (docId: string) => {
    setReindexingId(docId);
    try {
      await resetDocumentEmbeddings(docId);
      const result = await embedDocument(docId);
      if (result.failedCount > 0) {
        showToast("warning", `Re-indexed with ${result.failedCount} chunks still failing.`);
        setFailedChunks((prev) => ({ ...prev, [docId]: result.failedCount }));
      } else {
        showToast("success", `Re-index complete! ${result.embedded} chunks indexed.`);
        setFailedChunks((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
      }
    } catch (err) {
      showToast("error", `Re-index failed: ${(err as Error).message}`);
    } finally {
      setReindexingId(null);
    }
  };

  // --- Greeting ---
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return "Good morning"
    if (h < 17) return "Good afternoon"
    return "Good evening"
  })()

  // --- Derived: docs needing attention (due cards or low mastery) ---
  const continueDocs = documents
    .map((doc) => ({
      doc,
      dueCount: docDueCounts[doc.id] ?? 0,
      mastery: docMastery[doc.id],
    }))
    .filter((d) => d.dueCount > 0 || (d.mastery !== undefined && d.mastery < 70))
    .sort((a, b) => {
      // Due cards first, then by mastery ascending
      if (a.dueCount && !b.dueCount) return -1
      if (!a.dueCount && b.dueCount) return 1
      return (a.mastery ?? 100) - (b.mastery ?? 100)
    })

  // ===========================================================================
  // RENDER: Loading
  // ===========================================================================
  if (loadingDocs) {
    return (
      <PageContainer className="bg-canvas">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map((i) => <SkeletonStatCard key={i} />)}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map((i) => <SkeletonDocumentCard key={i} />)}
          </div>
        </div>
      </PageContainer>
    );
  }

  // ===========================================================================
  // RENDER: Empty
  // ===========================================================================
  if (documents.length === 0) {
    return (
      <PageContainer className="flex min-h-[60vh] items-center justify-center bg-canvas">
        <EmptyState
          illustration="documents"
          title="Your library is empty"
          description="Upload a lecture PDF, paste your notes, or load the demo to get started. Your study materials live here."
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button onClick={() => setUploadOpen(true)}>Add Document</Button>
              <Button
                variant="secondary"
                onClick={loadDemo}
                isLoading={demoLoading}
                disabled={demoLoading}
              >
                {demoLoading
    ? demoPhase === 'saving' ? 'Saving...'
      : demoPhase === 'embedding' && embedProgress
        ? `Embedding ${embedProgress.embedded}/${embedProgress.total}...`
        : demoPhase === 'error' ? 'Retry'
        : 'Indexing...'
    : demoPhase === 'done' ? 'Done ✓'
    : "Load Demo"}
              </Button>
            </div>
          }
        />
      </PageContainer>
    );
  }

  // ===========================================================================
  // RENDER: Dashboard
  // ===========================================================================
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex-1 overflow-auto">
        <PageContainer>
          {/* ====== Header ====== */}
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-display text-text text-balance">
                {greeting}! 👋
              </h1>
              <p className="mt-2 text-callout text-text-secondary">
                <span className="tabular-nums">{documents.length}</span> document{documents.length !== 1 ? "s" : ""} in your library
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Button
                variant="secondary"
                onClick={loadDemo}
                isLoading={demoLoading}
                disabled={demoLoading}
                size="sm"
              >
                {demoLoading
    ? demoPhase === 'saving' ? 'Saving...'
      : demoPhase === 'embedding' && embedProgress
        ? `Embedding ${embedProgress.embedded}/${embedProgress.total}...`
        : demoPhase === 'error' ? 'Retry'
        : 'Indexing...'
    : demoPhase === 'done' ? 'Done ✓'
    : "Load Demo"}
              </Button>
              <Button
                onClick={() => setUploadOpen(true)}
                leadingIcon={<Plus className="h-4 w-4" />}
              >
                Add Document
              </Button>
            </div>
          </div>

          {/* ====== First-run Onboarding (shown once) ====== */}
          <FirstRunOnboarding
            onLoadDemo={loadDemo}
            onAddDocument={() => setUploadOpen(true)}
            demoLoading={demoLoading}
            demoPhase={demoPhase}
          />

          {/* ====== At-Risk Retention Banner ====== */}
          {atRiskTotal !== null && atRiskTotal > 0 && (
            <div className="mb-6 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100">
                    <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-label font-medium text-violet-800">
                      Refresh soon — {atRiskTotal} concept{atRiskTotal !== 1 ? 's' : ''} at risk of forgetting
                    </p>
                    <p className="text-small text-violet-600">
                      Predicted retention below 60%. Review these to reinforce your memory.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====== Stat Cards ====== */}
          <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <StatCard
              icon={<BookOpen className="h-5 w-5" />}
              label="Cards due today"
              value={dueCount ?? 0}
              subtitle={dueCount ? "Ready to review" : "All caught up!"}
              accent="brand"
              loading={dashboardLoading}
            />
            <StatCard
              icon={<Flame className="h-5 w-5" />}
              label="Study streak"
              value={streak ?? 0}
              subtitle={streak ? "Keep it going!" : "Start a new streak"}
              accent="amber"
              loading={dashboardLoading}
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="Avg mastery"
              value={avgMastery ?? 0}
              subtitle={(avgMastery ?? 0) >= 70 ? "Looking good!" : "Room to improve"}
              accent={(avgMastery ?? 0) >= 70 ? "emerald" : "amber"}
              loading={dashboardLoading}
            />
            <StatCard
              icon={<Sparkles className="h-5 w-5" />}
              label="Documents"
              value={documents.length}
              subtitle="In your library"
              accent="violet"
              loading={dashboardLoading}
            />
            <StatCard
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              }
              label="Need refresh"
              value={atRiskTotal ?? 0}
              subtitle={atRiskTotal ? 'At-risk concepts' : 'All clear!'}
              accent={atRiskTotal ? 'amber' : 'emerald'}
              loading={dashboardLoading}
            />
          </div>

          {/* ====== Courses ====== */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-title-2 text-text flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-brand-500" />
                Courses
              </h2>
              <Button variant="secondary" size="sm" onClick={() => setShowCreateCourse(true)} leadingIcon={<FolderPlus className="h-4 w-4" />}>
                New Course
              </Button>
            </div>

            {coursesLoading ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {[1,2].map(i => <SkeletonDocumentCard key={i} />)}
              </div>
            ) : courses.length === 0 ? (
              <Card className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <BookMarked className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-label text-text font-medium">No courses yet</p>
                  <p className="text-small text-text-tertiary">Group related lectures into courses to study across them.</p>
                </div>
              </Card>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                {courses.map(course => (
                  <Link key={course.id} to="/course/$courseId" params={{ courseId: course.id }} className="shrink-0 w-64">
                    <Card hoverable className="flex flex-col gap-3 min-h-[120px]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                          <BookMarked className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-subhead text-text font-medium leading-snug line-clamp-2">{course.title}</h4>
                          <p className="text-footnote text-text-muted mt-0.5">{course.document_count} doc{course.document_count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Create Course Dialog */}
          <Dialog open={showCreateCourse} onClose={() => setShowCreateCourse(false)} title="Create Course" size="sm">
            <form onSubmit={async (e) => { e.preventDefault(); setCreatingCourse(true); try { await createCourse(newCourseTitle); showToast('success', 'Course created'); setShowCreateCourse(false); setNewCourseTitle(''); fetchCourses().then(c => setCourses(c)); } catch (err) { showToast('error', `Failed: ${(err as Error).message}`); } finally { setCreatingCourse(false); } }} className="space-y-4">
              <Input
                label="Course Title"
                placeholder="e.g. Data Structures & Algorithms"
                value={newCourseTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCourseTitle(e.target.value)}
                disabled={creatingCourse}
              />
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowCreateCourse(false)} disabled={creatingCourse}>Cancel</Button>
                <Button type="submit" isLoading={creatingCourse} disabled={creatingCourse || !newCourseTitle.trim()}>Create</Button>
              </div>
            </form>
          </Dialog>

          {/* ====== Quiz Score Sparkline ====== */}
          {quizHistory && quizHistory.length >= 2 && (
            <Card className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-brand-500" />
                  <h3 className="text-title-3 text-text">Quiz scores</h3>
                </div>
                <span className="text-footnote text-text-muted tabular-nums">
                  Last {quizHistory.length} attempt{quizHistory.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <QuizSparkline data={quizHistory} className="h-10 w-[120px] shrink-0" />
                <div className="flex gap-3 text-footnote text-text-muted tabular-nums flex-wrap">
                  {quizHistory.slice(-3).map((q, i) => (
                    <span key={i}>
                      <span className="tabular-nums">{q.score}</span>/<span className="tabular-nums">{q.total}</span>
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* ====== Continue Studying ====== */}
          {continueDocs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-title-2 text-text mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Continue studying
              </h2>
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-container stagger-children">
                  {continueDocs.map(({ doc, dueCount: dDue, mastery }) => (
                    <Link
                      key={doc.id}
                      to="/doc/$docId"
                      params={{ docId: doc.id }}
                      className="shrink-0 w-64"
                    >
                      <Card hoverable className="card-lift-hover flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-subhead text-text font-medium leading-snug line-clamp-2">
                            {doc.title}
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {mastery !== undefined && (
                            <div>
                              <div className="flex items-center justify-between text-footnote mb-1">
                                <span className="text-text-secondary">Mastery</span>
                                <span className={`tabular-nums ${mastery >= 80 ? "text-mastery-high" : mastery >= 50 ? "text-mastery-mid" : "text-mastery-low"}`}>
                                  {mastery}%
                                </span>
                              </div>
                              <ProgressBar value={mastery} />
                            </div>
                          )}
                          {dDue > 0 && (
                            <Badge variant="warning">{dDue} due</Badge>
                          )}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ====== All Caught Up ====== */}
          {continueDocs.length === 0 && documents.length > 0 && (
            <div className="mb-8">
              <Card className="flex items-center gap-6">
                <div className="hidden sm:block">
                  <IllusAllCaughtUp />
                </div>
                <div>
                  <h3 className="text-title-3 text-text">You're all caught up!</h3>
                  <p className="mt-1 text-callout text-text-secondary">
                    All your flashcards are reviewed and up to date. Add more study material or come back later.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* ====== Recent Activity ====== */}
          <div className="mb-8">
            <h2 className="text-title-2 text-text mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-500" />
              Recent activity
            </h2>
            {dashboardLoading ? (
              <Card className="!p-0 divide-y divide-border-hairline overflow-hidden card-lift-hover">
                {[1,2,3].map((i) => <SkeletonActivityItem key={i} />)}
              </Card>
            ) : activity && activity.length > 0 ? (
              <Card className="!p-0 divide-y divide-border-hairline overflow-hidden">
                {activity.map((item) => (
                  <Link
                    key={item.id}
                    to="/doc/$docId"
                    params={{ docId: item.docId }}
                  >
                    <ListRow
                      leading={
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950/20">
                          <ActivityIcon eventType={item.eventType} />
                        </div>
                      }
                      trailing={
                        <span className="text-footnote text-text-muted tabular-nums shrink-0">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      }
                    >
                      <p className="text-subhead text-text truncate">
                        {item.summary}
                      </p>
                    </ListRow>
                  </Link>
                ))}
              </Card>
            ) : (
              <EmptyState
                illustration="activity"
                compact
                title="No activity yet"
                description="Start studying and your recent activity will appear here."
              />
            )}
          </div>

          {/* ====== Document Grid ====== */}
          <div className="mb-8">
            <h2 className="text-title-2 text-text mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-500" />
              Your documents
            </h2>
            <div className="stagger-children grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => {
                const dDue = docDueCounts[doc.id]
                const mastery = docMastery[doc.id]
                return (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    dueCount={dDue}
                    mastery={mastery}
                    weakSpotsCount={weakSpots[doc.id]}
                    atRiskCount={atRiskDocs[doc.id]}
                    studyingWeak={studyingWeak === doc.id}
                    isReindexing={reindexingId === doc.id}
                    hasFailedChunks={!!failedChunks[doc.id]}
                    onStudyWeakSpots={handleStudyWeakSpots}
                    onReindex={handleReindex}
                  />
                );
              })}
            </div>
          </div>

          {/* ====== Achievements ====== */}
          <div className="mb-8">
            <h2 className="text-title-2 text-text mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Achievements
              {userStats && (
                <span className="text-footnote text-text-muted font-normal ml-auto">
                  Lv.{calcLevel(userStats.xp)} · {userStats.xp} XP
                </span>
              )}
            </h2>

            {achievementsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {[1,2,3,4,5,6].map((i) => (
                  <Skeleton key={i} className="h-full min-h-[100px] rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Progress toward next achievement */}
                {(() => {
                  const next = getNextAchievement(earnedAchievements, userStats)
                  return next ? (
                    <Card className="mb-4">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{next.def.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-subhead text-text font-medium">Next: {next.def.label}</p>
                          <p className="text-footnote text-text-secondary">{next.def.condition}</p>
                          {next.progress > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                                  style={{ width: `${Math.min(next.progress * 100, 100)}%` }}
                                />
                              </div>
                              <span className="text-footnote text-text-muted tabular-nums">
                                {Math.round(next.progress * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ) : earnedAchievements.size > 0 ? (
                    <Card className="mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🎉</span>
                        <p className="text-subhead text-text-secondary">All achievements earned! Amazing work!</p>
                      </div>
                    </Card>
                  ) : null
                })()}

                {/* Achievement grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {ACHIEVEMENT_DEFS.map((def) => {
                    const unlocked = earnedAchievements.has(def.id)
                    return (
                      <Card
                        key={def.id}
                        className={`flex flex-col items-center justify-center gap-2 p-4 text-center transition-all duration-200 ${
                          unlocked ? '' : 'opacity-50 grayscale'
                        }`}
                      >
                        <span className="text-2xl">{def.icon}</span>
                        <div className="min-w-0">
                          <p className="text-footnote text-text font-medium leading-tight">{def.label}</p>
                          <p className="text-smallest text-text-muted mt-0.5 line-clamp-2">{def.condition}</p>
                        </div>
                        {unlocked && (
                          <span className="text-smallest text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ Unlocked
                          </span>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
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
