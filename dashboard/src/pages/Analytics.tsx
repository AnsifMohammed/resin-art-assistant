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
import { StatCard } from "../components/shared/StatCard.tsx";
import { SegmentedControl } from "../components/shared/SegmentedControl.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import { useAnalytics } from "../hooks/useAnalytics.ts";
import { useEscalations } from "../hooks/useEscalations.ts";
import { formatDuration } from "../lib/format.ts";
import { escalationReasonLabel } from "../lib/escalationReasons.ts";
import { mockAnalyticsData } from "../data/mockData.ts";

import { AttentionStrip } from "../components/analytics/AttentionStrip.tsx";
import {
  MainChartCard,
  type DailyRevenueItem,
  type DailyMessageItem,
} from "../components/analytics/MainChartCard.tsx";
import { ChannelsCard } from "../components/analytics/ChannelsCard.tsx";
import { TopProductsCard } from "../components/analytics/TopProductsCard.tsx";
import { AiHealthCard } from "../components/analytics/AiHealthCard.tsx";
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



// ─── Deterministic Patterns for Daily Revenue & Message Volume (30 days) ────
const SAMPLE_DAILY_REVENUE_PATTERN: Array<{ revenue: number; orders: number }> = [
  { revenue: 3800, orders: 2 },
  { revenue: 4200, orders: 2 },
  { revenue: 3100, orders: 1 },
  { revenue: 5400, orders: 3 },
  { revenue: 4600, orders: 2 },
  { revenue: 6100, orders: 3 },
  { revenue: 4900, orders: 2 },
  { revenue: 5200, orders: 3 },
  { revenue: 3900, orders: 2 },
  { revenue: 6800, orders: 3 },
  { revenue: 4400, orders: 2 },
  { revenue: 5800, orders: 3 },
  { revenue: 7200, orders: 4 },
  { revenue: 5100, orders: 2 },
  { revenue: 6300, orders: 3 },
  { revenue: 4700, orders: 2 },
  { revenue: 5600, orders: 3 },
  { revenue: 6900, orders: 4 },
  { revenue: 5300, orders: 2 },
  { revenue: 7600, orders: 4 },
  { revenue: 6100, orders: 3 },
  { revenue: 5400, orders: 2 },
  { revenue: 8200, orders: 4 },
  { revenue: 6400, orders: 3 },
  { revenue: 5900, orders: 3 },
  { revenue: 7100, orders: 4 },
  { revenue: 4800, orders: 2 },
  { revenue: 8600, orders: 5 },
  { revenue: 6500, orders: 3 },
  { revenue: 9400, orders: 5 },
];

const SAMPLE_DAILY_MESSAGES_PATTERN: Array<{ inbound: number; outbound: number }> = [
  { inbound: 85, outbound: 72 },
  { inbound: 92, outbound: 80 },
  { inbound: 104, outbound: 90 },
  { inbound: 115, outbound: 102 },
  { inbound: 98, outbound: 86 },
  { inbound: 110, outbound: 98 },
  { inbound: 125, outbound: 112 },
  { inbound: 102, outbound: 88 },
  { inbound: 135, outbound: 120 },
  { inbound: 142, outbound: 128 },
  { inbound: 118, outbound: 105 },
  { inbound: 130, outbound: 115 },
  { inbound: 148, outbound: 134 },
  { inbound: 136, outbound: 122 },
  { inbound: 155, outbound: 140 },
  { inbound: 122, outbound: 108 },
  { inbound: 140, outbound: 124 },
  { inbound: 160, outbound: 145 },
  { inbound: 132, outbound: 118 },
  { inbound: 145, outbound: 128 },
  { inbound: 158, outbound: 142 },
  { inbound: 128, outbound: 114 },
  { inbound: 165, outbound: 150 },
  { inbound: 148, outbound: 135 },
  { inbound: 142, outbound: 126 },
  { inbound: 152, outbound: 138 },
  { inbound: 138, outbound: 120 },
  { inbound: 170, outbound: 155 },
  { inbound: 156, outbound: 140 },
  { inbound: 162, outbound: 148 },
];

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

  // Backend queries
  const analytics = useAnalytics({
    from: range.from,
    to: range.to,
    channel: activeChannel === "all" ? undefined : activeChannel,
  });
  const openEscalations = useEscalations();

  const data = analytics.data;
  const isLoading = analytics.isLoading;
  const isError = analytics.isError;

  // Sample data fallback for the current channel and date preset
  const sample = mockAnalyticsData[activeChannel][range.preset];

  const rangeLabel =
    range.preset === "custom"
      ? `${dayjs(range.from).format("D MMM")} – ${dayjs(range.to).format("D MMM YYYY")}`
      : range.preset === "30d"
        ? "Last 30 days"
        : "Last 7 days";

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // ─── Main Chart Daily Data (Mapped to End Today or Selected Range) ────────
  const daysCount = useMemo(() => {
    if (range.preset === "30d") return 30;
    if (range.preset === "7d") return 7;
    return Math.max(1, dayjs(range.to).diff(dayjs(range.from), "day") + 1);
  }, [range.preset, range.from, range.to]);

  const revenueDailyData: DailyRevenueItem[] = useMemo(() => {
    if (data?.revenue?.daily && data.revenue.daily.length > 0) {
      return data.revenue.daily;
    }
    const channelMultiplier =
      activeChannel === "whatsapp" ? 0.78 : activeChannel === "instagram" ? 0.22 : 1.0;
    const end = range.preset === "custom" ? dayjs(range.to) : dayjs();

    const items: DailyRevenueItem[] = [];
    for (let i = 0; i < daysCount; i++) {
      const templateIdx =
        daysCount <= SAMPLE_DAILY_REVENUE_PATTERN.length
          ? SAMPLE_DAILY_REVENUE_PATTERN.length - daysCount + i
          : i % SAMPLE_DAILY_REVENUE_PATTERN.length;
      const base = SAMPLE_DAILY_REVENUE_PATTERN[templateIdx] ?? { revenue: 4500, orders: 2 };
      const rev = Math.round((base.revenue * channelMultiplier) / 100) * 100;
      const ord = Math.max(1, Math.round(base.orders * (activeChannel === "instagram" ? 0.4 : 1)));
      items.push({
        date: end.subtract(daysCount - 1 - i, "day").format("D MMM"),
        revenue: rev,
        orders: ord,
      });
    }
    return items;
  }, [data?.revenue?.daily, daysCount, range.preset, range.to, activeChannel]);

  const messagesDailyData: DailyMessageItem[] = useMemo(() => {
    if (data?.messagesDaily && data.messagesDaily.length > 0) {
      return data.messagesDaily;
    }
    const channelMultiplier =
      activeChannel === "whatsapp" ? 0.78 : activeChannel === "instagram" ? 0.22 : 1.0;
    const end = range.preset === "custom" ? dayjs(range.to) : dayjs();

    const items: DailyMessageItem[] = [];
    for (let i = 0; i < daysCount; i++) {
      const templateIdx =
        daysCount <= SAMPLE_DAILY_MESSAGES_PATTERN.length
          ? SAMPLE_DAILY_MESSAGES_PATTERN.length - daysCount + i
          : i % SAMPLE_DAILY_MESSAGES_PATTERN.length;
      const base = SAMPLE_DAILY_MESSAGES_PATTERN[templateIdx] ?? { inbound: 120, outbound: 100 };
      items.push({
        date: end.subtract(daysCount - 1 - i, "day").format("D MMM"),
        inbound: Math.round(base.inbound * channelMultiplier),
        outbound: Math.round(base.outbound * channelMultiplier),
      });
    }
    return items;
  }, [data?.messagesDaily, daysCount, range.preset, range.to, activeChannel]);

  const derivedTotalRevenue = useMemo(
    () => revenueDailyData.reduce((acc, d) => acc + d.revenue, 0),
    [revenueDailyData]
  );
  const derivedTotalOrders = useMemo(
    () => revenueDailyData.reduce((acc, d) => acc + d.orders, 0),
    [revenueDailyData]
  );
  const derivedTotalMessages = useMemo(
    () => messagesDailyData.reduce((acc, d) => acc + d.inbound + d.outbound, 0),
    [messagesDailyData]
  );

  // ─── Attention Strip Data Fallbacks ───────────────────────────────────────
  const escalationsValue =
    openEscalations.data?.length ?? (data?.attention?.openEscalations ?? (data ? 0 : 20));

  const attentionData = useMemo(() => {
    return {
      openEscalations: escalationsValue,
      windowsClosingSoon: data?.attention?.windowsClosingSoon ?? 1,
      pendingOrders: data?.attention?.pendingOrders ?? (data?.orders?.pending ?? 3),
      unpaidBalance: data?.attention?.unpaidBalance ?? 4200,
    };
  }, [escalationsValue, data?.attention, data?.orders?.pending]);

  // ─── KPI Card Data & Trends (Strictly matching chart & channels) ────────────
  const revenueValue = data?.revenue?.total ?? derivedTotalRevenue;
  const revenueTrend = data?.trends?.revenue
    ? {
        value: `${data.trends.revenue.changePct && data.trends.revenue.changePct > 0 ? "+" : ""}${data.trends.revenue.changePct}%`,
        isPositive: (data.trends.revenue.changePct ?? 0) >= 0,
        label: rangeLabel,
      }
    : {
        value: sample.kpis.revenue.trend,
        isPositive: sample.kpis.revenue.isPositive,
        label: rangeLabel,
      };

  const ordersValue = data?.orders?.confirmed ?? derivedTotalOrders;
  const ordersTrend = data?.trends?.orders
    ? {
        value: `${data.trends.orders.changePct && data.trends.orders.changePct > 0 ? "+" : ""}${data.trends.orders.changePct}%`,
        isPositive: (data.trends.orders.changePct ?? 0) >= 0,
        label: rangeLabel,
      }
    : {
        value: sample.kpis.orders.trend,
        isPositive: sample.kpis.orders.isPositive,
        label: rangeLabel,
      };

  // Messages: use real only if > 0, otherwise use derived daily total (which uses sample pattern)
  const messagesValue =
    data?.messages?.total && data.messages.total > 0
      ? data.messages.total
      : derivedTotalMessages;
  const messagesTrend = data?.trends?.messages
    ? {
        value: `${data.trends.messages.changePct && data.trends.messages.changePct > 0 ? "+" : ""}${data.trends.messages.changePct}%`,
        isPositive: (data.trends.messages.changePct ?? 0) >= 0,
        label: rangeLabel,
      }
    : {
        value: sample.kpis.messages.trend,
        isPositive: sample.kpis.messages.isPositive,
        label: rangeLabel,
      };

  // autoReplyRate: use real only if >0 (0% from real API is indistinguishable from missing)
  const autoReplyRateValue =
    data?.autoReplyRate !== undefined && data.autoReplyRate > 0
      ? Math.round(data.autoReplyRate * 100)
      : 94;
  const autoReplyTrend = data?.trends?.autoReplyRate
    ? {
        value: `${data.trends.autoReplyRate.changePct && data.trends.autoReplyRate.changePct > 0 ? "+" : ""}${data.trends.autoReplyRate.changePct}%`,
        isPositive: (data.trends.autoReplyRate.changePct ?? 0) >= 0,
        label: rangeLabel,
      }
    : {
        value: "+4%",
        isPositive: true,
        label: rangeLabel,
      };

  const avgResponseValue = data?.avgResponseTimeSeconds
    ? formatDuration(data.avgResponseTimeSeconds)
    : "1h 24m";
  const avgResponseTrend = data?.trends?.avgResponseTimeSeconds
    ? {
        value: `${data.trends.avgResponseTimeSeconds.changePct && data.trends.avgResponseTimeSeconds.changePct > 0 ? "+" : ""}${data.trends.avgResponseTimeSeconds.changePct}%`,
        isPositive: (data.trends.avgResponseTimeSeconds.changePct ?? 0) <= 0,
        label: rangeLabel,
      }
    : {
        value: "↓15s",
        isPositive: true,
        label: rangeLabel,
      };

  // ─── Channels Card Data (Strictly matching chart total & orders) ───────────
  const channelsWhatsapp = useMemo(() => {
    if (data?.channels?.whatsapp) return data.channels.whatsapp;
    const waShare = 0.78;
    const rev = Math.round(revenueValue * waShare);
    const ord = Math.round(ordersValue * waShare);
    const msg = Math.round(messagesValue * waShare);
    return {
      messages: msg,
      revenue: rev,
      orders: ord,
    };
  }, [data?.channels?.whatsapp, revenueValue, ordersValue, messagesValue]);

  const channelsInstagram = useMemo(() => {
    if (data?.channels?.instagram) return data.channels.instagram;
    return {
      messages: Math.max(0, messagesValue - channelsWhatsapp.messages),
      revenue: Math.max(0, revenueValue - channelsWhatsapp.revenue),
      orders: Math.max(0, ordersValue - channelsWhatsapp.orders),
    };
  }, [data?.channels?.instagram, revenueValue, ordersValue, messagesValue, channelsWhatsapp]);

  // ─── AI Health Card Data ───────────────────────────────────────────────────
  const autoRepliesCount = data?.autoReplies && data.autoReplies > 0 ? data.autoReplies : 320;
  const escalationsCount = data?.escalations && data.escalations > 0 ? data.escalations : 20;
  const openEscalationsCount = openEscalations.data?.length ?? 20;

  const oldestEscalationWaiting = useMemo(() => {
    if (openEscalations.data && openEscalations.data.length > 0) {
      const sorted = [...openEscalations.data].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const oldest = sorted[0];
      if (oldest?.createdAt) {
        const diffSeconds = Math.max(60, dayjs().diff(dayjs(oldest.createdAt), "second"));
        return formatDuration(diffSeconds);
      }
    }
    if (!data) return "3h";
    return null;
  }, [openEscalations.data, data]);

  const avgResolveText = useMemo(() => {
    if (data?.avgResponseTimeSeconds && data.avgResponseTimeSeconds > 0) {
      return formatDuration(data.avgResponseTimeSeconds);
    }
    if (!data) return "1h 24m";
    return null;
  }, [data?.avgResponseTimeSeconds, data]);

  const escalationReasonsList = useMemo(() => {
    const entries = Object.entries(data?.byReason ?? {})
      .map(([reason, count]) => ({ reason, count: count ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    const total = entries.reduce((acc, cur) => acc + cur.count, 0);
    if (entries.length > 0 && total > 0) {
      return entries.map((e) => ({
        reason: escalationReasonLabel(e.reason),
        percentage: Math.round((e.count / total) * 100),
        count: e.count,
      }));
    }
    return sample.aiPerformance.escalationReasons.slice(0, 5);
  }, [data?.byReason, sample.aiPerformance.escalationReasons]);

  // ─── Top Products Data (All products sold in period) ───────────────────────
  const topProductsList = useMemo(() => {
    if (data?.topProducts && data.topProducts.length > 0) {
      return data.topProducts;
    }
    return sample.topProducts;
  }, [data?.topProducts, sample.topProducts]);

  // ─── Export Handler (CSV of what's on screen) ──────────────────────────────
  const handleExport = () => {
    const filename = `analytics_${dayjs(range.from).format("YYYY-MM-DD")}_to_${dayjs(range.to).format("YYYY-MM-DD")}.csv`;
    const rows: Array<Array<string | number>> = [
      ["Analytics Report (Screen Export)", ""],
      ["Date Range", `${dayjs(range.from).format("YYYY-MM-DD")} to ${dayjs(range.to).format("YYYY-MM-DD")}`],
      ["Channel Filter", activeChannel.toUpperCase()],
      [],
      ["Key Metrics", "Value"],
      ["Revenue (₹)", revenueValue],
      ["Orders Confirmed", ordersValue],
      ["Messages Total", messagesValue],
      ["AI Reply Rate", `${autoReplyRateValue}%`],
      ["Avg Response Time", avgResponseValue],
      ["Open Escalations", escalationsValue],
      [],
      ["Channel Breakdown", "Messages", "Revenue (₹)", "Orders"],
      ["WhatsApp", channelsWhatsapp.messages, channelsWhatsapp.revenue, channelsWhatsapp.orders],
      ["Instagram", channelsInstagram.messages, channelsInstagram.revenue, channelsInstagram.orders],
      [],
      ["AI Performance", "Count / Rate"],
      ["Auto-Replies", autoRepliesCount],
      ["Escalations", escalationsCount],
      [],
      ["Escalation Reasons", "Share %"],
      ...escalationReasonsList.map((r) => [r.reason, `${r.percentage}%`]),
      [],
      ["Top Products", "Units Sold", "Revenue (₹)"],
      ...topProductsList.map((p) => [p.name, p.units, p.revenue]),
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
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-medium hover:bg-amber-600 transition-colors shadow-2xs active:scale-95 cursor-pointer"
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
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-11 font-medium hover:bg-amber-600 transition-colors cursor-pointer"
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
          value={revenueValue}
          prefix="₹"
          trend={revenueTrend}
          color="amber"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          tag={!data?.revenue ? <SampleDataBadge /> : undefined}
        />

        <StatCard
          label="Orders"
          value={ordersValue}
          trend={ordersTrend}
          color="blue"
          icon={<Package className="w-3.5 h-3.5" />}
          onClick={() => navigate("/orders")}
          tag={!data?.orders ? <SampleDataBadge /> : undefined}
        />

        <StatCard
          label="Messages"
          value={messagesValue}
          trend={messagesTrend}
          color="teal"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          onClick={() => navigate("/inbox")}
          tag={!data?.messages ? <SampleDataBadge /> : undefined}
        />

        <StatCard
          label="AI Reply Rate"
          value={autoReplyRateValue}
          suffix="%"
          radialProgress={autoReplyRateValue}
          trend={autoReplyTrend}
          color="violet"
          icon={<Bot className="w-3.5 h-3.5" />}
          tag={data?.autoReplyRate === undefined ? <SampleDataBadge /> : undefined}
        />

        <StatCard
          label="Avg Response"
          value={avgResponseValue}
          trend={avgResponseTrend}
          color="emerald"
          icon={<Clock className="w-3.5 h-3.5" />}
          tag={data?.avgResponseTimeSeconds === undefined ? <SampleDataBadge /> : undefined}
        />

        <StatCard
          label="Escalations"
          value={escalationsValue}
          color="danger"
          pulsingDot={escalationsValue > 0}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          onClick={() => navigate("/escalations")}
          tag={openEscalations.data === undefined && !data?.attention ? <SampleDataBadge /> : undefined}
        />
      </div>

      {/* ─── Row 2: 3 Equal Cards (Chart · Channels · AI Health) ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 [@media(min-width:1024px)_and_(min-height:760px)]:flex-[50] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
        <div className="min-w-0 flex flex-col min-h-[300px] md:col-span-2 lg:col-span-1 [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <MainChartCard
            revenueData={revenueDailyData}
            messagesData={messagesDailyData}
            isSampleRevenue={!data?.revenue?.daily}
            isSampleMessages={!data?.messagesDaily}
          />
        </div>

        <div className="min-w-0 flex flex-col [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <ChannelsCard
            whatsapp={channelsWhatsapp}
            instagram={channelsInstagram}
            isSample={!data?.channels}
          />
        </div>

        <div className="min-w-0 flex flex-col [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <AiHealthCard
            autoReplyRate={autoReplyRateValue}
            autoRepliesCount={autoRepliesCount}
            escalationsCount={escalationsCount}
            topReasons={escalationReasonsList}
            openEscalationsCount={openEscalationsCount}
            oldestWaitingText={oldestEscalationWaiting}
            avgResolveText={avgResolveText}
            isSample={!data?.byReason || Object.keys(data.byReason).length === 0}
            trendVsPrev={
              data?.trends?.autoReplyRate?.changePct != null
                ? `${data.trends.autoReplyRate.changePct > 0 ? "↑" : "↓"}${Math.abs(data.trends.autoReplyRate.changePct)}% vs ${range.preset === "30d" ? "30d" : "7d"}`
                : "+3% vs 7d"
            }
            trendPositive={
              data?.trends?.autoReplyRate?.changePct != null
                ? (data.trends.autoReplyRate.changePct ?? 0) >= 0
                : true
            }
          />
        </div>
      </div>

      {/* ─── Row 3: 2 Cards (64% Top Products, 36% Recent Activity) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[64fr_36fr] gap-4 [@media(min-width:1024px)_and_(min-height:760px)]:flex-[50] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
        <div className="min-w-0 flex flex-col h-[400px] [@media(min-width:1024px)_and_(min-height:760px)]:h-auto [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <TopProductsCard
            products={topProductsList}
            isSample={!data?.topProducts}
          />
        </div>

        <div className="min-w-0 flex flex-col h-[400px] lg:h-auto lg:[contain:size] [@media(min-width:1024px)_and_(min-height:760px)]:min-h-0">
          <RecentActivityCard />
        </div>
      </div>
    </div>
  );
}
