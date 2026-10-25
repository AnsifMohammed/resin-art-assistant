import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";
import { useCockpitMode, useElementHeight } from "./cockpit.tsx";

/** One reason block (text line + 6px gap + bar), the gap between blocks, the
 *  "Why chats were escalated" heading (h-4) + its 6px gap, and the list shell's
 *  vertical padding + border. */
const REASON_ROW_PX = 34;
const REASON_GAP_PX = 8;
const REASON_HEADING_PX = 16 + 6;
const REASON_SHELL_PX = 16 + 2;

/** Single-screen layout: how many reason rows fit in the measured reasons area (heading + list box).
 *  Shared with AnalyticsSkeleton so the loading state follows the real list. */
export function fittingReasonRows(areaH: number): number {
  return Math.max(
    0,
    Math.floor((areaH - REASON_HEADING_PX - REASON_SHELL_PX + REASON_GAP_PX) / (REASON_ROW_PX + REASON_GAP_PX))
  );
}

export interface EscalationReasonStat {
  /** Raw escalation_reason value (used for the escalations link). */
  code: string;
  /** Human label. */
  reason: string;
  percentage: number;
  count: number;
}

const DASH = "—";

interface AiHealthCardProps {
  /** 0–100, or null when nothing was processed in the period. */
  autoReplyRate: number | null;
  autoRepliesCount: number | null;
  escalationsCount: number | null;
  topReasons: EscalationReasonStat[];
  /** Live counts from GET /escalations; null while loading/unavailable. */
  openEscalationsCount: number | null;
  oldestWaitingText: string | null;
  avgResolveText: string | null;
  /** "↑3% vs prev 7d" trend string. null hides the chip. */
  trendVsPrev: string | null;
  /** If trend is an improvement (positive = more AI handled). */
  trendPositive?: boolean;
}

export function AiHealthCard({
  autoReplyRate,
  autoRepliesCount,
  escalationsCount,
  topReasons,
  openEscalationsCount,
  oldestWaitingText,
  avgResolveText,
  trendVsPrev,
  trendPositive = true,
}: AiHealthCardProps) {
  const navigate = useNavigate();

  // Split bar: only when there is something to split; otherwise an empty track.
  const autoShare = autoReplyRate ?? 0;
  const escShare = autoReplyRate === null ? 0 : 100 - autoReplyRate;

  const allReasons = [...topReasons].sort((a, b) => b.count - a.count);
  // Bars are relative to the largest reason (largest = full track); the % text shows the real share.
  const maxReasonPct = Math.max(1, ...allReasons.map((r) => r.percentage));

  // Cockpit mode (fixed card height): show only the reasons that fit completely.
  // Elsewhere the card has natural height, so every reason is shown.
  const cockpit = useCockpitMode();
  const reasonsAreaRef = useRef<HTMLDivElement>(null);
  // The measured area is the whole section (heading + list), so hiding the heading
  // when nothing fits cannot feed back into the measurement.
  const reasonsAreaH = useElementHeight(reasonsAreaRef, cockpit);
  const activeReasons = cockpit ? allReasons.slice(0, fittingReasonRows(reasonsAreaH)) : allReasons;

  // Three mini stat tiles — always shown so the card keeps its shape; "—" when there is no value.
  const tiles: Array<{ label: string; value: string }> = [
    { label: "Open now", value: openEscalationsCount === null ? DASH : String(openEscalationsCount) },
    { label: "Oldest wait", value: oldestWaitingText ?? DASH },
    { label: "Avg resolve", value: avgResolveText ?? DASH },
  ];

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      {/* ─── Card Header (h-9) ──────────────────────────────────────────────── */}
      <div className="h-9 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted">
            AI Health
          </h3>
        </div>
        <button
          type="button"
          onClick={() => navigate("/escalations")}
          className="text-[11px] text-text-muted hover:text-text transition-colors flex items-center gap-0.5 cursor-pointer shrink-0"
        >
          <span>View escalations</span>
          <ArrowUpRight className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* ─── Hero Row: Rate + "answered by AI" + Trend chip ─────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
          <span className="text-[32px] font-bold font-outfit text-text leading-none tracking-tight">
            {autoReplyRate === null ? DASH : `${autoReplyRate}%`}
          </span>
          <span className="text-12 text-text-muted">answered by AI</span>
        </div>
        {trendVsPrev && (
          <div
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
              trendPositive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}
          >
            {trendPositive ? (
              <TrendingUp className="w-2.5 h-2.5" />
            ) : (
              <TrendingDown className="w-2.5 h-2.5" />
            )}
            <span>{trendVsPrev}</span>
          </div>
        )}
      </div>

      {/* ─── Split Bar (h-2, 2px gap): Amber = AI, Rose = Escalated ────────── */}
      <div className="shrink-0 space-y-1">
        <div className="flex h-2 w-full rounded-full overflow-hidden gap-[2px] bg-surface-muted">
          <div
            style={{ width: `${autoShare}%` }}
            className="bg-amber-500 h-full rounded-l-full transition-all duration-500"
            title={`AI answered: ${autoShare}% (${autoRepliesCount ?? 0})`}
          />
          <div
            style={{ width: `${escShare}%` }}
            className="bg-rose-500 h-full rounded-r-full transition-all duration-500"
            title={`Escalated to team: ${escShare}% (${escalationsCount ?? 0})`}
          />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            AI {autoRepliesCount === null ? DASH : autoRepliesCount.toLocaleString("en-IN")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            Team {escalationsCount === null ? DASH : escalationsCount.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* ─── Three Mini Stat Tiles (inner shell, h-8 per tile, single row) ──── */}
      <div className="shrink-0 rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1.5">
          <div className="grid gap-x-3 grid-cols-3">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="py-0.5 flex flex-col justify-center min-w-0 @min-[340px]:h-8 @min-[340px]:py-0 @min-[340px]:flex-row @min-[340px]:items-center @min-[340px]:justify-between @min-[340px]:gap-1"
              >
                <span className="text-[11px] text-text-muted truncate">{t.label}</span>
                <span className="text-[15px] font-semibold font-outfit text-text tabular-nums shrink-0">
                  {t.value}
                </span>
              </div>
            ))}
          </div>
        </div>

      {/* ─── "Why chats were escalated": label + % on one line, full-width bar under it ── */}
      <div
        ref={reasonsAreaRef}
        className={`flex flex-col gap-1.5 ${cockpit ? "flex-1 min-h-0 overflow-hidden" : "shrink-0"}`}
      >
        {(activeReasons.length > 0 || allReasons.length === 0) && (
          <span className="h-4 leading-4 text-[11px] font-medium text-text-muted shrink-0">
            Why chats were escalated
          </span>
        )}

        {allReasons.length === 0 && (
          <div className="flex-1 min-h-[34px] rounded-lg border border-dashed border-border/70 flex items-center justify-center px-3 text-center">
            <p className="text-12 text-text-muted">No escalations in this period</p>
          </div>
        )}

        {activeReasons.length > 0 && (
        <div
          className={`rounded-lg border border-border/60 bg-surface-muted/50 px-3 py-2 flex flex-col gap-2 ${
            cockpit ? "flex-1 min-h-0 justify-evenly" : ""
          }`}
        >
          {activeReasons.map((r, i) => {
            const barPct = Math.min(100, Math.round((r.percentage / maxReasonPct) * 100));
            return (
              <button
                key={r.code || i}
                type="button"
                onClick={() =>
                  navigate(`/escalations?reason=${encodeURIComponent(r.code)}`)
                }
                className="w-full text-left h-[34px] flex flex-col justify-center gap-1.5 px-1 -mx-1 rounded hover:bg-surface-muted transition-colors group cursor-pointer select-none shrink-0"
                title={`Filter escalations: ${r.reason}`}
              >
                <span className="w-full flex items-center justify-between gap-2 min-w-0">
                  <span className="flex-1 min-w-0 text-12 text-text-muted truncate group-hover:text-text transition-colors">
                    {r.reason}
                  </span>
                  <span className="text-12 font-semibold text-text tabular-nums shrink-0">
                    {r.percentage}%
                  </span>
                </span>
                <span
                  className="block w-full h-1.5 rounded-full bg-border/60 overflow-hidden"
                  role="img"
                  aria-label={`${barPct}% of the top reason`}
                >
                  <span
                    className="block bg-rose-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
