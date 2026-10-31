import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Download,
  Calendar,
  Sparkles,
  TrendingUp,
  Package,
  Bot,
  Clock,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext.tsx";
import { StatCard, type StatCardProps } from "../components/shared/StatCard.tsx";
import { SegmentedControl } from "../components/shared/SegmentedControl.tsx";
import { useAnalytics } from "../hooks/useAnalytics.ts";
import { formatDuration } from "../lib/format.ts";
import { escalationReasonLabel } from "../lib/escalationReasons.ts";
import type { AnalyticsTrend } from "../types/index.ts";

import { AttentionStrip, type AttentionData } from "../components/analytics/AttentionStrip.tsx";
import {
  MainChartCard,
  type DailyRevenueItem,
  type DailyMessageItem,
} from "../components/analytics/MainChartCard.tsx";
import { ChannelsCard } from "../components/analytics/ChannelsCard.tsx";
import { TopProductsCard } from "../components/analytics/TopProductsCard.tsx";
import { AiHealthCard, type EscalationReasonStat } from "../components/analytics/AiHealthCard.tsx";
import { RecentActivityCard } from "../components/analytics/RecentActivityCard.tsx";
import { AnalyticsSkeleton } from "../components/analytics/AnalyticsSkeleton.tsx";

// ─── Date Ranges ─────────────────────────────────────────────────────────────

type RangePreset = "7d" | "30d" | "custom";

interface DateRange {
  preset: RangePreset;
  from: string;
  to: string;
}

function presetRange(preset: "7d" | "30d"): DateRange {
  const now = dayjs();
  const days = preset === "7d" ? 7 : 30;
  return {
    preset,
    from: now.subtract(days - 1, "day").startOf("day").toISOString(),
    to: now.toISOString(),
  };
}

function customRange(start: string, end: string): DateRange {
  return {
    preset: "custom",
    from: dayjs(start).startOf("day").toISOString(),
    to: dayjs(end).endOf("day").toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}



// ─── Real-data helpers ───────────────────────────────────────────────────────

const DASH = "—";

type StatTrend = StatCardProps["trend"];

/** Trend chip from trends.*.changePct. Hidden (undefined) when there is no previous value or no change. */
function trendChip(t: AnalyticsTrend | undefined, label: string, lowerIsBetter = false): StatTrend {
  if (!t || t.changePct === null || !Number.isFinite(t.changePct)) return undefined;
  const abs = Math.abs(t.changePct);
  const shown = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10;
  if (shown === 0) return undefined;
  const up = t.changePct > 0;
  return {
    value: `${shown}%`,
    direction: up ? "up" : "down",
    isPositive: lowerIsBetter ? !up : up,
    label,
  };
}

/** "2026-10-24" → "24 Oct" for the chart axis. */
const axisDate = (date: string) => dayjs(date).format("D MMM");

// ─── Analytics Main Cockpit Page ─────────────────────────────────────────────

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [range, setRange] = useState<DateRange>(() => presetRange("7d"));
  const [pickerPreset, setPickerPreset] = useState<RangePreset>("7d");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(() => dayjs().subtract(6, "day").format("YYYY-MM-DD"));
  const [customEndDate, setCustomEndDate] = useState(() => dayjs().format("YYYY-MM-DD"));

  // Active channel ("all" | "whatsapp" | "instagram")
  const rawChannel = searchParams.get("channel");
  const activeChannel: "all" | "whatsapp" | "instagram" =
    rawChannel === "whatsapp" || rawChannel === "instagram" ? rawChannel : "all";

  // Backend queries (channel is part of the analytics query key)
  const analytics = useAnalytics({
    from: range.from,
    to: range.to,
    channel: activeChannel === "all" ? undefined : activeChannel,
  });

  const data = analytics.data;
  const isLoading = analytics.isLoading;
  const isError = analytics.isError;

  // Trends compare against the previous period of the same length.
  const trendLabel =
    range.preset === "30d" ? "previous 30 days" : range.preset === "7d" ? "previous 7 days" : "previous period";
  const trendShort = range.preset === "30d" ? "prev 30d" : range.preset === "7d" ? "prev 7d" : "prev period";

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // ─── Main chart series (zero-filled by the API for every day in range) ─────
  const revenueDailyData: DailyRevenueItem[] = useMemo(
    () => (data?.revenue?.daily ?? []).map((d) => ({ ...d, date: axisDate(d.date) })),
    [data?.revenue?.daily]
  );
  const messagesDailyData: DailyMessageItem[] = useMemo(
    () => (data?.messagesDaily ?? []).map((d) => ({ ...d, date: axisDate(d.date) })),
    [data?.messagesDaily]
  );

  // ─── Escalations: from analytics attention (channel-filtered) ─────────────
  const openEscalationsCount: number | null = data?.attention?.openEscalations ?? null;

  const oldestWaitingText = useMemo(() => {
    const oldest = data?.attention?.oldestOpenEscalationAt;
    if (!oldest) return null;
    const seconds = Math.max(60, dayjs().diff(dayjs(oldest), "second"));
    // Whole days once past a day, so the small tile never truncates ("26d", not "25d 23h").
    return seconds >= 86_400 ? `${Math.floor(seconds / 86_400)}d` : formatDuration(seconds);
  }, [data?.attention?.oldestOpenEscalationAt]);

  // ─── Attention strip (null = not available, never faked) ──────────────────
  const attentionData: AttentionData = {
    openEscalations: openEscalationsCount,
    windowsClosingSoon: data?.attention?.windowsClosingSoon ?? null,
    pendingOrders: data?.attention?.pendingOrders ?? data?.orders?.pending ?? null,
    unpaidBalance: data?.attention?.unpaidBalance ?? null,
  };

  // ─── KPI values: zero stays 0; missing → "—" with no trend chip ────────────
  const revenueValue = data?.revenue ? data.revenue.total : null;
  const ordersValue = data?.orders ? (data.orders.total ?? data.orders.confirmed) : null;
  const messagesValue = data?.messages ? data.messages.total : null;

  const autoRepliesCount = data ? data.autoReplies : null;
  const escalationsCount = data ? data.escalations : null;
  // A rate needs at least one processed message; with none it is "—", not 0%.
  const processed = (autoRepliesCount ?? 0) + (escalationsCount ?? 0);
  const autoReplyRateValue = data && processed > 0 ? Math.round(data.autoReplyRate * 100) : null;

  // avgResponseTimeSeconds = mean time from escalation to resolution.
  const avgResolveText =
    data?.avgResponseTimeSeconds !== null && data?.avgResponseTimeSeconds !== undefined
      ? formatDuration(data.avgResponseTimeSeconds)
      : null;

  const trends = data?.trends;
  const revenueTrend = revenueValue === null ? undefined : trendChip(trends?.revenue, trendLabel);
  const ordersTrend = ordersValue === null ? undefined : trendChip(trends?.orders, trendLabel);
  const messagesTrend = messagesValue === null ? undefined : trendChip(trends?.messages, trendLabel);
  const autoReplyTrend = autoReplyRateValue === null ? undefined : trendChip(trends?.autoReplyRate, trendLabel);
  const avgResolveTrend =
    avgResolveText === null ? undefined : trendChip(trends?.avgResponseTimeSeconds, trendLabel, true);

  const aiTrendPct = autoReplyRateValue === null ? null : (trends?.autoReplyRate?.changePct ?? null);
  const aiTrendText =
    aiTrendPct === null || Math.round(Math.abs(aiTrendPct)) === 0
      ? null
      : `${aiTrendPct > 0 ? "↑" : "↓"}${Math.round(Math.abs(aiTrendPct))}% vs ${trendShort}`;

  // ─── Channels card ─────────────────────────────────────────────────────────
  const channelsWhatsapp = data?.channels?.whatsapp ?? null;
  const channelsInstagram = data?.channels?.instagram ?? null;

  // ─── AI health: escalation reasons (real, sorted, no padding) ──────────────
  const escalationReasonsList: EscalationReasonStat[] = useMemo(() => {
    const entries = Object.entries(data?.byReason ?? {})
      .map(([code, count]) => ({ code, count: count ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = entries.reduce((acc, cur) => acc + cur.count, 0);
    return entries.map((e) => ({
      code: e.code,
      reason: escalationReasonLabel(e.code),
      count: e.count,
      percentage: total > 0 ? Math.round((e.count / total) * 100) : 0,
    }));
  }, [data?.byReason]);

  // ─── Top products (every product sold in range; real list only) ───────────
  const topProductsList = useMemo(() => data?.topProducts ?? [], [data?.topProducts]);

  // ─── Export Handler (CSV of the real values on screen; blank = not available) ──
  const handleExport = () => {
    const filename = `analytics_${dayjs(range.from).format("YYYY-MM-DD")}_to_${dayjs(range.to).format("YYYY-MM-DD")}.csv`;
    const cell = (v: number | string | null) => (v === null ? "" : v);
    const rows: Array<Array<string | number>> = [
      ["Analytics Report", ""],
      ["Date Range", `${dayjs(range.from).format("YYYY-MM-DD")} to ${dayjs(range.to).format("YYYY-MM-DD")}`],
      ["Channel Filter", activeChannel.toUpperCase()],
      [],
      ["Key Metrics", "Value"],
      ["Revenue (₹)", cell(revenueValue)],
      ["Orders Confirmed", cell(ordersValue)],
      ["Messages Total", cell(messagesValue)],
      ["AI Reply Rate", autoReplyRateValue === null ? "" : `${autoReplyRateValue}%`],
      ["Avg Resolve Time", cell(avgResolveText)],
      ["Open Escalations", cell(openEscalationsCount)],
      [],
      ["Channel Breakdown", "Messages", "Revenue (₹)", "Orders"],
      ...(channelsWhatsapp
        ? [["WhatsApp", channelsWhatsapp.messages, channelsWhatsapp.revenue, channelsWhatsapp.orders]]
        : []),
      ...(channelsInstagram
        ? [["Instagram", channelsInstagram.messages, channelsInstagram.revenue, channelsInstagram.orders]]
        : []),
      [],
      ["AI Performance", "Count"],
      ["Auto-Replies", cell(autoRepliesCount)],
      ["Escalations", cell(escalationsCount)],
      [],
      ["Escalation Reasons", "Count", "Share %"],
      ...escalationReasonsList.map((r) => [r.reason, r.count, `${r.percentage}%`]),
      [],
      ["Top Products", "Units Sold", "Revenue (₹)"],
      ...topProductsList.map((p) => [p.name, p.units, p.revenue]),
      [],
      ["Daily Revenue", "Revenue (₹)", "Orders"],
      ...(data?.revenue?.daily ?? []).map((d) => [d.date, d.revenue, d.orders]),
      [],
      ["Daily Messages", "Inbound", "Outbound"],
      ...(data?.messagesDaily ?? []).map((d) => [d.date, d.inbound, d.outbound]),
    ];

    downloadCsv(filename, rows);
    toast.success("Analytics exported", { description: filename });
  };

  const applyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      toast.error("Pick a start and end date");
      return;
    }
    if (dayjs(customStartDate).isAfter(dayjs(customEndDate))) {
      toast.error("The start date must be before the end date");
      return;
    }
    setRange(customRange(customStartDate, customEndDate));
    setShowCustomPicker(false);
  };

  // ─── Loading: card-shaped skeleton matching the real layout (no jump) ───────
  if (isLoading && !data) {
    return <AnalyticsSkeleton />;
  }

  // ─── Error Fallback with Retry ──────────────────────────────────────────────
  if (isError) {
    return (
      <div className="w-full h-full min-h-0 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 mb-3 border border-rose-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-16 font-bold font-outfit text-text mb-1">Failed to load analytics</h2>
        <p className="text-12 text-text-muted max-w-sm mb-4">
          There was an error communicating with the analytics service. Please check your connection and try again.
        </p>
        <button
          onClick={() => void analytics.refetch()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-medium hover:bg-[#2BAFC0] transition-colors shadow-2xs active:scale-95 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-h-0 flex flex-col p-4 lg:p-5 gap-4 [@media(min-width:1024px)_and_(min-height:760px)]:h-full [@media(min-width:1024px)_and_(min-height:760px)]:overflow-hidden">
      {/* ─── Header Block (Greeting + Date + Controls + Attention Row) ────────── */}
      <div className="flex flex-col gap-1 shrink-0 mb-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-10 shrink-0 relative">
          {/* Left: Greeting (date underneath) + attention chips on the same line */}
          <div className="flex items-center gap-x-5 gap-y-2 flex-wrap min-w-0">
            <div className="shrink-0">
              <h1 className="text-20 sm:text-22 font-bold font-outfit text-text tracking-tight leading-tight">
                {greeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="text-11 sm:text-12 text-text-muted font-medium">{formattedDate}</p>
            </div>
            <AttentionStrip data={attentionData} />
          </div>

          {/* Right: [All | WA | IG] [7d | 30d | Custom] [Export] */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <SegmentedControl<"all" | "whatsapp" | "instagram">
              size="sm"
              options={[
                { value: "all", label: "All" },
                { value: "whatsapp", label: "WA" },
                { value: "instagram", label: "IG" },
              ]}
              value={activeChannel}
              onChange={(val) => {
                setSearchParams(val === "all" ? {} : { channel: val });
              }}
            />

            <SegmentedControl<RangePreset>
              size="sm"
              options={[
                { value: "7d", label: "7d" },
                { value: "30d", label: "30d" },
                { value: "custom", label: "Custom" },
              ]}
              value={pickerPreset}
              onChange={(val) => {
                setPickerPreset(val);
                if (val === "custom") {
                  setShowCustomPicker(true);
                } else {
                  setShowCustomPicker(false);
                  setRange(presetRange(val));
                }
              }}
            />

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 h-7 px-2 sm:px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-text text-11 font-medium transition-all shadow-2xs active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-primary cursor-pointer select-none"
              title="Export CSV of current dashboard data"
            >
              <Download className="w-3 h-3 text-text-muted" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>

          {/* Custom Date Range Floating Dropdown */}
          {showCustomPicker && (
            <div className="absolute right-0 top-10 z-50 p-3 rounded-xl border border-border bg-surface shadow-xl flex flex-wrap items-center gap-2 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-2 duration-150">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-1 text-11 rounded-md border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-text-muted text-11">to</span>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-1 text-11 rounded-md border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={applyCustomRange}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-11 font-medium hover:bg-[#2BAFC0] transition-colors cursor-pointer"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomPicker(false);
                  setPickerPreset(range.preset);
                }}
                className="p-1 rounded-md hover:bg-surface-muted text-text-muted cursor-pointer"
                aria-label="Close custom picker"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ─── Row 1: KPI Row (6 StatCards, h-[104px], gap-4) ──────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        <StatCard
          label="Revenue"
          value={revenueValue ?? DASH}
          prefix={revenueValue === null ? undefined : "₹"}
          trend={revenueTrend}
          color="amber"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />

        <StatCard
          label="Orders"
          value={ordersValue ?? DASH}
          trend={ordersTrend}
          tooltip={data?.orders?.confirmed !== undefined ? `${data.orders.confirmed} confirmed` : undefined}
          color="blue"
          icon={<Package className="w-3.5 h-3.5" />}
          onClick={() => navigate("/orders")}
        />

        <StatCard
          label="Messages"
          value={messagesValue ?? DASH}
          trend={messagesTrend}
          color="teal"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          onClick={() => navigate("/inbox")}
        />

        <StatCard
          label="AI Reply Rate"
          value={autoReplyRateValue ?? DASH}
          suffix={autoReplyRateValue === null ? undefined : "%"}
          trend={autoReplyTrend}
          color="violet"
          icon={<Bot className="w-3.5 h-3.5" />}
        />

        <StatCard
          label="Avg Resolve"
          value={avgResolveText ?? DASH}
          trend={avgResolveTrend}
          color="emerald"
          icon={<Clock className="w-3.5 h-3.5" />}
        />

        <StatCard
          label="Escalations"
          value={openEscalationsCount ?? DASH}
          color="danger"
          pulsingDot={(openEscalationsCount ?? 0) > 0}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          onClick={() => navigate("/escalations")}
        />
      </div>

      {/* ─── Row 2: 3 Equal Cards (Chart · Channels · AI Health) ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [@media(min-width:1024px)_and_(min-height:760px)]:flex-[50] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
        <div className="min-w-0 flex flex-col min-h-[300px] md:col-span-2 lg:col-span-1 [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <MainChartCard revenueData={revenueDailyData} messagesData={messagesDailyData} />
        </div>

        <div className="min-w-0 flex flex-col [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <ChannelsCard whatsapp={channelsWhatsapp} instagram={channelsInstagram} />
        </div>

        <div className="min-w-0 flex flex-col [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <AiHealthCard
            autoReplyRate={autoReplyRateValue}
            autoRepliesCount={autoRepliesCount}
            escalationsCount={escalationsCount}
            topReasons={escalationReasonsList}
            openEscalationsCount={openEscalationsCount}
            oldestWaitingText={oldestWaitingText}
            avgResolveText={avgResolveText}
            trendVsPrev={aiTrendText}
            trendPositive={(aiTrendPct ?? 0) >= 0}
          />
        </div>
      </div>

      {/* ─── Row 3: 2 Cards (64% Top Products, 36% Recent Activity) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[64fr_36fr] gap-4 [@media(min-width:1024px)_and_(min-height:760px)]:flex-[50] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
        <div className="min-w-0 flex flex-col h-[400px] [@media(min-width:1024px)_and_(min-height:760px)]:h-auto [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <TopProductsCard products={topProductsList} />
        </div>

        <div className="min-w-0 flex flex-col h-[400px] lg:h-auto lg:[contain:size] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <RecentActivityCard />
        </div>
      </div>
    </div>
  );
}
