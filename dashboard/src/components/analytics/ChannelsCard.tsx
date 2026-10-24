import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { SampleDataBadge } from "../shared/SampleDataBadge.tsx";
import { brandChannels } from "../../theme/index.ts";
import { useCockpitMode, useMediaQuery } from "./cockpit.tsx";

/** Table rows in the single-screen layout: 2 normally, all of them on tall screens. */
const COCKPIT_TABLE_ROWS = 2;
const TALL_SCREEN_QUERY = "(min-height: 1100px)";

export interface ChannelStats {
  messages: number;
  revenue: number;
  orders: number;
}

interface ChannelsCardProps {
  whatsapp: ChannelStats;
  instagram: ChannelStats;
  isSample?: boolean;
}

export function ChannelsCard({ whatsapp, instagram, isSample }: ChannelsCardProps) {
  const navigate = useNavigate();

  const totalRevenue = whatsapp.revenue + instagram.revenue;
  const waRevShare = totalRevenue > 0 ? Math.round((whatsapp.revenue / totalRevenue) * 100) : 50;
  const igRevShare = 100 - waRevShare;

  const waAov = whatsapp.orders > 0 ? Math.round(whatsapp.revenue / whatsapp.orders) : 0;
  const igAov = instagram.orders > 0 ? Math.round(instagram.revenue / instagram.orders) : 0;

  const pieData = [
    {
      name: "WhatsApp",
      value: whatsapp.revenue,
      color: brandChannels.whatsapp,
    },
    {
      name: "Instagram",
      value: instagram.revenue,
      color: brandChannels.instagram,
    },
  ];

  const cockpit = useCockpitMode();
  const tallScreen = useMediaQuery(TALL_SCREEN_QUERY);

  const showMessageRows = Boolean(isSample || whatsapp.messages > 0 || instagram.messages > 0);
  const tableRows: Array<{ label: string; wa: string; ig: string }> = [
    { label: "Orders", wa: String(whatsapp.orders), ig: String(instagram.orders) },
    {
      label: "Avg order value",
      wa: `₹${waAov.toLocaleString("en-IN")}`,
      ig: `₹${igAov.toLocaleString("en-IN")}`,
    },
  ];
  // Only show Messages & conversion rows when data is meaningful
  if (showMessageRows) {
    tableRows.push(
      { label: "Messages", wa: String(whatsapp.messages), ig: String(instagram.messages) },
      {
        label: "Orders / 100 msgs",
        wa: whatsapp.messages > 0 ? ((whatsapp.orders / whatsapp.messages) * 100).toFixed(1) : "0.0",
        ig: instagram.messages > 0 ? ((instagram.orders / instagram.messages) * 100).toFixed(1) : "0.0",
      }
    );
  }
  // Single-screen layout: a fixed, short table so the donut can take the free height.
  // Elsewhere the card has natural height, so every row is shown.
  const visibleRows = cockpit && !tallScreen ? tableRows.slice(0, COCKPIT_TABLE_ROWS) : tableRows;

  const centerTotalText =
    totalRevenue < 10000 && totalRevenue > 0
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
          {isSample && <SampleDataBadge />}
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
        className={`flex flex-col items-center gap-3 @min-[20rem]:flex-row @min-[20rem]:items-stretch @min-[20rem]:gap-4 ${cockpit ? "flex-1 min-h-0 max-h-[156px]" : "shrink-0"
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
                  if (active && payload && payload.length > 0 && payload[0]) {
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
                paddingAngle={3}
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
            <span className="text-17 sm:text-18 font-bold font-outfit text-text leading-tight">
              {centerTotalText}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted font-bold mt-0.5">
              REVENUE
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
                ₹{whatsapp.revenue.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="text-11 text-text-muted whitespace-nowrap truncate">
              <span className="font-bold text-[var(--wa)]">{waRevShare}%</span> · {whatsapp.orders} orders
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
                ₹{instagram.revenue.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="text-11 text-text-muted whitespace-nowrap truncate">
              <span className="font-bold text-[var(--ig)]">{igRevShare}%</span> · {instagram.orders} orders
            </div>
          </button>
        </div>
      </div>

      {/* ─── Compact Comparison Table (text-12, rows h-7, hairline borders) ────
            Single-screen layout shows the first rows only; elsewhere all rows. */}
      <div className="shrink-0 mt-4">
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
                  <tr key={row.label} className="h-7">
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
