import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Download,
  Calendar,
  ArrowRight,
  Bot,
  UserCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
  Layers,
  ChevronRight,
  X,
  PauseCircle,
  PlayCircle,
  BookOpen,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext.tsx";
import { useTheme } from "../context/ThemeContext.tsx";
import { brandChannels } from "../theme/index.ts";
import { StatCard } from "../components/shared/StatCard.tsx";
import { SegmentedControl } from "../components/shared/SegmentedControl.tsx";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import { useAnalytics } from "../hooks/useAnalytics.ts";
import { useAuditLog } from "../hooks/useAuditLog.ts";
import { useEscalations } from "../hooks/useEscalations.ts";
import { useSocket } from "../hooks/useSocket.ts";
import { escalationReasonLabel } from "../lib/escalationReasons.ts";
import { formatDuration, formatRelative, humanize } from "../lib/format.ts";
import type { AnalyticsResponse, AuditLogEntry } from "../types/index.ts";
import {
  mockAnalyticsData,
  type DailyRevenuePoint,
  type MessageVolumePoint,
  type TopProductMetric,
} from "../data/mockData.ts";

// ─── Date ranges (GET /analytics?from&to) ────────────────────────────────────

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

// ─── Small view helpers ──────────────────────────────────────────────────────

const REASON_COLORS = [
  "#EF4444",
  "#F59E0B",
  "#8B5CF6",
  "#14B8A6",
  "#3B82F6",
  "#EC4899",
  "#64748B",
  "#84CC16",
];

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

function analyticsCsvRows(data: AnalyticsResponse): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ["Metric", "Value"],
    ["From", data.from],
    ["To", data.to],
    ["Messages (total)", data.messages.total],
    ["Messages inbound", data.messages.inbound],
    ["Messages outbound", data.messages.outbound],
    ["AI auto-replies", data.autoReplies],
    ["Escalations created", data.escalations],
    ["Auto-reply rate", `${Math.round(data.autoReplyRate * 100)}%`],
    ["Escalation rate", `${Math.round(data.escalationRate * 100)}%`],
    ["Avg escalation resolution (seconds)", data.avgResponseTimeSeconds ?? ""],
  ];
  if (data.byChannel) {
    for (const ch of ["whatsapp", "instagram"] as const) {
      rows.push([`${ch === "whatsapp" ? "WhatsApp" : "Instagram"} inbound`, data.byChannel[ch]?.inbound ?? 0]);
      rows.push([`${ch === "whatsapp" ? "WhatsApp" : "Instagram"} outbound`, data.byChannel[ch]?.outbound ?? 0]);
    }
  }
  for (const [reason, count] of Object.entries(data.byReason ?? {})) {
    rows.push([`Escalations: ${escalationReasonLabel(reason)}`, count ?? 0]);
  }
  return rows;
}

function actorLabel(entry: AuditLogEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.actorType === "ai") return "AI";
  if (entry.actorType === "system") return "System";
  return humanize(entry.actorType);
}

function detailString(entry: AuditLogEntry, key: string): string | undefined {
  const v = entry.details?.[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** Audit log row → activity feed item. */
function activityView(entry: AuditLogEntry): { icon: ReactNode; title: string; description: string } {
  const actor = actorLabel(entry);
  const reason = detailString(entry, "reason");
  const fallback = entry.conversationId ? `Conversation ${entry.conversationId.slice(0, 8)}` : "";
  switch (entry.action) {
    case "auto_reply_sent":
      return {
        icon: <Bot className="w-4 h-4 text-violet-500" />,
        title: "AI auto-replied",
        description: detailString(entry, "replyPreview") ?? detailString(entry, "intent") ?? fallback,
      };
    case "auto_reply_failed":
    case "reply_failed":
      return {
        icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
        title: entry.action === "auto_reply_failed" ? "AI auto-reply failed" : `Reply by ${actor} failed`,
        description: fallback,
      };
    case "escalation_created":
      return {
        icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
        title: "Escalated to a human",
        description: reason ? escalationReasonLabel(reason) : fallback,
      };
    case "escalation_reminded":
      return { icon: <Clock className="w-4 h-4 text-amber-500" />, title: "Escalation reminder sent", description: fallback };
    case "escalation_assigned":
    case "escalation_unassigned":
      return {
        icon: <UserCheck className="w-4 h-4 text-amber-500" />,
        title: entry.action === "escalation_assigned" ? `${actor} assigned an escalation` : `${actor} unassigned an escalation`,
        description: fallback,
      };
    case "reply_sent":
      return {
        icon: <UserCheck className="w-4 h-4 text-amber-500" />,
        title: `${actor} replied`,
        description: detailString(entry, "preview") ?? fallback,
      };
    case "conversation_resolved":
      return { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, title: `${actor} resolved a conversation`, description: fallback };
    case "state_changed": {
      const to = detailString(entry, "to") ?? detailString(entry, "toState");
      return {
        icon: <Clock className="w-4 h-4 text-blue-500" />,
        title: to ? `Conversation moved to ${humanize(to)}` : "Conversation state changed",
        description: fallback,
      };
    }
    case "automation_paused":
      return { icon: <PauseCircle className="w-4 h-4 text-rose-500" />, title: `${actor} paused AI automation`, description: "" };
    case "automation_resumed":
      return { icon: <PlayCircle className="w-4 h-4 text-emerald-500" />, title: `${actor} resumed AI automation`, description: "" };
    case "knowledge_base_updated":
      return { icon: <BookOpen className="w-4 h-4 text-blue-500" />, title: `${actor} updated the knowledge base`, description: "" };
    default:
      return { icon: <Layers className="w-4 h-4 text-text-muted" />, title: `${humanize(entry.action)} · ${actor}`, description: fallback };
  }
}

function SectionHeading({ title, sample }: { title: string; sample?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-16 font-semibold font-outfit text-text">{title}</h2>
      {sample && <SampleDataBadge />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { chartPalette } = useTheme();
  const socket = useSocket();

  const [range, setRange] = useState<DateRange>(() => presetRange("7d"));
  const [pickerPreset, setPickerPreset] = useState<RangePreset>("7d");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(() => dayjs().subtract(6, "day").format("YYYY-MM-DD"));
  const [customEndDate, setCustomEndDate] = useState(() => dayjs().format("YYYY-MM-DD"));

  // Real backend queries
  const analytics = useAnalytics({ from: range.from, to: range.to });
  const openEscalations = useEscalations();
  const activity = useAuditLog({ limit: 8 });

  const data = analytics.data;
  const kpiLoading = analytics.isPending || analytics.isPlaceholderData;

  // Selected channel from the TopBar ("all" | "whatsapp" | "instagram")
  const rawChannel = searchParams.get("channel");
  const activeChannel: "all" | "whatsapp" | "instagram" =
    rawChannel === "whatsapp" || rawChannel === "instagram" ? rawChannel : "all";

  // Sample data scoped by channel and date preset
  const sample = mockAnalyticsData[activeChannel][range.preset];

  const handleExport = () => {
    if (!data) return;
    const filename = `analytics_${dayjs(data.from).format("YYYY-MM-DD")}_to_${dayjs(data.to).format("YYYY-MM-DD")}.csv`;
    downloadCsv(filename, analyticsCsvRows(data));
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

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const rangeLabel =
    range.preset === "custom"
      ? `${dayjs(range.from).format("D MMM")} – ${dayjs(range.to).format("D MMM YYYY")}`
      : range.preset === "30d"
        ? "Last 30 days"
        : "Last 7 days";

  // Channel split stats
  const realWaCount = (data?.byChannel?.whatsapp?.inbound ?? 0) + (data?.byChannel?.whatsapp?.outbound ?? 0);
  const realIgCount = (data?.byChannel?.instagram?.inbound ?? 0) + (data?.byChannel?.instagram?.outbound ?? 0);
  const realChannelTotal = realWaCount + realIgCount;

  const waCount = realChannelTotal > 0 ? realWaCount : sample.channelSplit.whatsapp.count;
  const igCount = realChannelTotal > 0 ? realIgCount : sample.channelSplit.instagram.count;
  const channelTotal = waCount + igCount;
  const waPct = channelTotal > 0 ? Math.round((waCount / channelTotal) * 100) : sample.channelSplit.whatsapp.percentage;
  const igPct = 100 - waPct;

  // AI performance stats
  const autoPct = data ? Math.round(data.autoReplyRate * 100) : 0;
  const escPct = data ? Math.round(data.escalationRate * 100) : 0;
  const reasonEntries = Object.entries(data?.byReason ?? {})
    .map(([reason, count]) => ({ reason, count: count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const reasonTotal = reasonEntries.reduce((sum, r) => sum + r.count, 0);

  const effectiveAutoPct = autoPct > 0 ? autoPct : sample.aiPerformance.autoRepliedPercent;
  const effectiveEscPct = escPct > 0 ? escPct : sample.aiPerformance.escalatedPercent;
  const effectiveAutoReplies = data && data.autoReplies > 0 ? data.autoReplies : 320;
  const effectiveEscalations = data && data.escalations > 0 ? data.escalations : 90;

  const effectiveReasons = useMemo(() => {
    if (reasonEntries.length > 0) {
      return reasonEntries.map((r, idx) => ({
        reason: escalationReasonLabel(r.reason),
        percentage: Math.round((r.count / reasonTotal) * 100),
        color: REASON_COLORS[idx % REASON_COLORS.length] ?? "#EF4444",
      }));
    }
    return sample.aiPerformance.escalationReasons;
  }, [reasonEntries, reasonTotal, sample.aiPerformance.escalationReasons]);

  // Activity list combining real audit entries and sample activities
  const displayActivities = useMemo(() => {
    const list: Array<{
      id: string;
      icon: ReactNode;
      title: string;
      description?: string;
      time: string;
      onClick?: () => void;
    }> = [];

    if (activity.data?.entries && activity.data.entries.length > 0) {
      for (const entry of activity.data.entries) {
        const view = activityView(entry);
        list.push({
          id: entry.id,
          icon: view.icon,
          title: view.title,
          ...(view.description ? { description: view.description } : {}),
          time: formatRelative(entry.createdAt),
          ...(entry.conversationId
            ? {
                onClick: () => {
                  void navigate(`/inbox?c=${encodeURIComponent(entry.conversationId ?? "")}`);
                },
              }
            : {}),
        });
      }
    }

    if (list.length < 8) {
      for (const act of sample.recentActivity) {
        if (!list.some((it) => it.title === act.title)) {
          let icon = <Layers className="w-4 h-4 text-text-muted" />;
          if (act.type === "takeover") icon = <UserCheck className="w-4 h-4 text-amber-500" />;
          else if (act.type === "ai_reply") icon = <Bot className="w-4 h-4 text-violet-500" />;
          else if (act.type === "order") icon = <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
          else if (act.type === "escalation") icon = <AlertTriangle className="w-4 h-4 text-red-500" />;
          else if (act.type === "status_change") icon = <Clock className="w-4 h-4 text-blue-500" />;

          list.push({
            id: act.id,
            icon,
            title: act.title,
            description: act.description,
            time: act.time,
          });
        }
      }
    }

    return list;
  }, [activity.data?.entries, sample.recentActivity, navigate]);

  const openEscalationCount = openEscalations.data?.length;

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight">
              {greeting()}
              {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            {socket.connected && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-11 font-medium bg-primary/10 text-primary-text">
                <Sparkles className="w-3 h-3" /> Live
              </span>
            )}
          </div>
          <p className="text-13 text-text-muted mt-0.5">
            {formattedDate} · {rangeLabel}
            {activeChannel !== "all" && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded text-11 font-medium bg-surface-muted text-text uppercase">
                {activeChannel}
              </span>
            )}
          </p>
        </div>

        {/* Date Range Selector & Export Button */}
        <div className="flex items-center flex-wrap gap-2.5">
          <SegmentedControl
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "custom", label: "Custom" },
            ]}
            value={pickerPreset}
            onChange={(val) => {
              const v = val as RangePreset;
              setPickerPreset(v);
              if (v === "custom") {
                setShowCustomPicker(true);
              } else {
                setShowCustomPicker(false);
                setRange(presetRange(v));
              }
            }}
          />

          <button
            onClick={handleExport}
            disabled={!data || kpiLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-text text-13 font-medium transition-colors shadow-xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            title="Export analytics as CSV"
          >
            <Download className="w-3.5 h-3.5 text-text-muted" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ─── Custom Date Range Popover ────────────────────────────────────────── */}
      {showCustomPicker && (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-13 text-text-muted">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-medium text-text">Custom Date Filter:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              max={customEndDate || undefined}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 text-13 rounded-lg border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-text-muted text-12">to</span>
            <input
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 text-13 rounded-lg border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={applyCustomRange}
              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-12 font-medium hover:bg-amber-600 transition-colors cursor-pointer"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setShowCustomPicker(false);
                setPickerPreset(range.preset);
              }}
              className="p-1 rounded-lg hover:bg-surface-muted text-text-muted cursor-pointer"
              aria-label="Close custom date filter"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Error Notification ──────────────────────────────────────────────── */}
      {analytics.isError && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-danger/30 bg-danger/10 flex flex-wrap items-center justify-between gap-3 text-13"
        >
          <span className="flex items-center gap-2 font-medium text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Couldn't load real-time analytics: {analytics.error.message}
          </span>
          <button
            onClick={() => void analytics.refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-text text-12 font-medium cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ─── Section 1: KPI Grid (Equal Heights, Rich Sparklines & Trends) ───── */}
      {kpiLoading && !analytics.isError ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-stretch">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-surface space-y-3 h-[148px] flex flex-col justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-36" />
              <div className="pt-2 border-t border-border/40 flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-stretch">
          {/* 1. Total Revenue */}
          <StatCard
            label="Total revenue"
            prefix="₹"
            value={sample.kpis.revenue.value}
            tag={<SampleDataBadge />}
            trend={{
              value: sample.kpis.revenue.trend,
              isPositive: sample.kpis.revenue.isPositive,
              label: "vs prev. period",
            }}
            color="amber"
            onClick={() => navigate("/orders")}
          />

          {/* 2. Orders Confirmed */}
          <StatCard
            label="Orders confirmed"
            value={sample.kpis.orders.value}
            tag={<SampleDataBadge />}
            trend={{
              value: sample.kpis.orders.trend,
              isPositive: sample.kpis.orders.isPositive,
              label: "vs prev. period",
            }}
            color="emerald"
            onClick={() => navigate("/orders")}
          />

          {/* 3. Messages Today */}
          <StatCard
            label="Messages today"
            value={data && data.messages.total > 0 ? data.messages.total : sample.kpis.messages.value}
            tag={(!data || data.messages.total === 0) ? <SampleDataBadge /> : undefined}
            trend={{
              value: sample.kpis.messages.trend,
              isPositive: sample.kpis.messages.isPositive,
              label: "vs prev. period",
            }}
            color="blue"
            onClick={() => navigate("/inbox")}
          />

          {/* 4. Auto-reply Rate */}
          <StatCard
            label="Auto-reply rate"
            value={effectiveAutoPct}
            suffix="%"
            radialProgress={effectiveAutoPct}
            trend={{
              value: sample.kpis.autoReplyRate.trend,
              isPositive: sample.kpis.autoReplyRate.isPositive,
              label: "AI handling",
            }}
            color="violet"
          />

          {/* 5. Open Escalations */}
          <StatCard
            label="Open escalations"
            value={openEscalationCount && openEscalationCount > 0 ? openEscalationCount : sample.kpis.escalations.value}
            pulsingDot={(openEscalationCount ?? 0) > 0 || sample.kpis.escalations.pulsing}
            trend={{
              value: sample.kpis.escalations.trend,
              isPositive: sample.kpis.escalations.isPositive,
              label: "vs yesterday",
            }}
            color="danger"
            onClick={() => navigate("/escalations")}
          />

          {/* 6. Avg Response Time */}
          <StatCard
            label="Avg response time"
            value={data?.avgResponseTimeSeconds ? formatDuration(data.avgResponseTimeSeconds) : sample.kpis.avgResponse.value}
            trend={{
              value: sample.kpis.avgResponse.trend,
              isPositive: sample.kpis.avgResponse.isPositive,
              label: "faster",
            }}
            color="teal"
          />
        </div>
      )}

      {/* ─── Section 2: Charts Row (Standardized 380px Height & Aligned Baselines) ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {/* Daily Revenue Bar Chart */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col justify-between h-[380px]">
          <div className="h-[52px] shrink-0 mb-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-16 font-semibold font-outfit text-text">Daily revenue</h2>
                <SampleDataBadge />
              </div>
              <span className="text-12 text-text-muted shrink-0">Last 14 days</span>
            </div>
            <p className="text-12 text-text-muted truncate">
              Revenue per day in ₹ with order count on hover
            </p>
          </div>

          <div className="h-[210px] w-full shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sample.dailyRevenue}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-text-muted"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  tickFormatter={(v: number) => `₹${v >= 1000 ? `${v / 1000}k` : v}`}
                  className="text-text-muted"
                />
                <Tooltip
                  cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const point = payload[0].payload as DailyRevenuePoint;
                      return (
                        <div className="p-2.5 rounded-lg border border-border bg-surface shadow-lg text-12 backdrop-blur-md">
                          <p className="font-semibold text-text mb-0.5">{label}</p>
                          <p className="text-primary font-bold tabular-nums">
                            ₹{point.revenue.toLocaleString("en-IN")}
                          </p>
                          <p className="text-text-muted text-11 mt-0.5">
                            {point.orders} {point.orders === 1 ? "order" : "orders"}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill={chartPalette.primary}
                  radius={[4, 4, 0, 0]}
                  className="transition-opacity hover:opacity-85"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[46px] flex items-center justify-between pt-3 border-t border-border/40 text-12 shrink-0">
            <span className="text-text-muted">
              Total in period: <strong className="text-text tabular-nums font-semibold">₹48,500</strong>
            </span>
            <span className="text-11 text-text-muted">
              Avg daily: <strong className="text-text tabular-nums font-semibold">₹3,460</strong>
            </span>
          </div>
        </div>

        {/* Message Volume Area Chart */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col justify-between h-[380px]">
          <div className="h-[52px] shrink-0 mb-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-16 font-semibold font-outfit text-text">Message volume</h2>
                <SampleDataBadge />
              </div>
              <div className="flex items-center gap-3 text-11 font-medium shrink-0">
                <span className="flex items-center gap-1 text-amber-500">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Inbound
                </span>
                <span className="flex items-center gap-1 text-teal">
                  <span className="w-2 h-2 rounded-full bg-teal" /> Outbound
                </span>
              </div>
            </div>
            <p className="text-12 text-text-muted truncate">
              Daily customer queries vs AI and team replies
            </p>
          </div>

          <div className="h-[210px] w-full shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sample.messageVolume}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartPalette.primary} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartPalette.primary} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartPalette.teal} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartPalette.teal} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-text-muted"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  className="text-text-muted"
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const point = payload[0].payload as MessageVolumePoint;
                      return (
                        <div className="p-2.5 rounded-lg border border-border bg-surface shadow-lg text-12 backdrop-blur-md space-y-1">
                          <p className="font-semibold text-text">{label}</p>
                          <div className="flex items-center justify-between gap-4 text-amber-500 font-medium">
                            <span>Inbound:</span>
                            <span className="tabular-nums font-bold">{point.inbound}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-teal font-medium">
                            <span>Outbound:</span>
                            <span className="tabular-nums font-bold">{point.outbound}</span>
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
                  stroke={chartPalette.primary}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#inboundGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="outbound"
                  stroke={chartPalette.teal}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#outboundGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[46px] flex items-center justify-between pt-3 border-t border-border/40 text-12 shrink-0">
            <span className="text-text-muted">
              Total volume: <strong className="text-text tabular-nums font-semibold">410 msgs</strong>
            </span>
            <span className="text-11 text-text-muted">
              Ratio: <strong className="text-text tabular-nums font-semibold">1.1 : 1</strong>
            </span>
          </div>
        </div>

        {/* Channel Split Donut Chart */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col justify-between h-[380px]">
          <div className="h-[52px] shrink-0 mb-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-16 font-semibold font-outfit text-text">Channel split</h2>
                <SampleDataBadge />
              </div>
              <span className="text-12 text-text-muted shrink-0">By message share</span>
            </div>
            <p className="text-12 text-text-muted truncate">
              Share of messages across WhatsApp & Instagram
            </p>
          </div>

          <div className="h-[210px] w-full shrink-0 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "WhatsApp", value: waCount, pct: waPct },
                    { name: "Instagram", value: igCount, pct: igPct },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                >
                  <Cell fill={brandChannels.whatsapp} />
                  <Cell fill={brandChannels.instagram} />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const slice = payload[0];
                      const pct = (slice.payload as { pct?: number } | undefined)?.pct ?? 0;
                      return (
                        <div className="p-2 rounded-lg border border-border bg-surface shadow-md text-12 font-medium">
                          <span>{slice.name}: </span>
                          <span className="font-bold tabular-nums">
                            {Number(slice.value).toLocaleString("en-IN")} ({pct}%)
                          </span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Centre Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-22 font-bold font-outfit text-text tabular-nums">{waPct}%</span>
              <span className="text-10 uppercase tracking-wider text-text-muted font-medium">WhatsApp</span>
            </div>
          </div>

          {/* Donut Legend Aligned with sibling footers */}
          <div className="h-[46px] flex items-center justify-between pt-3 border-t border-border/40 text-12 shrink-0">
            <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <ChannelIcon channel="whatsapp" size={13} />
              <span>
                WhatsApp: <strong className="text-text tabular-nums font-semibold">{waCount.toLocaleString("en-IN")}</strong> ({waPct}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-pink-600 dark:text-pink-400">
              <ChannelIcon channel="instagram" size={13} />
              <span>
                Instagram: <strong className="text-text tabular-nums font-semibold">{igCount.toLocaleString("en-IN")}</strong> ({igPct}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 3: Bottom 2×2 Grid (All 4 Cards Matched to 390px with Inside Scroll) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Card 1: Revenue by Channel */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col justify-between h-[390px]">
          <div className="h-[44px] shrink-0 mb-3 flex items-center justify-between">
            <SectionHeading title="Revenue by channel" sample />
            <span className="text-12 text-text-muted shrink-0">Proportion split</span>
          </div>

          <div className="flex-1 flex flex-col justify-between min-h-0 space-y-3">
            {/* Stat Cards Pair */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="p-3.5 rounded-lg border border-border/60 bg-surface-muted">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <ChannelIcon channel="whatsapp" size={14} />
                    <span className="text-12 text-text-muted font-medium">WhatsApp</span>
                  </div>
                  <span className="text-11 font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {sample.channelSplit.whatsapp.percentage}%
                  </span>
                </div>
                <p className="text-22 font-bold font-outfit text-text tabular-nums">
                  ₹{sample.channelSplit.whatsapp.revenue.toLocaleString("en-IN")}
                </p>
                <p className="text-11 text-text-muted mt-0.5">
                  {sample.channelSplit.whatsapp.orders} orders · ₹2,111 avg
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-border/60 bg-surface-muted">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <ChannelIcon channel="instagram" size={14} />
                    <span className="text-12 text-text-muted font-medium">Instagram</span>
                  </div>
                  <span className="text-11 font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    {sample.channelSplit.instagram.percentage}%
                  </span>
                </div>
                <p className="text-22 font-bold font-outfit text-text tabular-nums">
                  ₹{sample.channelSplit.instagram.revenue.toLocaleString("en-IN")}
                </p>
                <p className="text-11 text-text-muted mt-0.5">
                  {sample.channelSplit.instagram.orders} orders · ₹2,100 avg
                </p>
              </div>
            </div>

            {/* Proportion Bar */}
            <div className="space-y-1.5 shrink-0">
              <div className="h-3.5 w-full bg-border/40 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${sample.channelSplit.whatsapp.percentage}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`WhatsApp: ${sample.channelSplit.whatsapp.percentage}%`}
                />
                <div
                  style={{ width: `${sample.channelSplit.instagram.percentage}%` }}
                  className="bg-amber-500 h-full transition-all duration-500"
                  title={`Instagram: ${sample.channelSplit.instagram.percentage}%`}
                />
              </div>
              <div className="flex justify-between text-11 text-text-muted font-medium">
                <span>WhatsApp ({sample.channelSplit.whatsapp.percentage}%)</span>
                <span>Instagram ({sample.channelSplit.instagram.percentage}%)</span>
              </div>
            </div>

            {/* Channel Insights Footer */}
            <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/50 text-12 text-text-muted flex items-center justify-between shrink-0">
              <span className="inline-flex items-center gap-1 text-text font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-primary" /> Key Channel Trend:
              </span>
              <span>WhatsApp leads repeat conversions (92%)</span>
            </div>
          </div>
        </div>

        {/* Card 2: AI Performance */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col justify-between h-[390px]">
          <div className="h-[44px] shrink-0 mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-16 font-semibold font-outfit text-text">
                  AI performance
                </h2>
                <SampleDataBadge />
              </div>
              <p className="text-11 text-text-muted">
                Auto-replied vs escalated inbound inquiries
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Bot className="w-3.5 h-3.5" /> {effectiveAutoPct}% automation
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-between min-h-0 space-y-3">
            {/* Stacked Horizontal Bar */}
            <div className="space-y-2 shrink-0">
              <div className="flex justify-between text-12 font-medium">
                <span className="text-emerald-600 dark:text-emerald-400">
                  Auto-replied {effectiveAutoPct}% ({effectiveAutoReplies})
                </span>
                <span className="text-danger">
                  Escalated {effectiveEscPct}% ({effectiveEscalations})
                </span>
              </div>
              <div className="h-3.5 w-full bg-border/40 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${Math.min(100, effectiveAutoPct)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title="Auto-replied"
                />
                <div
                  style={{ width: `${Math.max(0, Math.min(100 - Math.min(100, effectiveAutoPct), effectiveEscPct))}%` }}
                  className="bg-red-500 h-full transition-all duration-500"
                  title="Escalated to human"
                />
              </div>
            </div>

            {/* Escalation Reasons Breakdown */}
            <div className="pt-2 border-t border-border/40 shrink-0">
              <p className="text-12 font-medium text-text mb-2">
                Escalation reasons breakdown:
              </p>
              <div className="flex flex-wrap gap-2">
                {effectiveReasons.map((r) => (
                  <span
                    key={r.reason}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-11 font-medium bg-surface-muted border border-border/60 text-text"
                    title={`${r.reason}: ${r.percentage}%`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    <span>{r.reason}</span>
                    <span className="text-text-muted tabular-nums">
                      {r.percentage}%
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Automation Summary note */}
            <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/50 text-12 text-text-muted flex items-center justify-between shrink-0">
              <span className="inline-flex items-center gap-1 text-text font-medium">
                <Bot className="w-3.5 h-3.5 text-violet-500" /> Resolution Health:
              </span>
              <span>Routine orders resolved without human intervention</span>
            </div>
          </div>
        </div>

        {/* Card 3: Top Products with inside scroll */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col h-[390px]">
          <div className="h-[44px] shrink-0 mb-3 flex items-center justify-between">
            <div>
              <SectionHeading title="Top products" sample />
              <p className="text-11 text-text-muted">Ranked by revenue generation</p>
            </div>
            <button
              onClick={() => navigate("/catalogue")}
              className="text-12 font-medium text-primary-text hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              Catalogue <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-2.5 custom-scrollbar">
            {sample.topProducts.map((p: TopProductMetric, idx: number) => (
              <div
                key={p.name}
                className="p-3 rounded-lg border border-border/50 bg-surface-muted/50 hover:bg-surface-muted transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-12 font-bold font-outfit text-text-muted w-4">
                    #{idx + 1}
                  </span>
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-13 font-semibold text-text truncate">
                      {p.name}
                    </p>
                    <p className="text-11 text-text-muted">
                      {p.units} units · {p.leadTime} lead
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-13 font-bold font-outfit text-text tabular-nums">
                    ₹{p.revenue.toLocaleString("en-IN")}
                  </p>
                  <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden mt-1 ml-auto">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${p.sharePercent * 2.5}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: Recent Activity with inside scroll */}
        <div className="p-5 rounded-xl border border-border bg-surface flex flex-col h-[390px]">
          <div className="h-[44px] shrink-0 mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-16 font-semibold font-outfit text-text">
                Recent activity
              </h2>
              <p className="text-11 text-text-muted">Latest actions by the AI and your team</p>
            </div>
            <button
              onClick={() => navigate("/audit-log")}
              className="text-12 font-medium text-primary-text hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              View audit log <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1.5 space-y-2.5 custom-scrollbar">
            {activity.isPending ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5">
                  <Skeleton className="h-7 w-7 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))
            ) : activity.isError ? (
              <p className="text-12 text-danger">Couldn't load recent activity.</p>
            ) : displayActivities.length === 0 ? (
              <p className="text-12 text-text-muted">No activity yet.</p>
            ) : (
              displayActivities.map((item) => (
                <div
                  key={item.id}
                  onClick={item.onClick}
                  role={item.onClick ? "button" : undefined}
                  tabIndex={item.onClick ? 0 : undefined}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border border-transparent hover:border-border/60 hover:bg-surface-muted transition-colors ${
                    item.onClick ? "cursor-pointer" : ""
                  }`}
                >
                  <div className="p-1.5 rounded-md bg-surface-muted border border-border shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-13 font-medium text-text leading-snug">{item.title}</p>
                    {item.description && (
                      <p className="text-11 text-text-muted truncate mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <span className="text-11 text-text-muted shrink-0 tabular-nums">
                    {item.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
