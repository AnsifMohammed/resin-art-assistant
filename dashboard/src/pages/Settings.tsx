import { useMemo, useState, type ComponentType } from "react";
import dayjs from "dayjs";
import {
  Bot,
  MessageCircle,
  Clock,
  Bell,
  BarChart3,
  Palette,
  CheckCircle2,
  AlertTriangle,
  Download,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "../context/ThemeContext.tsx";
import { InstagramIcon } from "../components/shared/InstagramIcon.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { usePause, useSettings, useUpdateSettings } from "../hooks/useSettings.ts";
import { useAnalytics } from "../hooks/useAnalytics.ts";
import { ApiError } from "../api/client.ts";
import { formatDateTime, humanize } from "../lib/format.ts";
import type {
  AnalyticsResponse,
  AwayMessageSettings,
  BusinessHoursSettings,
  ChannelStatus,
  ChannelType,
  SettingsPatchRequest,
  SettingsResponse,
  Weekday,
  WindowAlertSettings,
  WindowAlertThresholdMinutes,
} from "../types/index.ts";

type SettingsSection =
  | "automation"
  | "whatsapp"
  | "instagram"
  | "hours"
  | "window"
  | "stats"
  | "appearance";

// ─── Form state (business hours, away message, window alerts) ─────────────────

interface SettingsForm {
  businessHours: BusinessHoursSettings;
  awayMessage: AwayMessageSettings;
  windowAlerts: WindowAlertSettings;
}

type FormKey = keyof SettingsForm;
const FORM_KEYS: FormKey[] = ["businessHours", "awayMessage", "windowAlerts"];

const WEEK: Array<{ key: Weekday; label: string }> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

/** Form values used only when the API response has no value for a section yet. */
const FORM_DEFAULTS: SettingsForm = {
  businessHours: { enabled: false, open: "09:00", close: "21:00", days: ["mon", "tue", "wed", "thu", "fri", "sat"] },
  awayMessage: { enabled: false, text: "" },
  windowAlerts: { enabled: false, thresholdMinutes: 120, target: "push" },
};

function formFrom(settings: SettingsResponse | undefined): SettingsForm {
  return {
    businessHours: settings?.businessHours ?? FORM_DEFAULTS.businessHours,
    awayMessage: settings?.awayMessage ?? FORM_DEFAULTS.awayMessage,
    windowAlerts: settings?.windowAlerts ?? FORM_DEFAULTS.windowAlerts,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const THRESHOLD_OPTIONS: Array<{ value: WindowAlertThresholdMinutes; label: string }> = [
  { value: 60, label: "1 hour remaining (Urgent)" },
  { value: 120, label: "2 hours remaining (Standard)" },
  { value: 240, label: "4 hours remaining (Early warning)" },
];

// ─── Channels ─────────────────────────────────────────────────────────────────

/** "Expires in 12 days" / "Expired" from tokenExpiresAt. */
function tokenExpiry(iso: string | null): { text: string; className: string; title?: string } {
  if (!iso) return { text: "No expiry set", className: "text-text-muted" };
  const ms = dayjs(iso).diff(dayjs());
  const title = formatDateTime(iso);
  if (ms <= 0) return { text: "Expired", className: "text-red-600 dark:text-red-400", title };
  const days = Math.ceil(ms / 86_400_000);
  const text = days === 1 ? "Expires in 1 day" : `Expires in ${days} days`;
  const className = days <= 7 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
  return { text, className, title };
}

interface ChannelPanelProps {
  type: ChannelType;
  channel: ChannelStatus | undefined;
  loading: boolean;
}

function ChannelPanel({ type, channel, loading }: ChannelPanelProps) {
  const isWa = type === "whatsapp";
  const Icon: ComponentType<{ className?: string }> = isWa ? MessageCircle : InstagramIcon;
  const title = isWa ? "WhatsApp Business Cloud" : "Instagram Messaging";
  const idLabel = isWa ? "Phone number ID" : "Account ID";
  const connected = Boolean(channel);
  const active = channel?.status === "active";
  const expiry = channel ? tokenExpiry(channel.tokenExpiresAt) : null;

  return (
    <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl ${
              !connected
                ? "bg-surface-muted text-text-muted"
                : isWa
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-pink-500/10 text-pink-600 dark:text-pink-400"
            }`}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-18 font-bold font-outfit text-text">{title}</h2>
            <p className="text-12 text-text-muted truncate">
              {loading ? "Loading…" : channel ? channel.identifier : "Not connected"}
            </p>
          </div>
        </div>
        {!loading &&
          (!connected ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-surface-muted text-text-muted border border-border">
              Not connected
            </span>
          ) : active ? (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Connected
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-11 font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {humanize(channel?.status ?? "")}
            </span>
          ))}
      </div>

      {channel ? (
        <div className="space-y-3 text-13">
          <div className="flex justify-between gap-3 py-2 border-b border-border/40">
            <span className="text-text-muted">{idLabel}:</span>
            <span className="font-semibold text-text tabular-nums truncate">{channel.identifier}</span>
          </div>
          <div className="flex justify-between gap-3 py-2 border-b border-border/40">
            <span className="text-text-muted">Status:</span>
            <span className="font-semibold text-text">{humanize(channel.status)}</span>
          </div>
          <div className="flex justify-between gap-3 py-2">
            <span className="text-text-muted">Access token:</span>
            <span className={`font-semibold ${expiry?.className ?? ""}`} title={expiry?.title}>
              {expiry?.text}
            </span>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="p-4 rounded-xl border border-dashed border-border bg-surface-muted/50 text-13 text-text-muted">
            {isWa
              ? "No WhatsApp number is connected to this business yet. Incoming WhatsApp messages will appear here once it is."
              : "No Instagram account is connected to this business yet. Instagram DMs will appear here once it is."}
          </div>
        )
      )}
    </div>
  );
}

// ─── Message statistics ───────────────────────────────────────────────────────

interface StatRow {
  type: string;
  get: (d: AnalyticsResponse) => number | null;
}

const STAT_ROWS: StatRow[] = [
  { type: "Inbound Messages", get: (d) => d.messages.inbound },
  { type: "AI Auto-Replies", get: (d) => d.repliesBySender?.ai ?? null },
  { type: "Staff Replies", get: (d) => d.repliesBySender?.staff ?? null },
  { type: "Admin Replies", get: (d) => d.repliesBySender?.owner ?? null },
  { type: "Failed", get: (d) => d.delivery?.failed ?? null },
  { type: "Read Receipts", get: (d) => d.delivery?.read ?? null },
];

/** Today / this week (Mon start) / this month, computed once so query keys stay stable. */
function statRanges() {
  const now = dayjs();
  const to = now.toISOString();
  const weekStart = now.subtract((now.day() + 6) % 7, "day").startOf("day");
  return {
    today: { from: now.startOf("day").toISOString(), to },
    week: { from: weekStart.toISOString(), to },
    month: { from: now.startOf("month").toISOString(), to },
  };
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

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className={`relative inline-flex items-center shrink-0 ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-border peer-focus-visible:ring-2 peer-focus-visible:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  );
}

/** Inline validation message for a PATCH /settings field (400 details path). */
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-11 font-medium text-red-600 dark:text-red-400">{message}</p>;
}

/** Section that owns a validation path like "businessHours.close". */
const SECTION_FOR_KEY: Record<FormKey, SettingsSection> = {
  businessHours: "hours",
  awayMessage: "hours",
  windowAlerts: "window",
};

function SendingNote() {
  return (
    <p className="flex items-start gap-1.5 text-11 text-text-muted">
      <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
      <span>Saved now — automatic sending starts when WhatsApp is connected.</span>
    </p>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { theme, setTheme } = useTheme();

  const [activeSection, setActiveSection] = useState<SettingsSection>("automation");

  // GET /settings + mutations
  const settings = useSettings();
  const pause = usePause();
  const save = useUpdateSettings();
  const paused = settings.data?.paused;
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);

  // Editable sections: the draft starts from the server values; null = untouched.
  const baseline = useMemo(() => formFrom(settings.data), [settings.data]);
  const [draft, setDraft] = useState<SettingsForm | null>(null);
  const form = draft ?? baseline;
  const changedKeys = FORM_KEYS.filter((k) => !sameValue(form[k], baseline[k]));
  const dirty = changedKeys.length > 0;
  const formDisabled = !settings.data || save.isPending;

  // 400 validation errors from PATCH /settings, keyed by path ("businessHours.close").
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Error for a path or any of its children ("businessHours" also matches "businessHours.days.0"). */
  const fieldError = (path: string): string | undefined =>
    fieldErrors[path] ??
    Object.entries(fieldErrors).find(([p]) => p.startsWith(`${path}.`))?.[1];

  const updateForm = <K extends FormKey>(key: K, value: SettingsForm[K]) => {
    setDraft((prev) => ({ ...(prev ?? baseline), [key]: value }));
    // Editing a section clears its validation errors.
    setFieldErrors((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([p]) => p !== key && !p.startsWith(`${key}.`)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  };

  // Message statistics (3 real analytics queries)
  const [ranges] = useState(statRanges);
  const statsToday = useAnalytics(ranges.today);
  const statsWeek = useAnalytics(ranges.week);
  const statsMonth = useAnalytics(ranges.month);
  const statColumns = [statsToday, statsWeek, statsMonth];

  // Appearance: display preference for this browser session only (not saved to the server)
  const [compactDensity, setCompactDensity] = useState(false);

  const waChannel = settings.data?.channels.find((c) => c.type === "whatsapp");
  const igChannel = settings.data?.channels.find((c) => c.type === "instagram");

  const toggleDay = (day: Weekday) => {
    const days = form.businessHours.days;
    if (days.includes(day)) {
      if (days.length <= 1) return; // keep at least one working day
      updateForm("businessHours", { ...form.businessHours, days: days.filter((d) => d !== day) });
    } else {
      const next = WEEK.map((w) => w.key).filter((k) => k === day || days.includes(k));
      updateForm("businessHours", { ...form.businessHours, days: next });
    }
  };

  const handleSaveSettings = () => {
    if (!dirty || save.isPending) return;
    if (form.awayMessage.enabled && form.awayMessage.text.trim() === "") {
      toast.error("Add an away message or turn it off");
      setActiveSection("hours");
      return;
    }
    const patch: SettingsPatchRequest = {};
    if (changedKeys.includes("businessHours")) patch.businessHours = form.businessHours;
    if (changedKeys.includes("awayMessage")) patch.awayMessage = { ...form.awayMessage, text: form.awayMessage.text.trim() };
    if (changedKeys.includes("windowAlerts")) patch.windowAlerts = form.windowAlerts;
    save.mutate(patch, {
      onSuccess: () => {
        setDraft(null);
        setFieldErrors({});
        toast.success("Settings saved");
      },
      onError: (err) => {
        const details = err instanceof ApiError ? (err.details ?? []) : [];
        if (details.length > 0) {
          setFieldErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
          // Jump to the section that holds the first invalid field.
          const firstKey = FORM_KEYS.find((k) => details[0]?.path.startsWith(k));
          if (firstKey) setActiveSection(SECTION_FOR_KEY[firstKey]);
          toast.error("Some settings need fixing", { description: details[0]?.message });
        } else {
          toast.error("Couldn't save settings", { description: err.message });
        }
      },
    });
  };

  function confirmToggle() {
    if (paused === undefined) return;
    pause.mutate(!paused, {
      onSuccess: (res) => {
        if (res.paused) {
          toast.warning("AI automation paused", { description: "New messages are stored but the AI won't reply." });
        } else {
          toast.success("AI automation resumed", { description: "The AI is answering routine questions again." });
        }
      },
      onError: (err) => toast.error("Couldn't change automation", { description: err.message }),
    });
  }

  const statValue = (col: (typeof statColumns)[number], row: StatRow): number | null =>
    col.data ? row.get(col.data) : null;

  const exportStatsCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["Metric", "Today", "This Week", "This Month"],
      ...STAT_ROWS.map((row) => [row.type, ...statColumns.map((col) => statValue(col, row) ?? "")]),
    ];
    const filename = `message_stats_${dayjs().format("YYYY-MM-DD")}.csv`;
    downloadCsv(filename, rows);
    toast.success("Message statistics exported", { description: filename });
  };

  const statsReady = statColumns.some((c) => c.data);

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Studio Settings</span>
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Automation master switch, messaging channels, business hours, and alerts
          </p>
        </div>

        <div className="flex items-center gap-3">
          {dirty && !save.isPending && <span className="text-12 text-text-muted">Unsaved changes</span>}
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={!dirty || formDisabled}
            title={dirty ? "Save business hours, away message and alerts" : "No changes to save"}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-[#2BAFC0] text-primary-foreground font-semibold text-13 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* ─── Settings failed to load ───────────────────────────────────────────── */}
      {settings.isError && (
        <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between gap-3 text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 text-13 font-medium">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Couldn't load settings. {settings.error.message}</span>
          </div>
          <button
            type="button"
            onClick={() => void settings.refetch()}
            className="px-3 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-500/10 text-12 font-bold cursor-pointer shrink-0 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* ─── Global AI Paused Banner if Paused ─────────────────────────────────── */}
      {paused === true && (
        <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between gap-3 text-red-600 dark:text-red-400 animate-in fade-in">
          <div className="flex items-center gap-2 text-13 font-medium">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              <strong>AI is paused:</strong> New messages from customers are stored in the inbox but will not be answered automatically.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmAiOpen(true)}
            disabled={pause.isPending}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-12 font-bold cursor-pointer shrink-0 disabled:opacity-60"
          >
            Resume AI
          </button>
        </div>
      )}

      {/* ─── Sub-Navigation & Content Layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Sticky Left Navigation (4 cols) */}
        <div className="md:col-span-4 lg:col-span-3 rounded-2xl border border-border bg-surface p-2.5 space-y-1 sticky top-20">
          {[
            { id: "automation", label: "AI Automation", icon: Bot },
            { id: "whatsapp", label: "WhatsApp API", icon: MessageCircle },
            { id: "instagram", label: "Instagram Direct", icon: InstagramIcon },
            { id: "hours", label: "Business Hours", icon: Clock },
            { id: "window", label: "24h Window Alerts", icon: Bell },
            { id: "stats", label: "Message Statistics", icon: BarChart3 },
            { id: "appearance", label: "Appearance & Theme", icon: Palette },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as SettingsSection)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-13 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-text-muted hover:text-text hover:bg-surface-muted"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Panels (8 cols) */}
        <div className="md:col-span-8 lg:col-span-9 space-y-6">
          {/* Section 1: AI Automation */}
          {activeSection === "automation" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">AI Automation Engine</h2>
                  <p className="text-13 text-text-muted mt-1">
                    Master toggle for autonomous replies to price, delivery, and care inquiries.
                  </p>
                </div>
                {paused === undefined ? (
                  // Don't show "off" before the real state has loaded.
                  <div
                    className="h-6 w-11 shrink-0 rounded-full bg-surface-muted animate-pulse"
                    role="status"
                    aria-label="Loading AI automation status"
                  />
                ) : (
                  <Toggle
                    label="AI automation"
                    checked={!paused}
                    disabled={pause.isPending}
                    onChange={() => setConfirmAiOpen(true)}
                  />
                )}
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-2 text-13 text-text">
                <p className="font-semibold text-text">How Saba Art AI behaves when active:</p>
                <ul className="list-disc list-inside space-y-1 text-12 text-text-muted">
                  <li>Answers routine questions regarding coaster sets, trays, pricing, and care.</li>
                  <li>Escalates custom orders, urgent shipping, and refunds to the owner or staff.</li>
                  <li>Detects customer language (Tamil / English) and formats currency in INR (₹).</li>
                </ul>
              </div>
            </div>
          )}

          {/* Section 2: WhatsApp */}
          {activeSection === "whatsapp" && (
            <ChannelPanel type="whatsapp" channel={waChannel} loading={settings.isLoading} />
          )}

          {/* Section 3: Instagram */}
          {activeSection === "instagram" && (
            <ChannelPanel type="instagram" channel={igChannel} loading={settings.isLoading} />
          )}

          {/* Section 4: Business Hours */}
          {activeSection === "hours" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">Studio Business Hours</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Configure operational hours for human staff and after-hours auto-responses.
                  </p>
                </div>
                <Toggle
                  label="Business hours"
                  checked={form.businessHours.enabled}
                  disabled={formDisabled}
                  onChange={(enabled) => updateForm("businessHours", { ...form.businessHours, enabled })}
                />
              </div>

              {/* Open / Close Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Studio Opens
                  </label>
                  <input
                    type="time"
                    value={form.businessHours.open}
                    disabled={formDisabled}
                    onChange={(e) => updateForm("businessHours", { ...form.businessHours, open: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text font-semibold disabled:opacity-60"
                  />
                  <FieldError message={fieldError("businessHours.open")} />
                </div>
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Studio Closes
                  </label>
                  <input
                    type="time"
                    value={form.businessHours.close}
                    disabled={formDisabled}
                    onChange={(e) => updateForm("businessHours", { ...form.businessHours, close: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 text-text font-semibold disabled:opacity-60"
                  />
                  <FieldError message={fieldError("businessHours.close")} />
                </div>
              </div>

              {/* Day Chips */}
              <div className="space-y-1.5">
                <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
                  Active Working Days
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEEK.map((day) => {
                    const isSelected = form.businessHours.days.includes(day.key);
                    return (
                      <button
                        key={day.key}
                        type="button"
                        disabled={formDisabled}
                        aria-pressed={isSelected}
                        onClick={() => toggleDay(day.key)}
                        className={`px-3 py-1.5 rounded-lg text-12 font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-surface-muted text-text-muted hover:text-text"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={fieldError("businessHours.days") ?? fieldErrors["businessHours"]} />
                <FieldError message={fieldError("businessHours.enabled")} />
              </div>

              {/* Away Message */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="away-message"
                    className="block text-12 font-semibold uppercase tracking-wider text-text-muted"
                  >
                    After-Hours Away Auto-Reply
                  </label>
                  <Toggle
                    label="After-hours away auto-reply"
                    checked={form.awayMessage.enabled}
                    disabled={formDisabled}
                    onChange={(enabled) => updateForm("awayMessage", { ...form.awayMessage, enabled })}
                  />
                </div>
                <textarea
                  id="away-message"
                  rows={3}
                  value={form.awayMessage.text}
                  disabled={formDisabled}
                  placeholder="Hi! We're closed right now 🌙 We'll reply when we open tomorrow."
                  onChange={(e) => updateForm("awayMessage", { ...form.awayMessage, text: e.target.value })}
                  className={`w-full p-3 rounded-xl border border-border bg-surface-muted text-13 text-text leading-relaxed placeholder:text-text-muted/70 disabled:opacity-60 ${
                    form.awayMessage.enabled ? "" : "opacity-70"
                  }`}
                />
                <FieldError message={fieldError("awayMessage")} />
              </div>

              <SendingNote />
            </div>
          )}

          {/* Section 5: 24h Window Alerts */}
          {activeSection === "window" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">24-Hour WhatsApp Window Alerts</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Prevent customer chat expiration under Meta's 24-hour customer service window rule.
                  </p>
                </div>
                <Toggle
                  label="Window alerts"
                  checked={form.windowAlerts.enabled}
                  disabled={formDisabled}
                  onChange={(enabled) => updateForm("windowAlerts", { ...form.windowAlerts, enabled })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Expiry Alert Threshold
                  </label>
                  <div className="relative">
                    <select
                      value={form.windowAlerts.thresholdMinutes}
                      disabled={formDisabled}
                      onChange={(e) =>
                        updateForm("windowAlerts", {
                          ...form.windowAlerts,
                          thresholdMinutes: Number(e.target.value) as WindowAlertThresholdMinutes,
                        })
                      }
                      className="w-full pl-3 pr-8 py-2.5 appearance-none rounded-xl border border-border bg-surface-muted text-13 text-text font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {THRESHOLD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                  </div>
                  <FieldError message={fieldError("windowAlerts.thresholdMinutes")} />
                </div>

                <div>
                  <label className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Alert Destination
                  </label>
                  <div className="relative">
                    <select
                      value={form.windowAlerts.target}
                      disabled={formDisabled}
                      onChange={(e) =>
                        updateForm("windowAlerts", {
                          ...form.windowAlerts,
                          target: e.target.value === "whatsapp" ? "whatsapp" : "push",
                        })
                      }
                      className="w-full pl-3 pr-8 py-2.5 appearance-none rounded-xl border border-border bg-surface-muted text-13 text-text font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="push">Browser & Device Push Notification</option>
                      <option value="whatsapp">Admin WhatsApp</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                  </div>
                  <FieldError message={fieldError("windowAlerts.target") ?? fieldError("windowAlerts.enabled")} />
                </div>
              </div>

              <SendingNote />
            </div>
          )}

          {/* Section 6: Message Statistics */}
          {activeSection === "stats" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
                <div>
                  <h2 className="text-18 font-bold font-outfit text-text">Message Traffic Breakdown</h2>
                  <p className="text-13 text-text-muted mt-0.5">
                    Summary of automated vs human conversations across reporting periods.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportStatsCsv}
                  disabled={!statsReady}
                  className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-semibold text-text inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-left text-13">
                  <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                    <tr>
                      <th className="p-3.5">Metric Type</th>
                      <th className="p-3.5">Today</th>
                      <th className="p-3.5">This Week</th>
                      <th className="p-3.5">This Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {STAT_ROWS.map((row) => (
                      <tr key={row.type} className="hover:bg-surface-muted/50">
                        <td className="p-3.5 font-semibold text-text">{row.type}</td>
                        {statColumns.map((col, i) => {
                          const isMonth = i === statColumns.length - 1;
                          if (col.isLoading) {
                            return (
                              <td key={i} className="p-3.5">
                                <span className="block h-3.5 w-10 rounded bg-surface-muted animate-pulse" />
                              </td>
                            );
                          }
                          const v = statValue(col, row);
                          return (
                            <td
                              key={i}
                              className={`p-3.5 tabular-nums font-outfit ${
                                v === null
                                  ? "text-text-muted"
                                  : isMonth
                                    ? "text-primary font-bold"
                                    : "text-text font-medium"
                              }`}
                            >
                              {v === null ? "—" : v.toLocaleString("en-IN")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {statColumns.some((c) => c.isError) && (
                <p className="text-12 text-red-600 dark:text-red-400">Some periods couldn't be loaded.</p>
              )}
            </div>
          )}

          {/* Section 7: Appearance */}
          {activeSection === "appearance" && (
            <div className="p-6 rounded-2xl border border-border bg-surface space-y-6">
              <div>
                <h2 className="text-18 font-bold font-outfit text-text">Dashboard Theme & Appearance</h2>
                <p className="text-13 text-text-muted mt-0.5">
                  Choose visual contrast preference for Saba Art dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Light */}
                <div
                  onClick={() => {
                    setTheme("light");
                    toast.success("Switched to Light theme");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    theme === "light"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Sun className="w-5 h-5 text-amber-500" />
                    {theme === "light" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Light Theme</h4>
                  <p className="text-11 text-text-muted">Clean stone #FAFAF9 with Saba Art cyan accents</p>
                </div>

                {/* Dark */}
                <div
                  onClick={() => {
                    setTheme("dark");
                    toast.success("Switched to Dark theme");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    theme === "dark"
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Moon className="w-5 h-5 text-indigo-400" />
                    {theme === "dark" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Dark Theme</h4>
                  <p className="text-11 text-text-muted">Deep navy #0B1120 with high contrast readability</p>
                </div>

                {/* Compact Density (display preference, this browser only) */}
                <div
                  onClick={() => {
                    setCompactDensity(!compactDensity);
                    toast.info(compactDensity ? "Comfortable density enabled" : "Compact density enabled");
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
                    compactDensity
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Monitor className="w-5 h-5 text-teal" />
                    {compactDensity && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <h4 className="font-bold text-14 text-text">Compact Density</h4>
                  <p className="text-11 text-text-muted">Tighter padding for small laptop screens</p>
                  <p className="text-10 uppercase tracking-wide font-semibold text-text-muted/80">
                    Display preference · this browser only
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Pause / Resume AI (POST /settings/pause) */}
      <ConfirmDialog
        isOpen={confirmAiOpen}
        onClose={() => setConfirmAiOpen(false)}
        onConfirm={confirmToggle}
        title={paused ? "Resume AI Automation?" : "Pause AI Automation?"}
        description={
          paused
            ? "Resuming AI will re-enable automatic responses for routine questions like pricing, delivery, care and custom order flows."
            : "Pausing AI means incoming WhatsApp & Instagram messages will be saved in Inbox, but no auto-replies will be sent until resumed."
        }
        confirmLabel={paused ? "Resume AI" : "Pause AI"}
        tone={paused ? "primary" : "warning"}
      />
    </div>
  );
}
