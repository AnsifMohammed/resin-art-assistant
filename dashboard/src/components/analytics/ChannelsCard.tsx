import { useRef, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { brandChannels } from "../../theme/index.ts";
import { useCockpitMode, useElementHeight } from "./cockpit.tsx";

/** Single-screen layout: the table shows as many rows as fit, never fewer than this. */
const MIN_COCKPIT_ROWS = 2;
/** Table row height (h-7) and header row + border, used to work out how many rows fit. */
const TABLE_ROW_H = 28;
const TABLE_CHROME_H = TABLE_ROW_H + 2;
/** Body rows stretch to fill spare height in the single-screen layout, up to this. */
const MAX_TABLE_ROW_H = 36;

/**
 * Single-screen layout: how many table body rows fit in the measured table area, and how tall
 * each one is (spare height is spread over the rows so the table ends near the card bottom).
 * Shared with AnalyticsSkeleton so the loading state follows the real table.
 */
export function channelTableFit(tableAreaH: number, totalRows: number): { rows: number; rowH: number } {
  const rows = Math.min(
    totalRows,
    Math.max(MIN_COCKPIT_ROWS, Math.floor((tableAreaH - TABLE_CHROME_H) / TABLE_ROW_H))
  );
  const rowH = Math.min(MAX_TABLE_ROW_H, Math.max(TABLE_ROW_H, Math.floor((tableAreaH - TABLE_CHROME_H) / rows)));
  return { rows, rowH };
}

export interface ChannelStats {
  messages: number;
  revenue: number;
  orders: number;
}

interface ChannelsCardProps {
  /** null when the API did not send per-channel stats. */
  whatsapp: ChannelStats | null;
  instagram: ChannelStats | null;
}

const DASH = "—";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** "Orders / 100 msgs" for one channel, or "—" when there are no messages. */
function conversion(stats: ChannelStats | null): string {
  if (!stats || stats.messages <= 0) return DASH;
  return ((stats.orders / stats.messages) * 100).toFixed(1);
}

/** Average order value, or "—" when there are no orders. */
function aov(stats: ChannelStats | null): string {
  if (!stats || stats.orders <= 0) return DASH;
  return rupees(Math.round(stats.revenue / stats.orders));
}

export function ChannelsCard({ whatsapp, instagram }: ChannelsCardProps) {
  const navigate = useNavigate();

  const hasData = whatsapp !== null || instagram !== null;
  const waRevenue = whatsapp?.revenue ?? 0;
  const igRevenue = instagram?.revenue ?? 0;
  const totalRevenue = waRevenue + igRevenue;
  const hasRevenue = totalRevenue > 0;
  // Share is undefined (not 50/50) when nothing was sold.
  const waRevShare = hasRevenue ? Math.round((waRevenue / totalRevenue) * 100) : null;
  const igRevShare = waRevShare === null ? null : 100 - waRevShare;

  // With no revenue, a single neutral ring keeps the donut's shape (recharts draws nothing for all-zero data).
  const pieData = hasRevenue
    ? [
      { name: "WhatsApp", value: waRevenue, color: brandChannels.whatsapp },
      { name: "Instagram", value: igRevenue, color: brandChannels.instagram },
    ]
    : [{ name: "empty", value: 1, color: "var(--border)" }];

  const cockpit = useCockpitMode();
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const tableAreaH = useElementHeight(tableAreaRef, cockpit);

  const count = (stats: ChannelStats | null, key: "orders" | "messages") =>
    stats ? stats[key].toLocaleString("en-IN") : DASH;

  // A channel with no messages shows a dash rather than 0.
  const messages = (stats: ChannelStats | null) => (stats && stats.messages > 0 ? count(stats, "messages") : DASH);
  const tableRows: Array<{ label: string; wa: string; ig: string }> = [
    { label: "Orders", wa: count(whatsapp, "orders"), ig: count(instagram, "orders") },
    { label: "Avg order value", wa: aov(whatsapp), ig: aov(instagram) },
    { label: "Messages", wa: messages(whatsapp), ig: messages(instagram) },
    { label: "Orders / 100 msgs", wa: conversion(whatsapp), ig: conversion(instagram) },
  ];
  // Single-screen layout: show as many rows as the table area fits (the donut keeps its minimum).
  // Elsewhere the card has natural height, so every row is shown.
  const fit = cockpit ? channelTableFit(tableAreaH, tableRows.length) : null;
  const visibleRows = fit ? tableRows.slice(0, fit.rows) : tableRows;
  const bodyRowH = fit?.rowH;

  const centerTotalText = !hasData
    ? DASH
    : !hasRevenue
      ? "₹0"
      : totalRevenue < 10000
        ? `₹${(totalRevenue / 1000).toFixed(1)}k`
        : `₹${Math.round(totalRevenue / 1000)}k`;

  return (
    <div
      className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-2 flex-1 min-h-0 overflow-hidden"
      style={{ "--wa": brandChannels.whatsapp, "--ig": brandChannels.instagram } as CSSProperties}
    >
      {/* ─── Card Header (h-9) ──────────────────────────────────────────────── */}
      <div className="h-9 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted">Channels</h3>
        </div>
        <button
          type="button"
          onClick={() => navigate("/inbox")}
          className="shrink-0 text-[11px] text-text-muted hover:text-text transition-colors flex items-center gap-0.5 font-medium cursor-pointer"
        >
          <span>Inbox</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      {/* ─── Top Block: donut left + two channel rows right; stacked when the card is narrow.
            Single-screen layout: the block takes the free height (up to 156px); the donut and the
            two boxes share that exact height, so the boxes always match the pie. ─── */}
      <div
        className={`flex flex-col items-center gap-3 @min-[20rem]:flex-row @min-[20rem]:items-stretch @min-[20rem]:gap-4 ${cockpit ? "flex-1 min-h-[130px] max-h-[156px]" : "shrink-0"
          }`}
      >
        {/* Donut — overflow-hidden prevents recharts SVG from leaking */}
        <div
          className={`relative shrink-0 flex items-center justify-center overflow-hidden ${cockpit ? "h-full min-h-[130px] aspect-square" : "w-[128px] h-[128px]"
            }`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (hasRevenue && active && payload && payload.length > 0 && payload[0]) {
                    const item = payload[0];
                    const color = (item.payload as { color?: string })?.color ?? brandChannels.whatsapp;
                    return (
                      <div className="px-2.5 py-1 rounded-lg border border-border bg-surface/95 shadow-lg text-11 backdrop-blur-md">
                        <span className="font-semibold" style={{ color }}>
                          {item.name}:
                        </span>{" "}
                        <span className="font-bold font-outfit text-text">
                          ₹{Number(item.value ?? 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="64%"
                outerRadius="96%"
                paddingAngle={hasRevenue ? 3 : 0}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center Text inside Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <span
              className={`text-17 sm:text-18 font-bold font-outfit leading-tight ${hasRevenue ? "text-text" : "text-text-muted"}`}
            >
              {centerTotalText}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted font-bold mt-0.5">
              {hasData && !hasRevenue ? "No revenue yet" : "REVENUE"}
            </span>
          </div>
        </div>

        {/* Channel Rows */}
        <div className="w-full @min-[20rem]:w-auto @min-[20rem]:flex-1 @min-[20rem]:self-stretch min-w-0 flex flex-col gap-2">
          {/* WhatsApp Row */}
          <button
            type="button"
            onClick={() => navigate("/inbox?channel=whatsapp")}
            className="w-full flex-1 min-h-0 flex flex-col justify-center gap-1 text-left px-3 py-2 rounded-lg bg-surface-muted/50 hover:bg-[var(--wa)]/10 transition-all border border-border/60 hover:border-[var(--wa)]/30 cursor-pointer group select-none"
            title="Filter inbox by WhatsApp"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-text text-12 sm:text-13 flex items-center gap-1.5 group-hover:text-[var(--wa)] transition-colors truncate">
                <span className="w-2 h-2 rounded-full bg-[var(--wa)] shrink-0" />
                <span>WhatsApp</span>
              </span>
              <span className="font-bold font-outfit text-text text-12 sm:text-13 shrink-0">
                {whatsapp ? rupees(whatsapp.revenue) : DASH}
              </span>
            </div>
            <div className="text-11 text-text-muted whitespace-nowrap truncate">
              <span className="font-bold text-[var(--wa)]">{waRevShare === null ? DASH : `${waRevShare}%`}</span> ·{" "}
              {whatsapp ? `${whatsapp.orders} ${whatsapp.orders === 1 ? "order" : "orders"}` : "no data"}
            </div>
          </button>

          {/* Instagram Row */}
          <button
            type="button"
            onClick={() => navigate("/inbox?channel=instagram")}
            className="w-full flex-1 min-h-0 flex flex-col justify-center gap-1 text-left px-3 py-2 rounded-lg bg-surface-muted/50 hover:bg-[var(--ig)]/10 transition-all border border-border/60 hover:border-[var(--ig)]/30 cursor-pointer group select-none"
            title="Filter inbox by Instagram"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-text text-12 sm:text-13 flex items-center gap-1.5 group-hover:text-[var(--ig)] transition-colors truncate">
                <span className="w-2 h-2 rounded-full bg-[var(--ig)] shrink-0" />
                <span>Instagram</span>
              </span>
              <span className="font-bold font-outfit text-text text-12 sm:text-13 shrink-0">
                {instagram ? rupees(instagram.revenue) : DASH}
              </span>
            </div>
            <div className="text-11 text-text-muted whitespace-nowrap truncate">
              <span className="font-bold text-[var(--ig)]">{igRevShare === null ? DASH : `${igRevShare}%`}</span> ·{" "}
              {instagram ? `${instagram.orders} ${instagram.orders === 1 ? "order" : "orders"}` : "no data"}
            </div>
          </button>
        </div>
      </div>

      {/* ─── Compact Comparison Table (text-12, rows h-7, hairline borders) ────
            Single-screen layout shows the rows that fit; elsewhere all rows. */}
      <div
        ref={tableAreaRef}
        className={cockpit ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "shrink-0 mt-1"}
      >
        {visibleRows.length > 0 && (
          <table className="w-full text-12 border-separate border-spacing-0 rounded-lg border border-border/60 bg-surface-muted/50 overflow-hidden">
            <thead>
              <tr className="h-7 text-text-muted text-[12px] font-semibold uppercase tracking-wider">
                <th className="text-left font-semibold pl-2.5 border-b border-border/50">
                  <span className="sr-only">Metric</span>
                </th>
                <th className="text-right font-semibold border-b border-border/50">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--wa)]" />
                    <span>WhatsApp</span>
                  </span>
                </th>
                <th className="text-right font-semibold pr-2.5 border-b border-border/50">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ig)]" />
                    <span>Instagram</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => {
                const divider = i < visibleRows.length - 1 ? "border-b border-border/40" : "";
                return (
                  <tr key={row.label} className="h-7" style={bodyRowH ? { height: bodyRowH } : undefined}>
                    <td className={`pl-2.5 text-text-muted whitespace-nowrap ${divider}`}>{row.label}</td>
                    <td className={`text-right font-outfit font-semibold text-text tabular-nums ${divider}`}>{row.wa}</td>
                    <td className={`pr-2.5 text-right font-outfit font-semibold text-text tabular-nums ${divider}`}>{row.ig}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
