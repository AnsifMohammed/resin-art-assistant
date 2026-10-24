import type { ReactNode } from "react";

/**
 * Loading state for the Analytics page. Mirrors the real layout card by card (same white cards,
 * borders, grid and heights) so nothing jumps when the data arrives. Placeholders use a gentle
 * opacity pulse instead of a moving shimmer band.
 */

const COCKPIT = "[@media(min-width:1024px)_and_(min-height:760px)]";

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-surface-muted animate-pulse ${className}`} />;
}

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`p-4 rounded-xl border border-border bg-surface flex flex-col gap-3 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ titleWidth = "w-24", right = "w-14" }: { titleWidth?: string; right?: string }) {
  return (
    <div className="h-9 flex items-center justify-between shrink-0">
      <Bone className={`h-3 ${titleWidth}`} />
      <Bone className={`h-3 ${right}`} />
    </div>
  );
}

const BAR_HEIGHTS = ["55%", "48%", "62%", "40%", "74%", "56%", "82%"];

export function AnalyticsSkeleton() {
  return (
    <div
      className={`w-full min-h-0 flex flex-col p-4 lg:p-5 gap-4 ${COCKPIT}:h-full ${COCKPIT}:overflow-hidden`}
      aria-busy="true"
      aria-label="Loading analytics"
    >
      {/* Header: greeting + date, chips inline, filters on the right */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-10 shrink-0 mb-1">
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          <div className="space-y-1.5">
            <Bone className="h-6 w-52" />
            <Bone className="h-3 w-36" />
          </div>
          <div className="flex items-center gap-2">
            {["w-28", "w-24", "w-24", "w-24"].map((w, i) => (
              <Bone key={i} className={`h-7 ${w} rounded-lg`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bone className="h-7 w-28 rounded-lg" />
          <Bone className="h-7 w-32 rounded-lg" />
          <Bone className="h-7 w-20 rounded-lg" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="h-[104px] !gap-2 justify-center">
            <div className="flex items-center justify-between">
              <Bone className="h-6 w-6 rounded-md" />
              <Bone className="h-4 w-10 rounded-full" />
            </div>
            <Bone className="h-2.5 w-20" />
            <Bone className="h-6 w-24" />
          </Card>
        ))}
      </div>

      {/* Row 2: chart · channels · AI health */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${COCKPIT}:flex-[50] ${COCKPIT}:min-h-0`}>
        <Card className={`h-[300px] md:col-span-2 lg:col-span-1 ${COCKPIT}:h-full ${COCKPIT}:min-h-0`}>
          <div className="h-9 flex items-center justify-between shrink-0">
            <Bone className="h-7 w-36 rounded-lg" />
            <Bone className="h-3 w-24" />
          </div>
          <div className="flex-1 min-h-0 flex items-end gap-3 px-2 pb-6 border-b border-border/40">
            {BAR_HEIGHTS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-surface-muted animate-pulse" style={{ height: h }} />
            ))}
          </div>
        </Card>

        <Card className={`h-[300px] ${COCKPIT}:h-full ${COCKPIT}:min-h-0`}>
          <CardHeader titleWidth="w-20" right="w-12" />
          <div className="flex-1 min-h-0 flex items-center gap-4">
            <div className="h-[128px] w-[128px] shrink-0 rounded-full border-[18px] border-surface-muted animate-pulse" />
            <div className="flex-1 flex flex-col gap-2 self-stretch justify-center">
              {[0, 1].map((i) => (
                <div key={i} className="flex-1 max-h-16 rounded-lg border border-border/60 p-3 space-y-2">
                  <Bone className="h-3 w-3/4" />
                  <Bone className="h-2.5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5 space-y-2 shrink-0">
            <Bone className="h-2.5 w-full" />
            <Bone className="h-2.5 w-5/6" />
          </div>
        </Card>

        <Card className={`h-[300px] ${COCKPIT}:h-full ${COCKPIT}:min-h-0`}>
          <CardHeader titleWidth="w-24" right="w-20" />
          <Bone className="h-8 w-28" />
          <Bone className="h-2 w-full rounded-full" />
          <Bone className="h-10 w-full rounded-lg" />
          <div className="space-y-3">
            {["w-3/4", "w-2/3", "w-1/2"].map((w, i) => (
              <div key={i} className="space-y-1.5">
                <Bone className="h-2.5 w-28" />
                <Bone className={`h-1.5 rounded-full ${w}`} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: top products · recent activity */}
      <div className={`grid grid-cols-1 lg:grid-cols-[64fr_36fr] gap-4 ${COCKPIT}:flex-[50] ${COCKPIT}:min-h-0`}>
        <Card className={`h-[400px] ${COCKPIT}:h-full ${COCKPIT}:min-h-0`}>
          <CardHeader titleWidth="w-28" right="w-40" />
          <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="shrink-0 h-14 rounded-xl border border-border/60 px-3.5 flex items-center gap-3">
                <Bone className="h-5 w-5 rounded-full" />
                <Bone className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-3 w-1/2" />
                  <Bone className="h-2.5 w-1/3" />
                </div>
                <div className="space-y-1.5 flex flex-col items-end">
                  <Bone className="h-3.5 w-16" />
                  <Bone className="h-1 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className={`h-[400px] ${COCKPIT}:h-full ${COCKPIT}:min-h-0`}>
          <CardHeader titleWidth="w-32" right="w-36" />
          <div className="flex-1 min-h-0 rounded-lg border border-border/60 px-3 py-1 overflow-hidden divide-y divide-border/40">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 flex items-center gap-3">
                <Bone className="h-6 w-6 rounded-md" />
                <Bone className="h-3 flex-1 max-w-[55%]" />
                <Bone className="h-2.5 w-16 ml-auto" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
