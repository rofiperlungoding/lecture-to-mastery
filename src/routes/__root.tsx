import {
  createRootRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Sidebar } from "../components/Sidebar";
import { ToastContainer } from "../components/Toast";
import { useAuthStore } from "../stores/useAuthStore";
import { useAppStore } from "../stores/useAppStore";
import { useThemeStore } from "../stores/useThemeStore";
import { ThemeToggle } from "../components/ThemeToggle";
import { CommandPalette } from "../components/CommandPalette";
import { ShortcutsCheatSheet } from "../components/ShortcutsCheatSheet";
import { UploadDialog } from "../components/UploadDialog";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const { user, initialized } = useAuthStore.getState();
    if (initialized && !user && location.pathname !== "/login") {
      throw redirect({ to: "/login" });
    }
  },
  component: function RootLayout() {
    const user = useAuthStore((s) => s.user);
    const initialized = useAuthStore((s) => s.initialized);
    const isAnonymous = user?.is_anonymous ?? false;
    const isLoginPage = window.location.pathname === "/login";

    const navigate = useNavigate();
    const isUploadOpen = useAppStore((s) => s.isUploadOpen);
    const setUploadOpen = useAppStore((s) => s.setUploadOpen);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
    const [lastGTime, setLastGTime] = useState<number>(0);

    // Keep theme store reactive so component re-renders if necessary
    useThemeStore();

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isEditable =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        // Cmd+K or Ctrl+K opens Command Palette (do not ignore in editable elements)
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
          e.preventDefault();
          setPaletteOpen((prev) => !prev);
          return;
        }

        // Escape closes modals
        if (e.key === "Escape") {
          if (paletteOpen) {
            e.preventDefault();
            setPaletteOpen(false);
            return;
          }
          if (cheatSheetOpen) {
            e.preventDefault();
            setCheatSheetOpen(false);
            return;
          }
        }

        // If inside inputs/editable fields, ignore other shortcuts
        if (isEditable) return;

        // '/' -> focus the main search input (if present)
        if (e.key === "/") {
          e.preventDefault();
          const inputs = Array.from(
            document.querySelectorAll("input, textarea"),
          ) as HTMLInputElement[];
          const searchInput =
            inputs.find(
              (el) =>
                el.placeholder?.toLowerCase().includes("search") ||
                el.id?.toLowerCase().includes("search") ||
                el.className?.toLowerCase().includes("search"),
            ) || inputs[0];

          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
          return;
        }

        // 'g' then 'l' -> go to Library, 'g' then 'r' -> go to Review (skip if missing)
        if (e.key === "g" || e.key === "G") {
          setLastGTime(Date.now());
          return;
        }

        if (Date.now() - lastGTime <= 1000) {
          if (e.key === "l" || e.key === "L") {
            e.preventDefault();
            navigate({ to: "/" });
            setLastGTime(0);
            return;
          }
          if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            // Review route does not exist, so skip silently
            setLastGTime(0);
            return;
          }
        }

        // 'n' -> open add-document flow
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          setUploadOpen(true);
          return;
        }

        // '?' -> open shortcuts cheat-sheet
        if (e.key === "?") {
          e.preventDefault();
          setCheatSheetOpen(true);
          return;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [paletteOpen, cheatSheetOpen, lastGTime, navigate, setUploadOpen]);

    if (!initialized || isLoginPage) {
      return (
        <div className="min-h-screen bg-canvas dark:bg-[#0B0B0C] text-text dark:text-[#FAFAFA]">
          <Outlet />
          <ToastContainer />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen bg-canvas dark:bg-[#0B0B0C] text-text dark:text-[#FAFAFA]">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-auto bg-canvas dark:bg-[#0B0B0C]">
          {/* Top Bar with theme toggle */}
          <div className="flex h-16 items-center justify-between border-b border-border dark:border-[#27272A] bg-white dark:bg-[#161618] px-6 shrink-0 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="text-small text-text-secondary dark:text-[#A1A1AA] hidden sm:inline">
                Press{" "}
                <kbd className="rounded bg-bg-muted dark:bg-[#1C1C1F] px-1.5 py-0.5 text-caption ring-1 ring-black/5 dark:ring-white/10 font-mono">
                  Ctrl+K
                </kbd>{" "}
                or{" "}
                <kbd className="rounded bg-bg-muted dark:bg-[#1C1C1F] px-1.5 py-0.5 text-caption ring-1 ring-black/5 dark:ring-white/10 font-mono">
                  ⌘K
                </kbd>{" "}
                to open Command Palette
              </span>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </div>

          {/* Guest mode banner with upgrade option */}
          {isAnonymous && <GuestUpgradeBanner />}
          <div className="flex-1 overflow-auto bg-canvas dark:bg-[#0B0B0C]">
            <Outlet />
          </div>
        </main>
        <ToastContainer />

        {/* Global Dialogs, Command Palette, and Cheat Sheet */}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
        />
        <ShortcutsCheatSheet
          open={cheatSheetOpen}
          onClose={() => setCheatSheetOpen(false)}
        />
        <UploadDialog
          open={isUploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      </div>
    );
  },
});

function GuestUpgradeBanner() {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) return;

    setUpgradeError(null);
    setUpgradeLoading(true);

    try {
      const { error: emailError } = await supabase.auth.updateUser({
        email: email.trim(),
      });
      if (emailError) {
        if (
          emailError.message.toLowerCase().includes("already exists") ||
          emailError.message.toLowerCase().includes("already registered")
        ) {
          setUpgradeError(
            "This email is already registered. Please sign in instead.",
          );
        } else {
          throw emailError;
        }
        setUpgradeLoading(false);
        return;
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });
      if (passwordError) {
        throw passwordError;
      }

      setUpgraded(true);
    } catch (err) {
      const msg =
        (err as { message?: string }).message || "Failed to upgrade account";
      setUpgradeError(msg);
    }
    setUpgradeLoading(false);
  };

  if (upgraded) {
    return (
      <div className="flex items-center justify-center border-b border-border dark:border-[#27272A] bg-green-50 dark:bg-green-950/20 px-4 py-2 text-small text-green-700 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-2" />
        Account upgraded! Your work is now saved permanently.
      </div>
    );
  }

  return (
    <div className="border-b border-border dark:border-[#27272A] bg-brand-50 dark:bg-brand-950/10">
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-small text-brand-700 dark:text-brand-400">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        Guest mode &mdash;{" "}
        <button
          onClick={() => setShowForm(!showForm)}
          className="font-medium underline underline-offset-2 hover:text-brand-600 dark:hover:text-brand-300"
        >
          upgrade with email
        </button>{" "}
        to keep your work permanently
      </div>

      {showForm && (
        <div className="mx-auto max-w-md px-4 pb-4">
          <form
            onSubmit={handleUpgrade}
            className="rounded-lg border border-brand-200 dark:border-brand-900/40 bg-white dark:bg-[#161618] p-4 shadow-sm"
          >
            {upgradeError && (
              <div className="mb-3 rounded-md border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-small text-rose-700 dark:text-rose-400">
                {upgradeError}
              </div>
            )}
            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
                disabled={upgradeLoading}
                className="w-full rounded-md border border-border dark:border-[#27272A] bg-white dark:bg-[#1C1C1F] px-3 py-2 text-body text-text dark:text-[#FAFAFA] placeholder-text-muted dark:placeholder-[#71717A] transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
                disabled={upgradeLoading}
                className="w-full rounded-md border border-border dark:border-[#27272A] bg-white dark:bg-[#1C1C1F] px-3 py-2 text-body text-text dark:text-[#FAFAFA] placeholder-text-muted dark:placeholder-[#71717A] transition-colors duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={
                  upgradeLoading || !email.trim() || password.length < 6
                }
                className="w-full rounded-md bg-brand-500 px-4 py-2 text-label font-medium text-white transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {upgradeLoading ? "Upgrading..." : "Upgrade account"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
