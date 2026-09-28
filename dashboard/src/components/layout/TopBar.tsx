import { useLocation } from "react-router-dom";
import { Bell, LogOut, Pause, Play } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { useAuth } from "../../hooks/useAuth.ts";
import { usePause, useSettings } from "../../hooks/useSettings.ts";
import { usePushNotifications } from "../../hooks/usePushNotifications.ts";
import { useSocket } from "../../hooks/useSocket.ts";
import { RoleBadge } from "../ui/Badge.tsx";
import { useToast } from "../ui/Toast.tsx";
import { titleForPath } from "./nav.ts";
import { usePageTitleValue } from "./PageTitle.tsx";

function ConnectionDot() {
  const { status } = useSocket();
  const meta =
    status === "connected"
      ? { dot: "bg-emerald-500", label: "Live" }
      : status === "connecting"
        ? { dot: "bg-amber-400 animate-pulse", label: "Connecting" }
        : { dot: "bg-gray-400", label: "Refreshing every 5s" };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500" title={meta.label}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
      <span className="sr-only sm:not-sr-only">{meta.label}</span>
    </span>
  );
}

/** Admin-only pause/resume shortcut. Shows red while automation is paused. */
function PauseShortcut() {
  const settings = useSettings();
  const pause = usePause();
  const { toast } = useToast();
  if (!settings.data) return null;
  const paused = settings.data.paused;
  return (
    <button
      type="button"
      disabled={pause.isPending}
      onClick={() =>
        pause.mutate(!paused, {
          onSuccess: (res) =>
            toast({
              variant: res.paused ? "warning" : "success",
              title: res.paused ? "Automation paused" : "Automation resumed",
              description: res.paused ? "Messages are stored but the AI won't reply." : "The AI is replying again.",
            }),
          onError: (err) => toast({ variant: "error", title: "Couldn't change automation", description: err.message }),
        })
      }
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-60",
        paused
          ? "bg-red-100 text-red-800 hover:bg-red-200"
          : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
      )}
      aria-pressed={paused}
      title={paused ? "Resume automation" : "Pause automation"}
    >
      {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
      <span className="hidden sm:inline">{paused ? "Paused · Resume" : "AI on · Pause"}</span>
      <span className="sm:hidden">{paused ? "Paused" : "AI on"}</span>
    </button>
  );
}

function PushButton() {
  const push = usePushNotifications();
  if (push.state !== "prompt" && push.state !== "error") return null;
  return (
    <button
      type="button"
      onClick={() => void push.enable()}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      title={push.error ?? "Enable escalation notifications"}
      aria-label="Enable escalation notifications"
    >
      <Bell className="h-5 w-5" />
    </button>
  );
}

export function TopBar() {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const title = usePageTitleValue() ?? titleForPath(location.pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 pt-safe backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:h-16 md:px-6">
        <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-md md:hidden" />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 md:text-lg">{title}</h1>
        <ConnectionDot />
        {isAdmin && <PauseShortcut />}
        <PushButton />
        {user && (
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-sm text-gray-700">{user.name}</span>
            <RoleBadge role={user.role} />
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
