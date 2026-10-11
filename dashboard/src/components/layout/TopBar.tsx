import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Bell,
  BellRing,
  Sun,
  Moon,
  ChevronDown,
  LogOut,
  Sparkles,
  Maximize,
  Minimize,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.tsx";
import { useTheme } from "../../context/ThemeContext.tsx";
import { useEscalations } from "../../hooks/useEscalations.ts";
import { usePushNotifications } from "../../hooks/usePushNotifications.ts";
import { useSocket } from "../../hooks/useSocket.ts";
import { escalationReasonLabel } from "../../lib/escalationReasons.ts";
import { customerLabel, formatRelative } from "../../lib/format.ts";
import { Avatar } from "../shared/Avatar.tsx";
import { ChannelIcon } from "../shared/ChannelIcon.tsx";
import { RoleBadge } from "../shared/StatusBadge.tsx";
import { SegmentedControl } from "../shared/SegmentedControl.tsx";
import type { AutomationControl } from "./AppShell.tsx";
import { usePageTitleValue } from "./PageTitle.tsx";

type ChannelFilter = "all" | "whatsapp" | "instagram";

interface TopBarProps {
  onOpenSearch: () => void;
  automation: AutomationControl;
}

const PAGE_TITLES: Record<string, { title: string; section?: string }> = {
  "/analytics": { title: "Analytics", section: "Overview" },
  "/inbox": { title: "Inbox", section: "Overview" },
  "/escalations": { title: "Escalations", section: "Overview" },
  "/orders": { title: "Orders", section: "Commerce" },
  "/customers": { title: "Customers", section: "Commerce" },
  "/catalogue": { title: "Catalogue", section: "Commerce" },
  "/broadcast": { title: "Broadcast", section: "Engage" },
  "/templates": { title: "Templates", section: "Engage" },
  "/ig-comments": { title: "IG Comments", section: "Engage" },
  "/knowledge-base": { title: "Knowledge Base", section: "Manage" },
  "/audit-log": { title: "Audit Log", section: "Manage" },
  "/users": { title: "Users & Staff", section: "Manage" },
  "/settings": { title: "Settings", section: "Manage" },
};

/** Realtime connection status from the shared RealtimeProvider (polls every 5s while not connected). */
function ConnectionDot() {
  const { status } = useSocket();
  const meta =
    status === "connected"
      ? {
          label: "Live",
          title: "Real-time updates connected",
          pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          dot: "bg-emerald-500 animate-pulse",
        }
      : status === "connecting"
        ? {
            label: "Connecting",
            title: "Connecting to real-time updates",
            pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
            dot: "bg-amber-500 animate-pulse",
          }
        : {
            label: "Polling",
            title: "Real-time updates unavailable, refreshing every 5s",
            pill: "bg-stone-500/10 text-text-muted",
            dot: "bg-stone-400",
          };
  return (
    <div
      className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium select-none ${meta.pill}`}
      title={meta.title}
      role="status"
    >
      <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden />
      <span className="hidden xl:inline">{meta.label}</span>
      <span className="sr-only xl:hidden">{meta.label}</span>
    </div>
  );
}

/**
 * Channel filter. Real on /inbox (drives the inbox's ?channel= filter). Disabled on /analytics
 * because GET /analytics has no channel filter. Hidden where it would do nothing.
 */
function ChannelFilterControl({ pathname }: { pathname: string }) {
  const [params, setParams] = useSearchParams();

  if (pathname === "/inbox" || pathname === "/analytics") {
    const raw = params.get("channel");
    const value: ChannelFilter = raw === "whatsapp" || raw === "instagram" ? raw : "all";
    return (
      <SegmentedControl<ChannelFilter>
        size="sm"
        value={value}
        onChange={(next) =>
          setParams((prev) => {
            const p = new URLSearchParams(prev);
            if (next === "all") p.delete("channel");
            else p.set("channel", next);
            return p;
          })
        }
        options={[
          { value: "all", label: "All" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "instagram", label: "Instagram" },
        ]}
      />
    );
  }

  return null;
}

/** Bell: real open escalations (GET /escalations, scoped to the user's role by the server). */
function NotificationsMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const escalations = useEscalations();
  const push = usePushNotifications();

  const recent = useMemo(
    () =>
      [...(escalations.data ?? [])]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 6),
    [escalations.data],
  );
  const openCount = escalations.data?.length ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition"
        aria-label={openCount > 0 ? `Notifications: ${openCount} open escalations` : "Notifications"}
        aria-expanded={open}
      >
        <Bell size={18} />
        {openCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl saba-card p-4 shadow-xl border border-border z-50">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h4 className="font-display font-semibold text-sm text-text">Notifications</h4>
            {openCount > 0 && (
              <span className="text-[11px] font-medium text-primary-text">
                {openCount} open {openCount === 1 ? "escalation" : "escalations"}
              </span>
            )}
          </div>

          <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
            {escalations.isPending ? (
              <p className="py-4 text-center text-xs text-text-muted">Loading…</p>
            ) : escalations.isError ? (
              <p className="py-4 text-center text-xs text-danger">Couldn't load escalations.</p>
            ) : recent.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-muted">
                No open escalations. The AI is handling everything.
              </p>
            ) : (
              recent.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/conversations/${e.conversationId}`);
                  }}
                  className="block w-full text-left p-2 rounded-lg bg-surface-muted hover:bg-primary-soft/40 cursor-pointer transition text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <ChannelIcon channel={e.conversation.channelType} size={12} />
                    <span className="font-semibold text-text truncate">
                      {customerLabel(e.conversation.customer)}
                    </span>
                  </span>
                  <span className="block text-text-muted mt-0.5">{escalationReasonLabel(e.reason)}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 inline-block">
                    {formatRelative(e.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/escalations");
              }}
              className="text-xs font-medium text-primary-text hover:underline"
            >
              View all escalations
            </button>
            {(push.state === "prompt" || push.state === "error") && (
              <button
                type="button"
                onClick={() => void push.enable()}
                title={push.error ?? "Get a browser notification for every new escalation"}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
              >
                <BellRing size={12} aria-hidden />
                Enable alerts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition cursor-pointer"
      title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
      aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
    >
      {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
    </button>
  );
}

export function TopBar({ onOpenSearch, automation }: TopBarProps) {
  const location = useLocation();
  const { user, role, isAdmin, logout } = useAuth();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const pageTitle = usePageTitleValue();

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);

  const currentPath = location.pathname;
  const pageMeta = PAGE_TITLES[currentPath] ?? {
    title: pageTitle ?? (currentPath.startsWith("/conversations/") ? "Conversation" : "Dashboard"),
    section: currentPath.startsWith("/conversations/") ? "Escalations" : "Overview",
  };

  const aiPaused = automation.paused;

  return (
    <header className="sticky top-0 z-40 h-14 w-full border-b border-border glass-panel flex items-center justify-between px-4 sm:px-6">
      {/* Left: Page Title & Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="hidden sm:inline text-xs font-medium text-text-muted">{pageMeta.section} /</span>
        <h1 className="font-display font-bold text-base sm:text-lg text-text truncate">{pageMeta.title}</h1>
      </div>

      {/* Centre: Channel Filter Segmented Control */}
      <div className="hidden md:flex items-center">
        <ChannelFilterControl pathname={currentPath} />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* ⌘K Search Button */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted bg-surface-muted border border-border hover:text-text hover:bg-surface transition shadow-2xs"
          title="Search or jump to page (⌘K)"
        >
          <Search size={14} />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden lg:inline text-[10px] font-mono text-text-muted bg-surface px-1 py-0.5 rounded border border-border">
            ⌘K
          </kbd>
        </button>

        {/* Connection Dot */}
        <ConnectionDot />

        {/* AI Pill (Admin Only, real GET /settings + POST /settings/pause with confirm) */}
        {isAdmin && (
          <button
            type="button"
            onClick={automation.requestToggle}
            disabled={aiPaused === undefined || automation.pending}
            aria-pressed={aiPaused === true}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold select-none transition active:scale-98 cursor-pointer disabled:cursor-default disabled:opacity-70 ${
              aiPaused === undefined
                ? "bg-surface-muted text-text-muted border border-border"
                : aiPaused
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
            }`}
            title={aiPaused === undefined ? "Loading automation status" : aiPaused ? "Resume AI auto-replies" : "Pause AI auto-replies"}
          >
            <Sparkles
              size={12}
              className={aiPaused === undefined ? "text-text-muted" : aiPaused ? "text-rose-500" : "text-emerald-500"}
            />
            <span>{aiPaused === undefined ? "AI …" : aiPaused ? "AI paused" : "AI on"}</span>
          </button>
        )}

        {/* Notification Bell */}
        <NotificationsMenu />

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition"
          title={`Current: ${theme}. Click to switch theme.`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? (
            <Sun size={18} className="text-amber-400 transition-transform hover:rotate-45" />
          ) : (
            <Moon size={18} className="text-stone-700 transition-transform hover:-rotate-12" />
          )}
        </button>

        {/* Fullscreen Toggle Button */}
        <FullscreenToggle />

        {/* Avatar Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-surface-muted transition"
            aria-label="Open profile menu"
          >
            <Avatar name={user?.name ?? "?"} size="sm" showOnline />
            <ChevronDown size={14} className="text-text-muted hidden sm:inline" />
          </button>

          {avatarMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl saba-card p-3 shadow-xl border border-border z-50">
              {/* User info (from the backend) */}
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <Avatar name={user?.name ?? "?"} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-text truncate">{user?.name}</p>
                  {user?.email && <p className="text-xs text-text-muted truncate">{user.email}</p>}
                </div>
                {role && <RoleBadge role={role} />}
              </div>

              {/* Theme Selector */}
              <div className="py-2.5 border-b border-border">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Theme</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`capitalize px-2 py-1 rounded text-xs transition ${
                        theme === t
                          ? "bg-surface-muted font-bold text-text border border-border"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Log Out */}
              <button
                type="button"
                onClick={() => {
                  setAvatarMenuOpen(false);
                  void logout();
                }}
                className="w-full mt-2 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-rose-500/10 transition"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
