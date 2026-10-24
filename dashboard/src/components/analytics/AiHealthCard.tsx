import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";
import { SampleDataBadge } from "../shared/SampleDataBadge.tsx";
import { useCockpitMode, useElementHeight } from "./cockpit.tsx";

/** One reason block (text line + 6px gap + bar), the gap between blocks, and the
 *  "Why chats were escalated" heading (h-4) + its 6px gap. */
const REASON_ROW_PX = 34;
const REASON_GAP_PX = 8;
const REASON_HEADING_PX = 16 + 6;

export interface EscalationReasonStat {
  reason: string;
  percentage: number;
  count?: number;
}

interface AiHealthCardProps {
  autoReplyRate: number; // e.g. 94 (%)
  autoRepliesCount: number;
  escalationsCount: number;
  topReasons: EscalationReasonStat[];
  openEscalationsCount?: number;
  oldestWaitingText?: string | null;
  avgResolveText?: string | null;
  isSample?: boolean;
  /** "↑3% vs 7d" trend string. Omit to hide the chip. */
  trendVsPrev?: string | null;
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
  isSample,
  trendVsPrev,
  trendPositive = true,
}: AiHealthCardProps) {
  const navigate = useNavigate();

  const totalHandled = autoRepliesCount + escalationsCount;
  const calculatedShare =
    totalHandled > 0 ? Math.round((autoRepliesCount / totalHandled) * 100) : 0;
  const displayRate =
    autoReplyRate > 0
      ? autoReplyRate
      : calculatedShare > 0
        ? calculatedShare
        : 94;
  const autoShare = displayRate;
  const escShare = 100 - autoShare;

  const sortedReasons = [...topReasons].sort((a, b) => b.percentage - a.percentage);
  const fallbackReasons: EscalationReasonStat[] = [
    { reason: "Refund request", percentage: 28 },
    { reason: "Complaint", percentage: 24 },
    { reason: "Payment claim", percentage: 20 },
    { reason: "Unknown product", percentage: 16 },
  ];
  const allReasons = sortedReasons.length >= 3 ? sortedReasons : fallbackReasons;
  // Bars are relative to the largest reason (largest = full track); the % text shows the real share.
  const maxReasonPct = Math.max(1, ...allReasons.map((r) => r.percentage));

  // Cockpit mode (fixed card height): show only the reasons that fit completely.
  // Elsewhere the card has natural height, so every reason is shown.
  const cockpit = useCockpitMode();
  const reasonsAreaRef = useRef<HTMLDivElement>(null);
  // The measured area is the whole section (heading + list), so hiding the heading
  // when nothing fits cannot feed back into the measurement.
  const reasonsAreaH = useElementHeight(reasonsAreaRef, cockpit);
  const activeReasons = cockpit
    ? allReasons.slice(
        0,
        Math.max(
          0,
          Math.floor(
            (reasonsAreaH - REASON_HEADING_PX + REASON_GAP_PX) / (REASON_ROW_PX + REASON_GAP_PX)
          )
        )
      )
    : allReasons;

  // Three mini stat tiles — only show tiles that have a value
  const tiles: Array<{ label: string; value: string }> = [];
  if (openEscalationsCount !== undefined) {
    tiles.push({ label: "Open now", value: String(openEscalationsCount) });
  }
  if (oldestWaitingText) {
    tiles.push({ label: "Oldest wait", value: oldestWaitingText });
  }
  if (avgResolveText) {
    tiles.push({ label: "Avg resolve", value: avgResolveText });
  }

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      {/* ─── Card Header (h-9) ──────────────────────────────────────────────── */}
      <div className="h-9 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted">
            AI Health
          </h3>
          {isSample && <SampleDataBadge />}
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
            {displayRate}%
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
            title={`AI answered: ${autoShare}% (${autoRepliesCount})`}
          />
          <div
            style={{ width: `${escShare}%` }}
            className="bg-rose-500 h-full rounded-r-full transition-all duration-500"
            title={`Escalated to team: ${escShare}% (${escalationsCount})`}
          />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            AI {autoRepliesCount.toLocaleString("en-IN")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            Team {escalationsCount.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* ─── Three Mini Stat Tiles (inner shell, h-8 per tile, single row) ──── */}
      {tiles.length > 0 && (
        <div className="shrink-0 rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1.5">
          <div
            className="grid gap-x-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 3)}, 1fr)` }}
          >
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
      )}

      {/* ─── "Why chats were escalated": label + % on one line, full-width bar under it ── */}
      <div
        ref={reasonsAreaRef}
        className={`flex flex-col gap-1.5 ${cockpit ? "flex-1 min-h-0 overflow-hidden" : "shrink-0"}`}
      >
        {activeReasons.length > 0 && (
          <span className="h-4 leading-4 text-[11px] font-medium text-text-muted shrink-0">
            Why chats were escalated
          </span>
        )}

        <div className="flex flex-col gap-2">
          {activeReasons.map((r, i) => {
            const barPct = Math.min(100, Math.round((r.percentage / maxReasonPct) * 100));
            return (
              <button
                key={r.reason || i}
                type="button"
                onClick={() =>
                  navigate(`/escalations?reason=${encodeURIComponent(r.reason)}`)
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
      </div>
    </div>
  );
}
