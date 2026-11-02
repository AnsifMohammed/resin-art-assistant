import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext.tsx";
import { usePause, useSettings } from "../../hooks/useSettings.ts";
import { ConfirmDialog } from "../shared/ConfirmDialog.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";
import { MobileBottomNav } from "./MobileBottomNav.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { PageTitleProvider } from "./PageTitle.tsx";

/** Admin-only automation pause state (GET /settings) shared by the TopBar pill, banner and command palette. */
export interface AutomationControl {
  /** undefined for staff or while settings are loading. */
  paused: boolean | undefined;
  pending: boolean;
  /** Opens the confirm step; the change is only sent after confirming. */
  requestToggle: () => void;
}

/** Pages that manage their own scrolling (list + chat panes, virtual tables, kanban boards) and need the full viewport height. */
function isFullHeightRoute(pathname: string): boolean {
  return (
    pathname === "/inbox" ||
    pathname === "/escalations" ||
    pathname === "/broadcast" ||
    pathname === "/knowledge-base" ||
    pathname === "/audit-log" ||
    pathname.startsWith("/conversations/") ||
    pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/")
  );
}

export function AppShell() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);

  // GET /settings is admin-only (403 for staff), so it never runs for staff.
  const settings = useSettings({ enabled: isAdmin });
  const pause = usePause();
  const paused = isAdmin ? settings.data?.paused : undefined;

  function doToggle() {
    if (paused === undefined) return;
    pause.mutate(!paused, {
      onSuccess: (res) => {
        if (res.paused) {
          toast.warning("AI automation paused", { description: "New messages are stored but the AI won't reply." });
        } else {
          toast.success("AI automation resumed", { description: "The AI is answering routine questions again." });
        }
      },
      onError: (err) => toast.error("Couldn't change automation", { description: err.message }),
    });
  }

  const automation: AutomationControl = {
    paused,
    pending: pause.isPending,
    requestToggle: doToggle,
  };

  function confirmToggle() {
    setConfirmAiOpen(false);
    doToggle();
  }

  const fullHeight = isFullHeightRoute(location.pathname);

  return (
    <PageTitleProvider>
      <div className="relative flex h-dvh overflow-hidden bg-bg text-text">
        {/* Desktop & Tablet Sidebar */}
        <Sidebar />

        {/* Main App Column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sticky Top Bar */}
          <TopBar onOpenSearch={() => setCommandPaletteOpen(true)} automation={automation} />


          {/* Page Content Viewport */}
          {fullHeight ? (
            <main className="min-h-0 flex-1 overflow-hidden pb-16 md:pb-0">
              <div className="h-full">
                <Outlet />
              </div>
            </main>
          ) : location.pathname === "/analytics" ? (
            <main className="min-h-0 flex-1 overflow-y-auto [@media(min-width:1024px)_and_(min-height:760px)]:overflow-hidden pb-16 md:pb-0">
              <div className="h-full w-full">
                <Outlet />
              </div>
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0 p-4 sm:p-6 lg:p-8">
              <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
                <Outlet />
              </div>
            </main>
          )}
        </div>

        {/* Mobile Glass Bottom Nav */}
        <MobileBottomNav />

        {/* Command Palette Modal (⌘K) */}
        <CommandPalette open={commandPaletteOpen} setOpen={setCommandPaletteOpen} automation={automation} />

        {/* Confirm Pause / Resume AI (POST /settings/pause) */}
        <ConfirmDialog
          isOpen={confirmAiOpen}
          onClose={() => setConfirmAiOpen(false)}
          onConfirm={confirmToggle}
          title={paused ? "Resume AI Automation?" : "Pause AI Automation?"}
          description={
            paused
              ? "Resuming AI will re-enable automatic responses for routine questions like pricing, delivery, care and custom order flows."
              : "Pausing AI means incoming WhatsApp & Instagram messages will be saved in Inbox, but no auto-replies will be sent until resumed."
          }
          confirmLabel={paused ? "Resume AI" : "Pause AI"}
          tone={paused ? "primary" : "warning"}
        />
      </div>
    </PageTitleProvider>
  );
}
