export function AppFrameSkeleton() {
  const navItems = [
    "w-20",
    "w-16",
    "w-24",
    "w-16",
    "w-20",
    "w-18",
    "w-22",
    "w-24",
  ];

  return (
    <div
      className="relative flex h-dvh w-full overflow-hidden bg-bg text-text"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      {/* ─── Desktop / Tablet Sidebar Placeholder (md:flex) ────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface select-none">
        {/* Logo block */}
        <div className="h-14 border-b border-border flex items-center px-4 gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-sm bg-surface-muted animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="h-3.5 w-20 bg-surface-muted rounded animate-pulse" />
            <div className="h-2 w-12 bg-surface-muted rounded animate-pulse" />
          </div>
        </div>

        {/* 8 Muted Nav Lines */}
        <div className="p-3 space-y-2 flex-1">
          {navItems.map((w, idx) => (
            <div key={idx} className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
              <div className="w-4 h-4 rounded bg-surface-muted animate-pulse shrink-0" />
              <div className={`h-3 ${w} bg-surface-muted rounded animate-pulse`} />
            </div>
          ))}
        </div>

        {/* User profile row placeholder */}
        <div className="p-3 border-t border-border flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-full bg-surface-muted animate-pulse shrink-0" />
          <div className="space-y-1 flex-1 min-w-0">
            <div className="h-3 w-16 bg-surface-muted rounded animate-pulse" />
            <div className="h-2 w-24 bg-surface-muted rounded animate-pulse" />
          </div>
        </div>
      </aside>

      {/* ─── Main Column ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar placeholder */}
        <header className="sticky top-0 z-40 h-14 w-full border-b border-border bg-surface flex items-center justify-between px-4 md:px-6 shrink-0">
          {/* Title line */}
          <div className="h-4 w-28 sm:w-36 bg-surface-muted rounded animate-pulse" />

          {/* 3 pills on the right */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 sm:w-28 bg-surface-muted rounded-lg animate-pulse" />
            <div className="h-8 w-8 bg-surface-muted rounded-lg animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-surface-muted animate-pulse" />
          </div>
        </header>

        {/* Empty content area with a soft pulse */}
        <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col min-h-0 pb-16 md:pb-6">
          <div className="flex-1 w-full rounded-2xl border border-border/60 bg-surface/50 animate-pulse" />
        </main>
      </div>

      {/* ─── Mobile Bottom Nav Placeholder (< md) ────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 border-t border-border bg-surface flex items-center justify-around px-2 pb-safe">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="flex flex-col items-center justify-center gap-1 min-w-[56px]">
            <div className="w-5 h-5 rounded bg-surface-muted animate-pulse" />
            <div className="w-8 h-2 rounded bg-surface-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
