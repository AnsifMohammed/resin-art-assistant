import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { BarChart3, MessageSquare } from "lucide-react";
import { SegmentedControl } from "../shared/SegmentedControl.tsx";

export interface DailyRevenueItem {
  date: string;
  revenue: number;
  orders: number;
}

export interface DailyMessageItem {
  date: string;
  inbound: number;
  outbound: number;
}

/** Compact INR: 48700 → "₹48.7k", 120000 → "₹1.2L" */
function formatINRCompact(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${n}`;
}

/** Props recharts passes to a Bar `label` render function (only the ones used here). */
interface BarLabelProps {
  x?: number | string | undefined;
  y?: number | string | undefined;
  width?: number | string | undefined;
  value?: unknown;
}

interface MainChartCardProps {
  /** One item per day in the selected range (zero-filled). Empty when the API has no data. */
  revenueData: DailyRevenueItem[];
  messagesData: DailyMessageItem[];
}

export function MainChartCard({ revenueData, messagesData }: MainChartCardProps) {
  const [metric, setMetric] = useState<"revenue" | "messages">("revenue");

  const totalRevenue = revenueData.reduce((acc, d) => acc + d.revenue, 0);
  const totalOrders = revenueData.reduce((acc, d) => acc + d.orders, 0);

  const totalInbound = messagesData.reduce((acc, d) => acc + d.inbound, 0);
  const totalOutbound = messagesData.reduce((acc, d) => acc + d.outbound, 0);

  // Nothing to plot: every day is zero (or the API sent no series).
  const revenueEmpty = totalRevenue <= 0 && totalOrders <= 0;
  const messagesEmpty = totalInbound + totalOutbound <= 0;
  const isEmpty = metric === "revenue" ? revenueEmpty : messagesEmpty;

  // Period-based sizing for bars
  const barCount = revenueData.length;
  // Wide bars sitting close together; the gap shrinks as there are fewer days.
  const maxBarSize =
    barCount <= 7 ? 88 : barCount <= 14 ? 52 : barCount <= 31 ? 24 : 12;
  const barCategoryGap = barCount <= 7 ? "14%" : barCount <= 14 ? "18%" : "24%";
  const barRadius: [number, number, number, number] =
    barCount <= 14 ? [6, 6, 0, 0] : [4, 4, 0, 0];

  // X-axis label spacing so 30 days don't collide
  const xAxisInterval = barCount > 20 ? 4 : barCount > 10 ? 1 : 0;

  // Label only the highest revenue bar. Matched by value, not index: recharts skips
  // zero-height bars, so the label index does not line up with the data index.
  const maxRevenue = Math.max(...revenueData.map((d) => d.revenue), 0);

  const renderMaxBarLabel = (props: BarLabelProps) => {
    const { x = 0, y = 0, width = 0, value = 0 } = props;
    const numVal = Number(value) || 0;
    if (numVal !== maxRevenue || numVal <= 0) return null;
    const numX = Number(x) || 0;
    const numY = Number(y) || 0;
    const numWidth = Number(width) || 0;
    return (
      <text
        x={numX + numWidth / 2}
        y={numY - 5}
        fill="currentColor"
        textAnchor="middle"
        className="text-text-muted font-outfit font-medium text-[11px]"
      >
        ₹{numVal.toLocaleString("en-IN")}
      </text>
    );
  };

  return (
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col gap-3 flex-1 min-h-0 overflow-hidden focus-visible:ring-1 focus-visible:ring-primary">
      <style>{`
        .recharts-wrapper:focus,
        .recharts-surface:focus,
        .recharts-wrapper *:focus {
          outline: none !important;
        }
      `}</style>
      {/* ─── Card Header (h-9) ──────────────────────────────────────────────── */}
      <div className="h-9 flex items-center justify-between gap-3 shrink-0 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <SegmentedControl<"revenue" | "messages">
            size="sm"
            options={[
              { value: "revenue", label: "Revenue" },
              { value: "messages", label: "Messages" },
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>

        {/* Legend & Summary Info — one compact line, full text in title */}
        <div className="flex items-center justify-end gap-2 text-11 font-medium text-text-muted min-w-0">
          {metric === "revenue" ? (
            <span
              title={`₹${totalRevenue.toLocaleString("en-IN")} total · ${totalOrders} orders`}
              className="whitespace-nowrap truncate min-w-0 font-outfit font-semibold text-text"
            >
              {formatINRCompact(totalRevenue)}
              <span className="font-normal text-text-muted ml-1">· {totalOrders} orders</span>
            </span>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0 whitespace-nowrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-text whitespace-nowrap">In ({totalInbound})</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
                <span className="text-text whitespace-nowrap">Out ({totalOutbound})</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Chart Body (flex-1 min-h-0, ResponsiveContainer 100%) ─────────── */}
      {isEmpty ? (
        <div className="w-full flex-1 min-h-0 rounded-lg border border-dashed border-border/70 bg-surface-muted/40 flex flex-col items-center justify-center gap-1.5 text-center p-4">
          {metric === "revenue" ? (
            <BarChart3 className="w-6 h-6 text-text-muted opacity-40" aria-hidden />
          ) : (
            <MessageSquare className="w-6 h-6 text-text-muted opacity-40" aria-hidden />
          )}
          <p className="text-12 font-medium text-text-muted">
            {metric === "revenue" ? "No sales in this period" : "No messages in this period"}
          </p>
        </div>
      ) : (
      <div className="w-full flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {metric === "revenue" ? (
            <BarChart
              data={revenueData}
              barCategoryGap={barCategoryGap}
              margin={{ top: 18, right: 6, left: -22, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="currentColor"
                className="text-border/40"
              />
              <XAxis
                dataKey="date"
                interval={xAxisInterval}
                tickLine={false}
                axisLine={{ stroke: "rgba(120, 120, 120, 0.2)" }}
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-text-muted"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                className="text-text-muted"
              />
              <Tooltip
                cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length > 0 && payload[0]) {
                    const point = payload[0].payload as DailyRevenueItem;
                    return (
                      <div className="px-2.5 py-1.5 rounded-lg border border-border bg-surface/95 shadow-lg text-11 backdrop-blur-md">
                        <span className="font-semibold text-text">{label}</span>
                        <span className="text-text-muted"> · </span>
                        <span className="font-bold font-outfit text-text">
                          ₹{point.revenue.toLocaleString("en-IN")}
                        </span>
                        <span className="text-text-muted">
                          {" "}· {point.orders} {point.orders === 1 ? "order" : "orders"}
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="revenue"
                radius={barRadius}
                maxBarSize={maxBarSize}
                label={renderMaxBarLabel}
                className="transition-opacity hover:opacity-90 cursor-pointer"
              >
                {revenueData.map((entry, index) => {
                  const isToday = index === revenueData.length - 1;
                  return (
                    <Cell
                      key={`bar-cell-${entry.date}-${index}`}
                      fill="#F59E0B"
                      fillOpacity={isToday ? 1 : 0.75}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart
              data={messagesData}
              margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="currentColor"
                className="text-border/40"
              />
              <XAxis
                dataKey="date"
                interval={xAxisInterval}
                tickLine={false}
                axisLine={{ stroke: "rgba(120, 120, 120, 0.2)" }}
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-text-muted"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "currentColor" }}
                className="text-text-muted"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length > 0 && payload[0]) {
                    const point = payload[0].payload as DailyMessageItem;
                    return (
                      <div className="px-2.5 py-1.5 rounded-xl border border-border bg-surface/95 shadow-xl text-11 backdrop-blur-md space-y-0.5">
                        <p className="font-semibold text-text">{label}</p>
                        <div className="flex items-center gap-3 text-10">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">Inbound: {point.inbound}</span>
                          <span className="text-teal font-medium">Outbound: {point.outbound}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="inbound"
                stroke="#F59E0B"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#inboundGradient)"
              />
              <Area
                type="monotone"
                dataKey="outbound"
                stroke="#0D9488"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#outboundGradient)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
