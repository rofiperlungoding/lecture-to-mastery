import { useState, useEffect, useCallback } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { Wordmark } from "./Wordmark";
import { Link, useLocation } from "@tanstack/react-router";
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
  ChevronLeft,
  ChevronRight,
  Heart,
  Activity,
  BookMarked,
  RefreshCw,
} from "lucide-react";
import { fetchCourses } from "../lib/api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  fetchUserStats,
  calcLevel,
  xpProgressInLevel,
  xpToNextLevel,
} from "../lib/gamification";
import { showToast } from "./Toast";
import type { UserStats } from "../types/db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const navItems = [
  { label: "Daily Review", path: "/review", icon: RefreshCw },
  { label: "Ask All Notes", path: "/corpus-chat", icon: MessageSquare },
  { label: "Library", path: "/", icon: Library },
  { label: "Progress", path: "/progress", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "About", path: "/about", icon: Heart },
  ...(import.meta.env.DEV ? [{ label: "Health", path: "/health", icon: Activity }] : []),
];



// ---------------------------------------------------------------------------
// Hook: localStorage sidebar state
// ---------------------------------------------------------------------------

function useSidebarState() {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setCollapsed = useCallback((val: boolean) => {
    setCollapsedState(val);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(val));
    } catch { /* noop */ }
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}

// ---------------------------------------------------------------------------
// Nav Link Item
// ---------------------------------------------------------------------------

function NavLink({
  icon: Icon,
  label,
  path,
  collapsed,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive =
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  return (
    <Link
      to={path}
      activeOptions={{ exact: path === "/" }}
      onClick={onClick}
      className={[
        "group relative flex items-center gap-3 rounded-md transition-all duration-150 ease-standard",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        collapsed ? "h-10 justify-center w-10 mx-auto" : "h-10 px-3 w-full",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary",
      ].join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon
        className={[
          "h-5 w-5 shrink-0 transition-colors duration-150",
          isActive ? "text-accent" : "text-current",
        ].join(" ")}
        aria-hidden="true"
      />
      {!collapsed && (
        <span className="text-label font-medium truncate">{label}</span>
      )}

      {/* Active indicator bar */}
      {isActive && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}

      {/* Tooltip when collapsed */}
      {collapsed && (
        <div className="pointer-events-none absolute left-full ml-2 z-50 hidden rounded-md bg-surface-elevated px-2.5 py-1.5 text-label text-text shadow-3 ring-1 ring-border whitespace-nowrap group-hover:block opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {label}
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { collapsed, toggle } = useSidebarState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut, loading } = useAuthStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    fetchUserStats().then(setStats);
    fetchCourses().then(c => { setCourses(c.map(({ id, title }) => ({ id, title }))); }).catch(() => {});
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

  const closeMobile = () => setMobileOpen(false);

  // ===== Desktop Sidebar =====
  const desktopSidebar = (
    <aside
      className={[
        "hidden lg:flex flex-col chrome-sidebar elevated-1 shrink-0",
        "transition-all duration-[var(--dur-base)] ease-standard",
        collapsed ? `w-16` : `w-[260px]`,
      ].join(" ")}
    >
      {/* Brand */}
      <div
        className={[
          "flex shrink-0 items-center border-b border-border-hairline",
          collapsed ? "h-16 justify-center" : "h-16 px-5",
        ].join(" ")}
      >
        {collapsed ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-xs">
            <Library className="h-4 w-4" />
          </div>
        ) : (
          <Wordmark size="sm" />
        )}
      </div>

      {/* XP bar (expanded only) */}
      {!collapsed && (
        <div className="border-b border-border-hairline px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 items-center rounded-md bg-brand-500 px-2 text-caption font-semibold text-white">
                Lv.{level}
              </div>
              {streak > 0 && (
                <div className="flex items-center gap-1 text-caption font-medium text-mastery-low">
                  <Flame className="h-3.5 w-3.5" />
                  {streak}
                </div>
              )}
            </div>
            <span className="text-caption text-text-tertiary">{xp} XP</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-caption text-text-tertiary">
            {xpNext > 0 ? `${xpNext} XP to next level` : "Max level!"}
          </p>
        </div>
      )}

      {/* XP chip (collapsed only) */}
      {collapsed && (
        <div className="flex justify-center border-b border-border-hairline py-3">
          <div className="flex h-6 items-center rounded-md bg-brand-500 px-1.5 text-caption font-semibold text-white">
            Lv.{level}
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <nav className={collapsed ? "flex flex-col items-center gap-1" : "space-y-1"}>
          {/* Search button */}
          <button
            onClick={() => setSearchOpen(true)}
            className={[
              "group relative flex items-center gap-3 rounded-md transition-all duration-150 ease-standard",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              collapsed ? "h-10 justify-center w-10 mx-auto" : "h-10 px-3 w-full",
              "text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary",
            ].join(" ")}
          >
            <Search className="h-5 w-5 shrink-0 text-current" aria-hidden="true" />
            {!collapsed && <span className="text-label font-medium">Search</span>}
            {collapsed && (
              <div className="pointer-events-none absolute left-full ml-2 z-50 hidden rounded-md bg-surface-elevated px-2.5 py-1.5 text-label text-text shadow-3 ring-1 ring-border whitespace-nowrap group-hover:block opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                Search
              </div>
            )}
          </button>

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              collapsed={collapsed}
            />
          ))}

          {/* Courses section */}
          {courses.length > 0 && !collapsed && (
            <div className="pt-4">
              <p className="mb-2 px-3 text-caption font-semibold uppercase tracking-wider text-text-muted">
                Courses
              </p>
              <div className="space-y-0.5">
                {courses.map((course) => (
                  <NavLink
                    key={course.id}
                    icon={BookMarked}
                    label={course.title}
                    path={`/course/${course.id}` as any}
                    collapsed={false}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-border-hairline px-3 py-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-text-tertiary">
              {initials || "?"}
            </div>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary disabled:opacity-50"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-text-tertiary">
                {initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-medium text-text">{displayName}</p>
                {email && (
                  <p className="truncate text-caption text-text-tertiary">{email}</p>
                )}
                {user?.is_anonymous && (
                  <p className="truncate text-caption text-text-tertiary">Guest</p>
                )}
              </div>
              <button
                onClick={handleSignOut}
                disabled={loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary disabled:opacity-50"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <p className="text-caption text-text-tertiary/60">Next Byte Hacks V3</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="flex h-8 items-center justify-center border-t border-border-hairline text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );

  // ===== Mobile Drawer =====
  const mobileButton = (
    <button
      onClick={() => setMobileOpen(!mobileOpen)}
      className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-tertiary shadow-xs lg:hidden hover:bg-surface-subtle"
      aria-label="Toggle navigation menu"
    >
      {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  const mobileScrim = (
    <div
      className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity duration-[var(--dur-base)] ease-standard lg:hidden ${
        mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={closeMobile}
    />
  );

  const mobileDrawer = (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col bg-surface border-r border-border-hairline elevated-2",
        "transition-transform duration-[var(--dur-slow)] ease-spring lg:hidden",
        "pb-safe", // safe-area aware for bottom notch
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
    >
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center px-5 border-b border-border-hairline">
        <Wordmark size="sm" />
      </div>

      {/* XP bar */}
      <div className="px-5 py-3 border-b border-border-hairline">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 items-center rounded-md bg-brand-500 px-2 text-caption font-semibold text-white">
              Lv.{level}
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1 text-caption font-medium text-mastery-low">
                <Flame className="h-3.5 w-3.5" />
                {streak}
              </div>
            )}
          </div>
          <span className="text-caption text-text-tertiary">{xp} XP</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-caption text-text-tertiary">
          {xpNext > 0 ? `${xpNext} XP to next level` : "Max level!"}
        </p>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <nav className="space-y-1">
          <button
            onClick={() => { setSearchOpen(true); closeMobile(); }}
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-label font-medium text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary"
          >
            <Search className="h-5 w-5 shrink-0 text-current" aria-hidden="true" />
            <span>Search</span>
          </button>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              collapsed={false}
              onClick={closeMobile}
            />
          ))}

          {/* Courses in mobile nav */}
          {courses.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 px-3 text-caption font-semibold uppercase tracking-wider text-text-muted">
                Courses
              </p>
              <div className="space-y-0.5">
                {courses.map((course) => (
                  <NavLink
                    key={course.id}
                    icon={BookMarked}
                    label={course.title}
                    path={`/course/${course.id}` as any}
                    collapsed={false}
                    onClick={closeMobile}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-text-tertiary">
            {initials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-medium text-text">{displayName}</p>
            {email && <p className="truncate text-caption text-text-tertiary">{email}</p>}
            {user?.is_anonymous && <p className="truncate text-caption text-text-tertiary">Guest</p>}
          </div>
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-subtle hover:text-text-secondary disabled:opacity-50"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {mobileButton}
      {mobileScrim}
      {mobileDrawer}
      {desktopSidebar}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default Sidebar;
