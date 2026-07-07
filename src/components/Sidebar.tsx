import { useState, useEffect } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { Link } from "@tanstack/react-router";
import {
  Library,
  X,
  Menu,
  LogOut,
  Settings,
  BarChart3,
  Flame,
  Search,
  MessageSquare,
} from "lucide-react";
import { useAuthStore } from "../stores/useAuthStore";
import {
  fetchUserStats,
  calcLevel,
  xpProgressInLevel,
  xpToNextLevel,
} from "../lib/gamification";
import { showToast } from "./Toast";
import type { UserStats } from "../types/db";

const navItems = [
  { label: "Ask All Notes", path: "/corpus-chat", icon: MessageSquare },
  { label: "Library", path: "/", icon: Library },
  { label: "Progress", path: "/progress", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

export function Sidebar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, loading } = useAuthStore();
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    fetchUserStats().then(setStats);
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Guest";

  const email = user?.email || "";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = "/login";
    } catch {
      showToast("error", "Failed to sign out");
    }
  };

  const xp = stats?.xp ?? 0;
  const level = stats?.level ?? calcLevel(xp);
  const progress = xpProgressInLevel(xp);
  const xpNext = xpToNextLevel(xp);
  const streak = stats?.current_streak ?? 0;

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-md border border-border dark:border-[#27272A] bg-white dark:bg-[#161618] text-text-secondary dark:text-[#A1A1AA] p-2.5 shadow-xs lg:hidden hover:bg-bg-muted dark:hover:bg-[#1C1C1F]"
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={`fixed inset-0 z-30 bg-black/20 dark:bg-black/40 transition-opacity duration-200 ease-out lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-border dark:border-[#27272A] bg-white dark:bg-[#161618] shadow-sm transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo / wordmark */}
        <div className="flex h-16 items-center gap-3 border-b border-border dark:border-[#27272A] px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-label font-bold text-white shadow-xs">
            L
          </div>
          <span className="text-label font-semibold text-text dark:text-[#FAFAFA]">
            Lecture-to-Mastery
          </span>
        </div>

        {/* XP Bar & Level */}
        <div className="border-b border-border dark:border-[#27272A] px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 items-center rounded-md bg-brand-500 px-2 text-caption font-semibold text-white">
                Lv.{level}
              </div>
              {streak > 0 && (
                <div className="flex items-center gap-1 text-caption font-medium text-orange-500">
                  <Flame className="h-3.5 w-3.5" />
                  {streak}
                </div>
              )}
            </div>
            <span className="text-caption text-text-muted dark:text-[#71717A]">
              {xp} XP
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-muted dark:bg-[#1C1C1F]">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-caption text-text-muted dark:text-[#71717A]">
            {xpNext > 0 ? `${xpNext} XP to next level` : "Max level!"}
          </p>
        </div>

        {/* Nav section */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
          <p className="mb-3 px-3 text-sectionLabel uppercase tracking-wider text-text-muted dark:text-[#71717A]">
            Workspace
          </p>

          <nav className="space-y-1">
            <button
              onClick={() => setSearchOpen(true)}
              className="group relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-label font-medium text-text-secondary dark:text-[#A1A1AA] transition-colors duration-150 ease-out hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text dark:hover:text-[#FAFAFA]"
            >
              <Search
                className="h-[18px] w-[18px] shrink-0 text-current"
                aria-hidden="true"
              />
              <span>Search</span>
            </button>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                activeOptions={{ exact: true }}
                className="group relative flex h-10 items-center gap-3 rounded-md px-3 text-label font-medium text-text-secondary dark:text-[#A1A1AA] transition-colors duration-150 ease-out hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text dark:hover:text-[#FAFAFA] [&.active]:bg-brand-550 [&.active]:bg-brand-50 dark:[&.active]:bg-brand-950/20 [&.active]:text-brand-700 dark:[&.active]:text-brand-400"
                onClick={() => setMobileOpen(false)}
              >
                <item.icon
                  className="h-[18px] w-[18px] shrink-0 text-current [.active_&]:text-brand-500"
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-500 [.active>&]:block" />
              </Link>
            ))}
          </nav>
        </div>

        {/* Footer user block */}
        <div className="border-t border-border dark:border-[#27272A] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-muted dark:bg-[#1C1C1F] text-caption font-semibold text-text-secondary dark:text-[#A1A1AA]">
              {initials || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-medium text-text dark:text-[#FAFAFA]">
                {displayName}
              </p>
              {email && (
                <p className="truncate text-caption text-text-muted dark:text-[#71717A]">
                  {email}
                </p>
              )}
              {user?.is_anonymous && (
                <p className="truncate text-caption text-text-muted dark:text-[#71717A]">
                  Guest
                </p>
              )}
            </div>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted dark:text-[#71717A] transition-colors duration-150 ease-out hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text-secondary dark:hover:text-[#A1A1AA] disabled:opacity-50"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-caption text-text-muted/60 dark:text-[#71717A]/60">
            Next Byte Hacks V3
          </p>
          <GlobalSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      </aside>
    </>
  );
}
export default Sidebar;
