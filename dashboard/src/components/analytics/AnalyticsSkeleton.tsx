import { useRef } from "react";
import { useCockpitMode, useElementHeight } from "./cockpit.tsx";

/**
 * Loading state for the Analytics page. Mirrors the real layout card by card AND inside each
 * card (same wrappers, paddings, header heights, inner shells and row-fitting rules as
 * StatCard, MainChartCard, ChannelsCard, AiHealthCard, TopProductsCard and RecentActivityCard),
 * so nothing jumps when the data arrives. Placeholders use a gentle opacity pulse, no shimmer.
 */

const COCKPIT = "[@media(min-width:1024px)_and_(min-height:760px)]";

/** TopProductsCard row fitting: gap between shells and minimum shell height. */
const PRODUCT_ROW_GAP = 8;
const PRODUCT_MIN_SHELL = 48;

/** Placeholder colour: a faint tint of the text colour, visible on surface and muted shells in both themes. */
const BONE = "bg-text/10 animate-pulse";

function Bone({ className = "" }: { className?: string }) {
  const radius = /(^|\s)rounded/.test(className) ? "" : "rounded-md";
  return <div className={`${radius} ${BONE} ${className}`} />;
}

/** One line of text: a box with the text's line height and a thinner bar inside it. */
function TextLine({ h, bar, className = "" }: { h: string; bar: string; className?: string }) {
  return (
    <div className={`${h} flex items-center min-w-0 ${className}`}>
      <Bone className={/(^|\s)rounded/.test(bar) ? bar : `rounded-sm ${bar}`} />
    </div>
  );
}

/** Segmented control shell (pill group) with text bones; the first option is "selected". */
function SegmentShell({
  items,
  shell,
  item,
}: {
  /** Tailwind width class of each option's label bone. */
  items: string[];
  shell: string;
  item: string;
}) {
  return (
    <div className={`inline-flex items-center rounded-lg bg-surface-muted border border-border/80 shrink-0 ${shell}`}>
      {items.map((w, i) => (
        <div
          key={i}
          className={`flex items-center justify-center ${item} ${
            i === 0 ? "bg-surface rounded-[6px] border border-border/50 shadow-2xs" : ""
          }`}
        >
          <Bone className={`h-2 rounded-sm ${w}`} />
        </div>
      ))}
    </div>
  );
}

function CardTitle({ w }: { w: string }) {
  return <TextLine h="h-4" bar={`h-2.5 ${w}`} />;
}

// ─── Header ──────────────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-1 shrink-0 mb-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-10 shrink-0">
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap min-w-0">
          {/* Greeting (text-20, leading-tight) + date (text-12) */}
          <div className="shrink-0">
            <TextLine h="h-[25px]" bar="h-5 w-44" />
            <TextLine h="h-4" bar="h-3 w-36" />
          </div>
          {/* Attention chips */}
          <div className="inline-flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {["w-[118px] sm:w-[126px]", "w-[94px] sm:w-[100px]", "w-[116px] sm:w-[124px]"].map((w, i) => (
              <Bone key={i} className={`h-[26px] rounded-lg ${w}`} />
            ))}
          </div>
        </div>

        {/* [All | WA | IG] [7d | 30d | Custom] [Export] */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <SegmentShell
            items={["w-[15px]", "w-[17px]", "w-[11px]"]}
            shell="p-0.5 h-8"
            item="px-2 sm:px-2.5 h-[26px]"
          />
          <SegmentShell
            items={["w-[12px]", "w-[19px]", "w-[42px]"]}
            shell="p-0.5 h-8"
            item="px-2 sm:px-2.5 h-[26px]"
          />
          <div className="h-7 px-2 sm:px-2.5 rounded-lg border border-border bg-surface inline-flex items-center gap-1.5">
            <Bone className="w-3 h-3 rounded-sm" />
            <Bone className="hidden sm:block h-2 w-[38px] rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI tile (StatCard) ─────────────────────────────────────────────────────

function StatSkeleton() {
  return (
    <div className="@container relative p-4 lg:p-3 xl:p-4 rounded-xl border border-border bg-surface h-[104px] flex flex-col justify-between min-w-0">
      {/* Top row: icon square (+ label on wide tiles) */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        <Bone className="w-6 h-6 shrink-0" />
        <TextLine h="h-[14px]" bar="h-2.5 w-20" className="hidden @min-[12rem]:flex flex-1" />
      </div>
      {/* Label line on narrow tiles */}
      <TextLine h="h-[14px]" bar="h-2.5 w-20" className="@min-[12rem]:hidden" />
      {/* Big number (text-[22px] / text-28, leading-none) */}
      <div className="mt-auto h-[22px] sm:h-7 lg:h-[22px] xl:h-7 flex items-end">
        <Bone className="h-[18px] sm:h-6 lg:h-[18px] xl:h-6 w-24 rounded" />
      </div>
    </div>
  );
}

// ─── Main chart ──────────────────────────────────────────────────────────────

const BAR_HEIGHTS = ["38%", "55%", "46%", "72%", "52%", "64%", "84%"];

function ChartSkeleton() {
  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
      <div className="h-9 flex items-center justify-between gap-3 shrink-0 min-w-0">
        <SegmentShell items={["w-12", "w-[54px]"]} shell="p-0.5 h-8" item="px-2 sm:px-2.5 h-[26px]" />
        <TextLine h="h-4" bar="h-2.5 w-20" />
      </div>

      {/* Plot: y labels | bars, then the x label row (recharts margins: top 18, right 6, x-axis 30px) */}
      <div className="w-full flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex pt-[18px] pr-[6px]">
          <div className="w-[38px] shrink-0 flex flex-col justify-between items-end pr-2 -my-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Bone key={i} className="h-2 w-6 rounded-sm" />
            ))}
          </div>
          <div className="flex-1 min-w-0 flex items-end border-b border-border">
            {BAR_HEIGHTS.map((h, i) => (
              <div key={i} className="flex-1 h-full flex items-end justify-center">
                <div className={`w-[72%] max-w-[88px] rounded-t-md ${BONE}`} style={{ height: h }} />
              </div>
            ))}
          </div>
        </div>
        <div className="h-[30px] shrink-0 flex pl-[38px] pr-[6px]">
          {BAR_HEIGHTS.map((_, i) => (
            <div key={i} className="flex-1 flex justify-center pt-[7px]">
              <Bone className="h-2 w-7 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Channels ────────────────────────────────────────────────────────────────

function ChannelsSkeleton() {
  const cockpit = useCockpitMode();
  // The real table has 2 rows (Orders, Avg order value); Messages rows only appear with message data.
  const rows = 2;

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      <div className="h-9 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <CardTitle w="w-[68px]" />
        <TextLine h="h-[17px]" bar="h-2.5 w-10" />
      </div>

      {/* Donut + two channel boxes (same size rules as ChannelsCard) */}
      <div
        className={`flex flex-col items-center gap-3 @min-[20rem]:flex-row @min-[20rem]:items-stretch @min-[20rem]:gap-4 ${
          cockpit ? "flex-1 min-h-0 max-h-[156px]" : "shrink-0"
        }`}
      >
        <div
          className={`relative shrink-0 flex items-center justify-center ${
            cockpit ? "h-full min-h-[130px] aspect-square" : "w-[128px] h-[128px]"
          }`}
        >
          {/* Ring: outer 96%, inner 64% of the box, like the recharts Pie */}
          <div className={`w-[96%] h-[96%] rounded-full ${BONE} flex items-center justify-center`}>
            <div className="w-[66.67%] h-[66.67%] rounded-full bg-surface" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <Bone className="h-4 w-10 rounded" />
            <Bone className="h-1.5 w-9 rounded-sm" />
          </div>
        </div>

        <div className="w-full @min-[20rem]:w-auto @min-[20rem]:flex-1 @min-[20rem]:self-stretch min-w-0 flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="w-full flex-1 min-h-0 flex flex-col justify-center gap-1 px-3 py-2 rounded-lg bg-surface-muted/50 border border-border/60"
            >
              <div className="h-[18px] flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Bone className="w-2 h-2 rounded-full" />
                  <Bone className="h-3 w-[68px] rounded-sm" />
                </div>
                <Bone className="h-3 w-12 rounded-sm" />
              </div>
              <TextLine h="h-4" bar="h-2.5 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table shell: header row + rows (h-7 each) */}
      <div className="shrink-0 mt-4">
        <div className="w-full rounded-lg border border-border/60 bg-surface-muted/50 overflow-hidden">
          <div className="h-7 flex items-center justify-end gap-6 pr-2.5 border-b border-border/50">
            <Bone className="h-2.5 w-[76px] rounded-sm" />
            <Bone className="h-2.5 w-[76px] rounded-sm" />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className={`h-7 flex items-center justify-between pl-2.5 pr-2.5 ${
                i < rows - 1 ? "border-b border-border/40" : ""
              }`}
            >
              <Bone className={`h-2.5 rounded-sm ${i === 0 ? "w-12" : "w-24"}`} />
              <div className="flex items-center gap-[88px]">
                <Bone className="h-2.5 w-8 rounded-sm" />
                <Bone className="h-2.5 w-5 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI health ───────────────────────────────────────────────────────────────

function AiHealthSkeleton() {
  const cockpit = useCockpitMode();

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      <div className="h-9 flex items-center justify-between gap-2 shrink-0">
        <CardTitle w="w-[66px]" />
        <TextLine h="h-[17px]" bar="h-2.5 w-24" />
      </div>

      {/* Hero: big rate (32px, leading-none) + "answered by AI" */}
      <div className="h-8 flex items-end gap-1.5 shrink-0">
        <Bone className="h-7 w-16 rounded" />
        <TextLine h="h-4" bar="h-2.5 w-[84px]" className="mb-[3px]" />
      </div>

      {/* Split bar + legend */}
      <div className="shrink-0 space-y-1">
        <Bone className="h-2 w-full rounded-full" />
        <div className="h-[17px] flex items-center gap-3">
          {["w-8", "w-11"].map((w, i) => (
            <span key={i} className="flex items-center gap-1">
              <Bone className="w-2 h-2 rounded-full" />
              <Bone className={`h-2 rounded-sm ${w}`} />
            </span>
          ))}
        </div>
      </div>

      {/* Three mini stats in one bordered box */}
      <div className="shrink-0 rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1.5">
        <div className="grid gap-x-3 grid-cols-3">
          {["w-12", "w-14", "w-14"].map((w, i) => (
            <div
              key={i}
              className="py-0.5 flex flex-col justify-center min-w-0 @min-[340px]:h-8 @min-[340px]:py-0 @min-[340px]:flex-row @min-[340px]:items-center @min-[340px]:justify-between @min-[340px]:gap-1"
            >
              {/* label (11px) over value (15px) on narrow cards; one row on wide cards */}
              <TextLine h="h-[17px]" bar={`h-2 ${w}`} />
              <TextLine h="h-[22px]" bar="h-3.5 w-6" className="shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* "Why chats were escalated" + bordered list box */}
      <div className={`flex flex-col gap-1.5 ${cockpit ? "flex-1 min-h-0 overflow-hidden" : "shrink-0"}`}>
        <TextLine h="h-4" bar="h-2.5 w-36" className="shrink-0" />
        <div className="flex-1 min-h-[34px] rounded-lg border border-border/60 px-3 py-[5px] flex flex-col gap-2.5 overflow-hidden">
          {/* One row outside cockpit (the real empty state is a 34px box); a short list in cockpit mode. */}
          {(cockpit ? ["w-1/2", "w-2/5"] : ["w-1/2"]).map((w, i) => (
            <div key={i} className="shrink-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Bone className={`h-2.5 rounded-sm ${w}`} />
                <Bone className="h-2.5 w-7 rounded-sm" />
              </div>
              <Bone className={`h-1.5 rounded-full ${i === 0 ? "w-full" : "w-3/5"}`} />
            </div>
          ))}
        </div>
        {/* AiHealthCard always renders its (here empty) reasons list after the box; keep its gap. */}
        <div />
      </div>
    </div>
  );
}

// ─── Top products ────────────────────────────────────────────────────────────

function TopProductsSkeleton() {
  const listRef = useRef<HTMLDivElement>(null);
  const areaH = useElementHeight(listRef);

  // Same fitting as TopProductsCard: whole rows only (max 6), shells stretched to fill the area.
  const avail = areaH + PRODUCT_ROW_GAP;
  const count = areaH > 0 ? Math.max(1, Math.min(6, Math.floor(avail / (PRODUCT_MIN_SHELL + PRODUCT_ROW_GAP)))) : 4;
  const shellH = areaH > 0 ? Math.floor(avail / count) - PRODUCT_ROW_GAP : PRODUCT_MIN_SHELL;

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col min-h-0 gap-3 flex-1 overflow-hidden h-[400px] lg:h-full">
      <div className="h-9 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <CardTitle w="w-[97px]" />
        <div className="flex items-center gap-2 shrink-0">
          <SegmentShell items={["w-[56px]", "w-[44px]"]} shell="p-0.5" item="px-2 h-[21px]" />
          <div className="flex items-center gap-1 ml-1">
            <Bone className="hidden @min-[26rem]:block h-2.5 w-[50px] rounded-sm" />
            <Bone className="h-3 w-3 rounded-sm" />
          </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-hidden pr-1">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{ height: `${shellH}px`, marginBottom: `${PRODUCT_ROW_GAP}px` }}
            className="flex items-center gap-3 px-3 rounded-xl border border-border bg-surface-muted/40"
          >
            <Bone className="w-5 h-5 rounded-full shrink-0" />
            <Bone className="w-9 h-9 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <TextLine h="h-4" bar={`h-3 ${["w-24", "w-28", "w-32", "w-24", "w-28", "w-20"][i] ?? "w-24"}`} />
              <TextLine h="h-[14px]" bar="h-2 w-28" className="mt-0.5" />
            </div>
            <div className="flex flex-col items-end shrink-0 gap-1">
              <Bone className="h-3.5 w-16 rounded-sm" />
              <Bone className="h-1 w-16 rounded-full" />
            </div>
            <div className="w-3 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent activity ─────────────────────────────────────────────────────────

const ACTIVITY_TITLES = ["w-28", "w-24", "w-20", "w-24", "w-28", "w-20", "w-24", "w-28"];

function RecentActivitySkeleton() {
  const innerRef = useRef<HTMLDivElement>(null);
  const shellH = useElementHeight(innerRef);

  // Same fitting as RecentActivityCard: rows ~46px (never below 38px) filling the shell minus py-1.
  const avail = shellH - 8;
  const rows = shellH > 0 ? Math.max(1, Math.min(Math.round(avail / 46), Math.floor(avail / 38))) : 4;
  const rowH = shellH > 0 ? Math.max(1, Math.floor(avail / rows)) : 44;

  return (
    <div className="p-4 rounded-xl border border-border bg-surface flex flex-col min-h-0 gap-3 flex-1 overflow-hidden">
      <div className="h-9 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <CardTitle w="w-[111px]" />
          <Bone className="w-2 h-2 rounded-full" />
        </div>
        <SegmentShell items={["w-[14px]", "w-[11px]", "w-[25px]", "w-[36px]"]} shell="p-0.5" item="px-2 h-[21px]" />
      </div>

      <div
        ref={innerRef}
        className="flex-1 min-h-0 rounded-lg border border-border/60 bg-surface-muted/50 overflow-hidden flex flex-col"
      >
        <div className="px-2 py-1">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              style={{ height: `${rowH}px` }}
              className={`py-0.5 ${i < rows - 1 ? "border-b border-border/40" : ""}`}
            >
              <div className="h-full flex items-center justify-between gap-2 px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bone className="w-6 h-6 shrink-0" />
                  <Bone className={`h-2.5 rounded-sm ${ACTIVITY_TITLES[i % ACTIVITY_TITLES.length]}`} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Bone className="hidden sm:block h-2 w-7 rounded-sm" />
                  <Bone className="h-2 w-[52px] rounded-sm" />
                  <div className="w-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: "Live audit log" · "Full audit log →" */}
      <div className="h-9 shrink-0 pt-2 border-t border-border/60 flex items-center justify-between">
        <TextLine h="h-4" bar="h-2.5 w-[74px]" />
        <TextLine h="h-4" bar="h-2.5 w-[86px]" />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AnalyticsSkeleton() {
  return (
    <div
      className={`w-full min-h-0 flex flex-col p-4 lg:p-5 gap-4 ${COCKPIT}:h-full ${COCKPIT}:overflow-hidden`}
      aria-busy="true"
      aria-label="Loading analytics"
    >
      <HeaderSkeleton />

      {/* Row 1: KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        {Array.from({ length: 6 }, (_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Row 2: chart · channels · AI health (same wrappers as the real page) */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${COCKPIT}:flex-[50] ${COCKPIT}:min-h-0`}>
        <div className={`min-w-0 flex flex-col min-h-[300px] md:col-span-2 lg:col-span-1 ${COCKPIT}:min-h-0`}>
          <ChartSkeleton />
        </div>
        <div className={`min-w-0 flex flex-col ${COCKPIT}:min-h-0`}>
          <ChannelsSkeleton />
        </div>
        <div className={`min-w-0 flex flex-col ${COCKPIT}:min-h-0`}>
          <AiHealthSkeleton />
        </div>
      </div>

      {/* Row 3: top products · recent activity (same wrappers as the real page) */}
      <div className={`grid grid-cols-1 lg:grid-cols-[64fr_36fr] gap-4 ${COCKPIT}:flex-[50] ${COCKPIT}:min-h-0`}>
        <div className={`min-w-0 flex flex-col h-[400px] ${COCKPIT}:h-auto ${COCKPIT}:min-h-0`}>
          <TopProductsSkeleton />
        </div>
        <div className={`min-w-0 flex flex-col h-[400px] lg:h-auto lg:[contain:size] ${COCKPIT}:min-h-0`}>
          <RecentActivitySkeleton />
        </div>
      </div>
    </div>
  );
}
