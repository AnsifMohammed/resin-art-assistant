import { useMemo, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Clock,
  MessagesSquare,
  Percent,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { AnalyticsCard } from "../components/admin/AnalyticsCard.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { PageSpinner, Spinner } from "../components/ui/Spinner.tsx";
import { useAnalytics } from "../hooks/useAnalytics.ts";
import { cn } from "../lib/cn.ts";
import { formatDuration, formatPercent, humanize } from "../lib/format.ts";
import type { AnalyticsResponse } from "../types/index.ts";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

function rangeFor(preset: PresetId): { from: string; to: string } {
  const now = dayjs();
  const from =
    preset === "today" ? now.startOf("day") : now.subtract(preset === "7d" ? 6 : 29, "day").startOf("day");
  return { from: from.toISOString(), to: now.toISOString() };
}

const nf = new Intl.NumberFormat("en-IN");
const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? nf.format(n) : "0");

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm", className)}>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

/** Horizontal CSS bars: label, bar, value. */
function BarList({ rows, colorClass = "bg-red-400" }: { rows: Array<{ label: string; value: number }>; colorClass?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-gray-600" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            <span className={cn("block h-full rounded-full", colorClass)} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-8 text-right font-medium tabular-nums text-gray-900">{num(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function ChannelBreakdown({ byChannel }: { byChannel: NonNullable<AnalyticsResponse["byChannel"]> }) {
  const rows = (["whatsapp", "instagram"] as const).map((k) => ({
    key: k,
    label: k === "whatsapp" ? "WhatsApp" : "Instagram",
    inbound: byChannel[k]?.inbound ?? 0,
    outbound: byChannel[k]?.outbound ?? 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.inbound + r.outbound));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{r.label}</span>
            <span className="tabular-nums text-gray-900">
              {num(r.inbound)} in · {num(r.outbound)} out
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
            <span className="h-full bg-sky-500" style={{ width: `${(r.inbound / max) * 100}%` }} />
            <span className="h-full bg-emerald-500" style={{ width: `${(r.outbound / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <Legend items={[{ label: "Inbound", className: "bg-sky-500" }, { label: "Outbound", className: "bg-emerald-500" }]} />
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; className: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", i.className)} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Plain SVG grouped columns per day (inbound / auto-replies / escalations). */
function DailyChart({ daily }: { daily: NonNullable<AnalyticsResponse["daily"]> }) {
  const H = 120;
  const max = Math.max(1, ...daily.flatMap((d) => [d.inbound, d.autoReplies, d.escalations]));
  const groupW = 24;
  const barW = 6;
  const W = Math.max(daily.length * groupW, 1);
  const series = [
    { key: "inbound", fill: "fill-sky-500" },
    { key: "autoReplies", fill: "fill-emerald-500" },
    { key: "escalations", fill: "fill-red-400" },
  ] as const;
  const labelEvery = Math.ceil(daily.length / 7);
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="Daily activity">
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-gray-200" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {daily.map((d, i) => (
          <g key={d.date} transform={`translate(${i * groupW + 3},0)`}>
            <title>{`${dayjs(d.date).format("D MMM")}: ${d.inbound} inbound, ${d.autoReplies} auto-replies, ${d.escalations} escalations`}</title>
            {series.map((s, j) => {
              const h = (d[s.key] / max) * (H - 4);
              return <rect key={s.key} x={j * barW} y={H - h} width={barW - 1} height={h} rx={1} className={s.fill} />;
            })}
          </g>
        ))}
      </svg>
      {/* Labels in HTML: the SVG stretches horizontally, which would distort text. */}
      <div className="flex text-[10px] text-gray-400" aria-hidden>
        {daily.map((d, i) => (
          <span key={d.date} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? dayjs(d.date).format("D/M") : ""}
          </span>
        ))}
      </div>
      <Legend
        items={[
          { label: "Inbound", className: "bg-sky-500" },
          { label: "Auto-replies", className: "bg-emerald-500" },
          { label: "Escalations", className: "bg-red-400" },
        ]}
      />
    </div>
  );
}

export default function Analytics() {
  usePageTitle("Analytics");
  const [preset, setPreset] = useState<PresetId>("7d");
  const [tick, setTick] = useState(0);
  // Stable per selection so the query key doesn't change on every render.
  // `tick` forces a fresh "now" when Refresh is pressed.
  const range = useMemo(() => (void tick, rangeFor(preset)), [preset, tick]);
  const analytics = useAnalytics(range);
  const d = analytics.data;

  const reasonRows = useMemo(
    () =>
      Object.entries(d?.byReason ?? {})
        .map(([reason, value]) => ({ label: humanize(reason), value: value ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [d?.byReason],
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            aria-pressed={preset === p.id}
            className={cn(
              "h-10 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
              preset === p.id ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {analytics.isFetching && !analytics.isPending && <Spinner size="sm" label="Refreshing" />}
        <Button variant="ghost" size="icon" onClick={() => setTick((t) => t + 1)} aria-label="Refresh" title="Refresh">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );

  let body;
  if (analytics.isPending) body = <PageSpinner label="Loading analytics" />;
  else if (analytics.isError && !d)
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load analytics"
        description={analytics.error.message}
        action={
          <Button variant="outline" onClick={() => void analytics.refetch()}>
            Try again
          </Button>
        }
      />
    );
  else if (d) {
    const noData = (d.messages?.total ?? 0) === 0 && (d.escalations ?? 0) === 0;
    body = (
      <div className={cn("space-y-4 transition-opacity", analytics.isPlaceholderData && "opacity-60")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AnalyticsCard label="Total messages" value={num(d.messages?.total)} icon={MessagesSquare} />
          <AnalyticsCard
            label="Inbound"
            value={num(d.messages?.inbound)}
            sublabel="From customers"
            icon={ArrowDownLeft}
          />
          <AnalyticsCard
            label="Outbound"
            value={num(d.messages?.outbound)}
            sublabel="AI + human replies"
            icon={ArrowUpRight}
          />
          <AnalyticsCard label="Auto-replies" value={num(d.autoReplies)} icon={Bot} tone="good" />
          <AnalyticsCard
            label="Auto-reply rate"
            value={formatPercent(d.messages?.inbound ? d.autoReplyRate : null)}
            sublabel="Of inbound messages"
            icon={Percent}
            tone="good"
          />
          <AnalyticsCard label="Escalations" value={num(d.escalations)} icon={ShieldAlert} tone="warn" />
          <AnalyticsCard
            label="Escalation rate"
            value={formatPercent(d.messages?.inbound ? d.escalationRate : null)}
            sublabel="Of inbound messages"
            icon={Percent}
            tone="warn"
          />
          <AnalyticsCard
            label="Avg response time"
            value={formatDuration(d.avgResponseTimeSeconds)}
            sublabel={d.avgResponseTimeSeconds == null ? "No data yet" : "Customer message to reply"}
            icon={Clock}
          />
          {d.avgHumanResponseTimeSeconds !== undefined && (
            <AnalyticsCard
              label="Avg human response"
              value={formatDuration(d.avgHumanResponseTimeSeconds)}
              sublabel="Escalation to first human reply"
              icon={UserRound}
            />
          )}
        </div>

        {noData ? (
          <EmptyState
            title="No activity in this period"
            description="Try a longer range, or send a test message from the simulator."
            className="rounded-xl border border-dashed border-gray-300 bg-white py-10"
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {d.daily && d.daily.length > 0 && (
              <Panel title="Daily activity" className="lg:col-span-2">
                <DailyChart daily={d.daily} />
              </Panel>
            )}
            <Panel title="Escalations by reason">
              {reasonRows.length > 0 ? (
                <BarList rows={reasonRows} />
              ) : (
                <p className="text-sm text-gray-500">No escalations in this period.</p>
              )}
            </Panel>
            {d.byChannel && (
              <Panel title="Messages by channel">
                <ChannelBreakdown byChannel={d.byChannel} />
              </Panel>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
      {header}
      {body}
    </div>
  );
}
