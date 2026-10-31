import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Info,
  Loader2,
  Lock,
  Megaphone,
  Pencil,
  Save,
  Send,
  Trash2,
  Users,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { isApiError } from "../api/client.ts";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { StatusBadge } from "../components/shared/StatusBadge.tsx";
import {
  useAudienceCount,
  useBroadcast,
  useBroadcasts,
  useCancelBroadcast,
  useCreateBroadcast,
  useDeleteBroadcast,
  useUpdateBroadcast,
} from "../hooks/useBroadcasts.ts";
import { useTemplates } from "../hooks/useTemplates.ts";
import {
  BROADCAST_STATUS_TONES,
  broadcastErrorLabel,
  deliveryRates,
  reachedCount,
  RECIPIENT_STATUS_TONES,
} from "../lib/broadcasts.ts";
import { CUSTOMER_LANGUAGES, languageLabel, SEGMENT_DESCRIPTIONS } from "../lib/customers.ts";
import { formatDateTime, formatPercent, humanize } from "../lib/format.ts";
import { AUTO_FILLED_VARIABLES, renderTemplate, variableLabel } from "../lib/templates.ts";
import {
  SEGMENT_LABELS,
  SEGMENTS,
  type BroadcastAction,
  type BroadcastFilters,
  type BroadcastSummary,
  type CreateBroadcastRequest,
  type Segment,
  type UpdateBroadcastRequest,
} from "../types/index.ts";

const HISTORY_PAGE_SIZE = 10;
const RECIPIENTS_PAGE_SIZE = 50;
const MIN_SCHEDULE_LEAD_MS = 60_000;
const SAMPLE_CUSTOMER_NAME = "Priya";
const AUTO_FILLED = new Set<string>(AUTO_FILLED_VARIABLES);

type SendMode = "now" | "schedule";
/** Field error keys: name, templateId, scheduledAt, city, language, var:<variable>. */
type FieldErrors = Record<string, string>;

const toLocalInput = (d: dayjs.Dayjs | string) => dayjs(d).format("YYYY-MM-DDTHH:mm");
const defaultScheduleAt = () => toLocalInput(dayjs().add(1, "hour").startOf("hour"));

function filtersSummary(f: BroadcastFilters): string {
  const parts: string[] = [];
  if (f.city) parts.push(f.city);
  if (f.language) parts.push(languageLabel(f.language));
  if (f.excludeComplaints) parts.push("no complaints");
  return parts.join(" · ");
}

/** Server error → field errors + one inline message. */
function mapServerError(err: unknown): { fields: FieldErrors; message: string | null } {
  if (!isApiError(err)) return { fields: {}, message: err instanceof Error ? err.message : "Something went wrong" };
  const fields: FieldErrors = {};
  const details: unknown = err.details;
  switch (err.code) {
    case "TEMPLATE_VARIABLES_MISSING":
      if (Array.isArray(details)) {
        for (const d of details as Array<{ path: string }>) fields[`var:${d.path}`] = "Required";
      }
      return { fields, message: "Fill in every template variable." };
    case "AUDIENCE_TOO_LARGE": {
      const d = (details ?? {}) as { count?: number; max?: number };
      return {
        fields,
        message:
          d.count !== undefined && d.max !== undefined
            ? `This audience has ${d.count} customers; a broadcast can reach at most ${d.max}. Narrow the segment or filters.`
            : err.message,
      };
    }
    case "EMPTY_AUDIENCE":
    case "TEMPLATE_NOT_APPROVED":
    case "BROADCAST_LOCKED":
      return { fields, message: err.message };
    case "VALIDATION_ERROR": {
      let unmapped = false;
      if (Array.isArray(details)) {
        for (const d of details as Array<{ path: string; message: string }>) {
          const path = d.path ?? "";
          if (path === "name" || path === "templateId" || path === "scheduledAt") fields[path] = d.message;
          else if (path === "filters.city") fields.city = d.message;
          else if (path === "filters.language") fields.language = d.message;
          else if (path.startsWith("variables.")) fields[`var:${path.slice("variables.".length)}`] = d.message;
          else unmapped = true;
        }
      } else unmapped = true;
      return { fields, message: unmapped || Object.keys(fields).length === 0 ? err.message : null };
    }
    default:
      return { fields, message: err.message };
  }
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-11 font-medium text-danger">{message}</p>;
}

function Pager({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-12 text-text-muted">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text font-medium hover:bg-surface-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-text font-medium hover:bg-surface-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function StatusCell({ b }: { b: BroadcastSummary }) {
  const error = broadcastErrorLabel(b.error);
  return (
    <span title={error ?? undefined} className="inline-flex flex-col items-end gap-0.5">
      <StatusBadge
        label={humanize(b.status)}
        tone={BROADCAST_STATUS_TONES[b.status]}
        dot={b.status === "sending"}
        size="sm"
      />
      {error && b.status === "failed" && (
        <span className="text-10 text-text-muted max-w-[140px] truncate">{error}</span>
      )}
    </span>
  );
}

function broadcastWhen(b: BroadcastSummary): { label: string; at: string } {
  if (b.status === "scheduled" && b.scheduledAt) return { label: "Scheduled", at: b.scheduledAt };
  if (b.completedAt && (b.status === "sent" || b.status === "failed" || b.status === "cancelled"))
    return { label: humanize(b.status), at: b.completedAt };
  if (b.startedAt) return { label: "Started", at: b.startedAt };
  if (b.scheduledAt) return { label: "Planned", at: b.scheduledAt };
  return { label: "Created", at: b.createdAt };
}

// ─── Detail slide-over ───────────────────────────────────────────────────────

function BroadcastDetail({
  id,
  open,
  onClose,
  onCancel,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onCancel: (b: BroadcastSummary) => void;
}) {
  const [page, setPage] = useState(1);
  const query = useBroadcast(id, { page, limit: RECIPIENTS_PAGE_SIZE });
  const b = query.data?.broadcast;
  const rates = b ? deliveryRates(b) : null;
  const error = broadcastErrorLabel(b?.error ?? null);

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (query.isError || !b) {
    body = (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
        <p className="text-14 font-semibold text-text">Couldn't load this broadcast</p>
        <p className="mt-1 text-12 text-text-muted">{query.error?.message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  } else {
    const recipients = query.data.recipients;
    const stats: Array<[string, ReactNode]> = [
      ["Recipients", b.recipientCount],
      ["Sent", reachedCount(b)],
      ["Delivered", rates?.delivered === null || !rates ? "—" : formatPercent(rates.delivered)],
      ["Read", rates?.read === null || !rates ? "—" : formatPercent(rates.read)],
      ["Pending", b.stats.pending],
      ["Failed", b.stats.failed],
    ];
    body = (
      <>
        <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-1.5 text-12">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Template</span>
            <span className="font-medium text-text">{b.templateName ?? "Deleted template"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Audience</span>
            <span className="font-medium text-text text-right">
              {SEGMENT_LABELS[b.segment]}
              {filtersSummary(b.filters) && ` · ${filtersSummary(b.filters)}`}
            </span>
          </div>
          {b.scheduledAt && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Scheduled</span>
              <span className="font-medium text-text">{formatDateTime(b.scheduledAt)}</span>
            </div>
          )}
          {b.startedAt && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Started</span>
              <span className="font-medium text-text">{formatDateTime(b.startedAt)}</span>
            </div>
          )}
          {b.completedAt && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Finished</span>
              <span className="font-medium text-text">{formatDateTime(b.completedAt)}</span>
            </div>
          )}
          {error && (
            <p className="pt-1 text-danger font-medium flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {stats.map(([label, value]) => (
            <div key={label} className="p-2.5 rounded-lg border border-border bg-surface-muted">
              <p className="text-11 text-text-muted font-medium">{label}</p>
              <p className="text-16 font-bold font-outfit text-text tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Recipients</p>
          {recipients.length === 0 ? (
            <p className="p-4 rounded-lg border border-dashed border-border text-12 text-text-muted text-center">
              {b.status === "draft" || b.status === "scheduled"
                ? "Recipients are picked when sending starts."
                : "No recipients."}
            </p>
          ) : (
            <ul
              className={`divide-y divide-border/50 rounded-lg border border-border ${query.isPlaceholderData ? "opacity-60" : ""}`}
            >
              {recipients.map((r) => {
                const when = r.readAt ?? r.deliveredAt ?? r.sentAt;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-13 font-semibold text-text truncate">{r.customerName ?? r.phone}</p>
                      <p className="text-11 text-text-muted truncate">
                        {r.customerName ? r.phone : ""}
                        {r.error ? `${r.customerName ? " · " : ""}${broadcastErrorLabel(r.error)}` : ""}
                        {!r.error && when ? `${r.customerName ? " · " : ""}${formatDateTime(when)}` : ""}
                      </p>
                    </div>
                    <StatusBadge label={humanize(r.status)} tone={RECIPIENT_STATUS_TONES[r.status]} size="sm" />
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page} total={query.data.pagination.total} limit={RECIPIENTS_PAGE_SIZE} onPage={setPage} />
        </div>
      </>
    );
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={b?.name ?? "Broadcast"}
      subtitle="WhatsApp broadcast"
      badge={
        b ? <StatusBadge label={humanize(b.status)} tone={BROADCAST_STATUS_TONES[b.status]} size="sm" /> : undefined
      }
      footer={
        b && (b.status === "scheduled" || b.status === "sending") ? (
          <button
            type="button"
            onClick={() => onCancel(b)}
            className="w-full py-2 rounded-lg border border-border text-13 font-semibold text-danger hover:bg-danger/10 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <XCircle className="w-4 h-4" /> Cancel broadcast
          </button>
        ) : undefined
      }
    >
      {body}
    </SlideOver>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const navigate = useNavigate();
  const topRef = useRef<HTMLDivElement>(null);

  // Composer state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [excludeComplaints, setExcludeComplaints] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [mode, setMode] = useState<SendMode>("now");
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleAt);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // History state
  const [historyPage, setHistoryPage] = useState(1);
  const [viewing, setViewing] = useState<{ id: string; open: boolean } | null>(null);
  const [toCancel, setToCancel] = useState<BroadcastSummary | null>(null);
  const [toDelete, setToDelete] = useState<BroadcastSummary | null>(null);

  const templatesQuery = useTemplates({ channel: "whatsapp" });
  const approvedTemplates = useMemo(
    () =>
      (templatesQuery.data ?? []).filter(
        (t) => t.isActive && t.channel !== "instagram" && t.metaTemplateName && t.metaStatus === "approved",
      ),
    [templatesQuery.data],
  );
  const activeTemplate = approvedTemplates.find((t) => t.id === templateId);

  // Pick the first approved template once they load.
  useEffect(() => {
    if (!templateId && approvedTemplates[0]) setTemplateId(approvedTemplates[0].id);
  }, [templateId, approvedTemplates]);

  const audience = useAudienceCount({ segment, city, language, excludeComplaints });
  const count = audience.data?.count;
  const max = audience.data?.max;
  const audienceTooLarge = count !== undefined && max !== undefined && count > max;
  const audienceEmpty = count === 0;

  const historyQuery = useBroadcasts({ page: historyPage, limit: HISTORY_PAGE_SIZE });
  const broadcasts = historyQuery.data?.broadcasts ?? [];

  const createMutation = useCreateBroadcast();
  const updateMutation = useUpdateBroadcast();
  const cancelMutation = useCancelBroadcast();
  const deleteMutation = useDeleteBroadcast();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const editableVariables = (activeTemplate?.variables ?? []).filter((v) => !AUTO_FILLED.has(v));
  const usesCustomerName = activeTemplate?.variables.includes("customerName") ?? false;

  const defaultName = activeTemplate ? `${activeTemplate.name} – ${dayjs().format("D MMM")}` : "";
  const effectiveName = nameTouched ? name : defaultName;

  const previewBody = useMemo(() => {
    if (!activeTemplate) return "";
    return renderTemplate(activeTemplate.body, { ...variableValues, customerName: SAMPLE_CUSTOMER_NAME }).text;
  }, [activeTemplate, variableValues]);

  const clearErrors = () => {
    setFieldErrors({});
    setFormError(null);
  };

  const resetComposer = () => {
    setEditingId(null);
    setVariableValues({});
    setName("");
    setNameTouched(false);
    setMode("now");
    setScheduleAt(defaultScheduleAt());
    clearErrors();
  };

  /** Client-side checks mirroring the server, so most problems show before the request. */
  const validate = (action: BroadcastAction): boolean => {
    const errors: FieldErrors = {};
    if (!effectiveName.trim()) errors.name = "Give the broadcast a name";
    if (!activeTemplate) errors.templateId = "Pick an approved template";
    if (action !== "draft") {
      for (const v of editableVariables) {
        if (!variableValues[v]?.trim()) errors[`var:${v}`] = "Required";
      }
    }
    if (mode === "schedule" && action !== "send_now") {
      const at = dayjs(scheduleAt);
      if (!scheduleAt || !at.isValid()) errors.scheduledAt = "Pick a date and time";
      else if (at.valueOf() < Date.now() + MIN_SCHEDULE_LEAD_MS)
        errors.scheduledAt = "Must be at least 1 minute from now";
    }
    setFieldErrors(errors);
    let message: string | null = null;
    if (action !== "draft") {
      if (audienceEmpty) message = "No WhatsApp customers match this audience.";
      else if (audienceTooLarge) message = `This audience has ${count} customers; the limit is ${max}. Narrow it down.`;
    }
    setFormError(message);
    return Object.keys(errors).length === 0 && !message;
  };

  const submit = (action: BroadcastAction) => {
    const filters: BroadcastFilters = { excludeComplaints };
    if (city.trim()) filters.city = city.trim();
    if (language) filters.language = language;
    const variables: Record<string, string> = {};
    for (const v of editableVariables) {
      const value = variableValues[v]?.trim();
      if (value) variables[v] = value;
    }
    const scheduledAt = mode === "schedule" && action !== "send_now" ? dayjs(scheduleAt).toISOString() : null;

    const onError = (err: Error) => {
      const mapped = mapServerError(err);
      setFieldErrors(mapped.fields);
      setFormError(mapped.message);
      if (isApiError(err) && err.code === "BROADCAST_LOCKED") setEditingId(null);
    };
    const onSuccess = (b: BroadcastSummary) => {
      const title =
        b.status === "sending"
          ? "Broadcast is sending"
          : b.status === "scheduled"
            ? "Broadcast scheduled"
            : "Draft saved";
      const description =
        b.status === "scheduled" && b.scheduledAt
          ? `Goes out ${formatDateTime(b.scheduledAt)} to about ${count ?? 0} customers`
          : b.status === "sending"
            ? `Sending to ${count ?? 0} customers on WhatsApp`
            : b.name;
      toast.success(title, { description });
      resetComposer();
    };

    if (editingId) {
      const body: UpdateBroadcastRequest = {
        name: effectiveName.trim(),
        templateId,
        segment,
        filters,
        variables,
        scheduledAt,
      };
      if (action !== "draft") body.action = action;
      updateMutation.mutate({ id: editingId, body }, { onSuccess: (res) => onSuccess(res.broadcast), onError });
    } else {
      const body: CreateBroadcastRequest = {
        name: effectiveName.trim(),
        templateId,
        segment,
        filters,
        variables,
        scheduledAt,
        action,
      };
      createMutation.mutate(body, { onSuccess: (res) => onSuccess(res.broadcast), onError });
    }
  };

  const loadDraft = (b: BroadcastSummary) => {
    clearErrors();
    setEditingId(b.id);
    setSegment(b.segment);
    setCity(b.filters.city ?? "");
    setLanguage(b.filters.language ?? "");
    setExcludeComplaints(Boolean(b.filters.excludeComplaints));
    setTemplateId(b.templateId);
    setVariableValues(b.variables);
    setName(b.name);
    setNameTouched(true);
    if (b.scheduledAt) {
      setMode("schedule");
      setScheduleAt(toLocalInput(b.scheduledAt));
    } else {
      setMode("now");
      setScheduleAt(defaultScheduleAt());
    }
    if (!approvedTemplates.some((t) => t.id === b.templateId)) {
      setFormError("This draft's template is no longer an approved WhatsApp template. Pick another one.");
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showDemoNote =
    broadcasts.some((b) => reachedCount(b) > 0) && broadcasts.every((b) => b.stats.delivered + b.stats.read === 0);

  const noTemplates = templatesQuery.isSuccess && approvedTemplates.length === 0;
  const primaryAction: BroadcastAction = mode === "schedule" ? "schedule" : "send_now";

  return (
    <div className="h-full w-full flex flex-col gap-6 p-4 sm:p-6 lg:p-8 overflow-y-auto md:overflow-hidden">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
          <span>Broadcast Campaigns</span>
          <span className="px-2 py-0.5 rounded-full text-11 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            WhatsApp Business API
          </span>
        </h1>
        <p className="text-13 text-text-muted mt-0.5">
          Send pre-approved festival promotions, collection launches, and updates to customer segments
        </p>
      </div>

      {/* ─── Scroll region: composer + history (the only part that scrolls on md+) ─── */}
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto custom-scrollbar md:pr-1 md:pb-1">
      <div ref={topRef} className="space-y-8">
      {editingId && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-between gap-3 text-13 text-text">
          <span className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" /> Editing draft <strong>{name}</strong>
          </span>
          <button
            type="button"
            onClick={resetComposer}
            className="px-2.5 py-1 rounded-md border border-border bg-surface text-12 font-medium hover:bg-surface-muted cursor-pointer"
          >
            Start a new broadcast
          </button>
        </div>
      )}

      {/* ─── Two-Column Composer ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Audience (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl border border-border bg-surface space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-16 font-bold font-outfit text-text flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Audience Selection
            </h2>
            <div
              className="flex items-center gap-1 text-11 text-text-muted px-2 py-0.5 rounded bg-surface-muted border border-border"
              title="Broadcasts use approved WhatsApp templates"
            >
              <Lock className="w-3 h-3 text-emerald-500" /> WhatsApp Locked
            </div>
          </div>

          {/* Segment picker */}
          <div className="space-y-2.5">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Target Segment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Target segment">
              {SEGMENTS.map((s) => (
                <label
                  key={s}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer select-none ${
                    segment === s
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/70 bg-surface-muted hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="segment"
                    checked={segment === s}
                    onChange={() => setSegment(s)}
                    className="w-4 h-4 text-primary focus:ring-primary cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-13 font-semibold text-text">{SEGMENT_LABELS[s]}</p>
                    <p className="text-11 text-text-muted">{SEGMENT_DESCRIPTIONS[s]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2.5">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Filters</p>
            <div className="grid grid-cols-2 gap-2 text-12">
              <div>
                <span className="text-11 text-text-muted block mb-0.5">City</span>
                <input
                  type="text"
                  value={city}
                  maxLength={80}
                  placeholder="Any city"
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border bg-surface-muted text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <FieldError message={fieldErrors.city} />
              </div>
              <div>
                <span className="text-11 text-text-muted block mb-0.5">Language</span>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 appearance-none rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="">Any language</option>
                    {CUSTOMER_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {languageLabel(l)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
                </div>
                <FieldError message={fieldErrors.language} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-12 font-medium text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeComplaints}
                onChange={(e) => setExcludeComplaints(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <span>Exclude customers who complained or asked for a refund</span>
            </label>
          </div>

          {/* Live audience count */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              audienceTooLarge || audienceEmpty ? "border-danger/40 bg-danger/5" : "border-primary/30 bg-primary/10"
            }`}
          >
            <div>
              <p className="text-12 font-medium text-text-muted">Estimated Audience Reach</p>
              <p className="text-28 font-bold font-outfit text-text tabular-nums tracking-tight flex items-center gap-2">
                {audience.isPending ? (
                  <Skeleton className="h-8 w-24" />
                ) : audience.isError ? (
                  <span className="text-16 text-text-muted">Unavailable</span>
                ) : (
                  <>
                    {count} recipient{count === 1 ? "" : "s"}
                    {(audience.settling || audience.isFetching) && (
                      <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-label="Updating" />
                    )}
                  </>
                )}
              </p>
            </div>
            {max !== undefined && (
              <span className="p-3 rounded-xl bg-primary text-primary-foreground font-bold text-14 whitespace-nowrap">
                max {max}
              </span>
            )}
          </div>
          {audienceTooLarge && (
            <p className="-mt-3 text-12 font-medium text-danger flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Too many recipients for one broadcast (max {max}). Narrow the segment or add filters.
            </p>
          )}
          {audienceEmpty && (
            <p className="-mt-3 text-12 font-medium text-danger flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              No WhatsApp customers match this audience.
            </p>
          )}

          {/* Opt-out Note */}
          <div className="p-3 rounded-lg border border-border/50 bg-surface-muted/50 flex items-start gap-2 text-11 text-text-muted">
            <Info className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
            <span>
              WhatsApp only · opted-out customers are always excluded. Customers who reply STOP are opted out
              automatically.
            </span>
          </div>
        </div>

        {/* Right Column: Message & Preview (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl border border-border bg-surface space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h2 className="text-16 font-bold font-outfit text-text flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Message & Template
            </h2>
            <span className="text-11 text-text-muted">Meta Approved Template</span>
          </div>

          {templatesQuery.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : templatesQuery.isError ? (
            <div className="p-6 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
              <p className="text-14 font-semibold text-text">Couldn't load templates</p>
              <p className="mt-1 text-12 text-text-muted">{templatesQuery.error.message}</p>
              <button
                type="button"
                onClick={() => void templatesQuery.refetch()}
                className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : noTemplates ? (
            <EmptyState
              icon={FileText}
              title="Approve a WhatsApp template first"
              description="Broadcasts can only use active WhatsApp templates that have a Meta template name and are approved by Meta."
              action={{ label: "Go to templates", onClick: () => navigate("/templates") }}
            />
          ) : (
            <>
              {/* Name */}
              <div>
                <label
                  htmlFor="broadcast-name"
                  className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  Campaign Name
                </label>
                <input
                  id="broadcast-name"
                  type="text"
                  value={effectiveName}
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  className="w-full p-2.5 rounded-xl border border-border bg-surface-muted text-13 font-medium text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <FieldError message={fieldErrors.name} />
              </div>

              {/* Template Selector */}
              <div>
                <label
                  htmlFor="broadcast-template"
                  className="block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5"
                >
                  Approved WhatsApp Template
                </label>
                <div className="relative">
                  <select
                    id="broadcast-template"
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, templateId: "" }));
                    }}
                    className="w-full pl-3 pr-9 py-2.5 appearance-none rounded-xl border border-border bg-surface-muted text-13 font-medium text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    {!activeTemplate && (
                      <option value={templateId} disabled>
                        {templateId ? "Template not available" : "Choose a template"}
                      </option>
                    )}
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({humanize(t.category)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
                </div>
                <FieldError message={fieldErrors.templateId} />
              </div>

              {/* Variables */}
              {activeTemplate && activeTemplate.variables.length > 0 && (
                <div className="space-y-2">
                  <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Template Variables</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-12">
                    {usesCustomerName && (
                      <div>
                        <span className="text-11 text-text-muted block mb-0.5">{"{customerName}"} (Auto-filled)</span>
                        <input
                          type="text"
                          disabled
                          value="Filled per customer"
                          className="w-full p-2 rounded-lg border border-border bg-surface-muted/60 text-text-muted cursor-not-allowed"
                        />
                      </div>
                    )}
                    {editableVariables.map((v) => (
                      <div key={v}>
                        <label htmlFor={`var-${v}`} className="text-11 text-text-muted block mb-0.5">
                          {variableLabel(v)} <span className="opacity-70">{`{${v}}`}</span>
                        </label>
                        <input
                          id={`var-${v}`}
                          type="text"
                          maxLength={1000}
                          value={variableValues[v] ?? ""}
                          onChange={(e) => {
                            setVariableValues((prev) => ({ ...prev, [v]: e.target.value }));
                            if (fieldErrors[`var:${v}`]) setFieldErrors((prev) => ({ ...prev, [`var:${v}`]: "" }));
                          }}
                          aria-invalid={Boolean(fieldErrors[`var:${v}`]) || undefined}
                          className={`w-full p-2 rounded-lg border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary ${
                            fieldErrors[`var:${v}`] ? "border-danger" : "border-border"
                          }`}
                        />
                        <FieldError message={fieldErrors[`var:${v}`]} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WhatsApp preview bubble */}
              <div className="space-y-1.5">
                <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Live WhatsApp Preview</p>
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                  <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-surface border border-border shadow-md space-y-2 text-13 text-text leading-relaxed">
                    <div className="flex items-center justify-between text-11 text-text-muted pb-1 border-b border-border/40">
                      <span className="font-semibold text-text">Saba Art · Official WhatsApp</span>
                      <span>{dayjs().format("h:mm A")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{previewBody || "Pick a template to preview it."}</p>
                    <div className="flex justify-end text-[10px] text-text-muted">
                      <span>Preview for “{SAMPLE_CUSTOMER_NAME}”</span>
                    </div>
                  </div>
                </div>
              </div>

              {formError && (
                <div
                  className="p-3 rounded-lg border border-danger/40 bg-danger/5 text-12 font-medium text-danger flex items-start gap-2"
                  role="alert"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Schedule vs Send Now & Actions */}
              <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-12 font-medium text-text cursor-pointer">
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={mode === "now"}
                      onChange={() => setMode("now")}
                      className="text-primary"
                    />
                    <span>Send immediately</span>
                  </label>
                  <label className="flex items-center gap-2 text-12 font-medium text-text cursor-pointer">
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={mode === "schedule"}
                      onChange={() => setMode("schedule")}
                      className="text-primary"
                    />
                    <span>Schedule for later</span>
                  </label>
                </div>

                {mode === "schedule" && (
                  <div>
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      min={toLocalInput(dayjs().add(1, "minute"))}
                      onChange={(e) => {
                        setScheduleAt(e.target.value);
                        if (fieldErrors.scheduledAt) setFieldErrors((prev) => ({ ...prev, scheduledAt: "" }));
                      }}
                      aria-label="Schedule date and time"
                      className={`px-2.5 py-1.5 rounded-lg border bg-surface-muted text-12 text-text ${
                        fieldErrors.scheduledAt ? "border-danger" : "border-border"
                      }`}
                    />
                    <FieldError message={fieldErrors.scheduledAt} />
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      if (validate("draft")) submit("draft");
                    }}
                    className="px-4 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-muted text-text font-semibold text-13 inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingId ? "Save draft" : "Save as draft"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      if (validate(primaryAction)) setShowConfirmModal(true);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-[#2BAFC0] text-primary-foreground font-semibold text-13 inline-flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{mode === "schedule" ? "Schedule Broadcast" : "Send Broadcast Now"}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Broadcast History ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-16 font-bold font-outfit text-text">Recent Broadcast Campaigns</h2>
          {showDemoNote && (
            <p className="text-11 text-text-muted flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Delivered/read update live once WhatsApp is connected
            </p>
          )}
        </div>

        <div
          className={`rounded-xl border border-border bg-surface overflow-x-auto ${historyQuery.isPlaceholderData ? "opacity-60" : ""}`}
        >
          {historyQuery.isPending ? (
            <div className="p-4 space-y-3" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : historyQuery.isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
              <p className="text-14 font-semibold text-text">Couldn't load broadcasts</p>
              <p className="mt-1 text-12 text-text-muted">{historyQuery.error.message}</p>
              <button
                type="button"
                onClick={() => void historyQuery.refetch()}
                className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : broadcasts.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No broadcasts yet"
              description="Your sent, scheduled and draft campaigns will be listed here."
            />
          ) : (
            <table className="w-full text-left text-13">
              <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                <tr>
                  <th className="p-3.5">Campaign Name</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Target Audience</th>
                  <th className="p-3.5">Recipients</th>
                  <th className="p-3.5">Sent</th>
                  <th className="p-3.5">Delivered</th>
                  <th className="p-3.5">Read</th>
                  <th className="p-3.5">Failed</th>
                  <th className="p-3.5 text-right">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {broadcasts.map((b) => {
                  const when = broadcastWhen(b);
                  const rates = deliveryRates(b);
                  const filters = filtersSummary(b.filters);
                  const noRecipients = b.recipientCount === 0;
                  return (
                    <tr key={b.id} className="hover:bg-surface-muted/60 transition-colors">
                      <td className="p-3.5">
                        <p className="font-bold font-outfit text-text">{b.name}</p>
                        <p className="text-11 text-text-muted">{b.templateName ?? "Deleted template"}</p>
                      </td>
                      <td className="p-3.5 text-text-muted whitespace-nowrap">
                        <span className="block text-11">{when.label}</span>
                        <span className="text-text">{formatDateTime(when.at)}</span>
                      </td>
                      <td className="p-3.5">
                        <p className="text-text font-medium">{SEGMENT_LABELS[b.segment]}</p>
                        {filters && <p className="text-11 text-text-muted">{filters}</p>}
                      </td>
                      <td className="p-3.5 tabular-nums text-text">{noRecipients ? "—" : b.recipientCount}</td>
                      <td className="p-3.5 tabular-nums font-semibold text-text">
                        {noRecipients ? "—" : reachedCount(b)}
                      </td>
                      <td className="p-3.5 tabular-nums font-semibold text-text">
                        {rates.delivered === null ? "—" : formatPercent(rates.delivered)}
                      </td>
                      <td className="p-3.5 tabular-nums text-text">
                        {rates.read === null ? "—" : formatPercent(rates.read)}
                      </td>
                      <td className="p-3.5 tabular-nums text-text">{noRecipients ? "—" : b.stats.failed}</td>
                      <td className="p-3.5 text-right">
                        <StatusCell b={b} />
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {b.status === "draft" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => loadDraft(b)}
                                title="Edit draft"
                                aria-label={`Edit draft ${b.name}`}
                                className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-muted cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setToDelete(b)}
                                title="Delete draft"
                                aria-label={`Delete draft ${b.name}`}
                                className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setViewing({ id: b.id, open: true })}
                              title="View recipients"
                              aria-label={`View ${b.name}`}
                              className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-muted cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {(b.status === "scheduled" || b.status === "sending") && (
                            <button
                              type="button"
                              onClick={() => setToCancel(b)}
                              title="Cancel broadcast"
                              aria-label={`Cancel ${b.name}`}
                              className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {historyQuery.data && (
          <Pager
            page={historyPage}
            total={historyQuery.data.pagination.total}
            limit={HISTORY_PAGE_SIZE}
            onPage={setHistoryPage}
          />
        )}
      </div>

      </div>
      </div>

      {/* ─── Confirmation Modal ───────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 text-center"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary-text mx-auto flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-16 font-bold font-outfit text-text">
                {mode === "schedule" ? "Confirm Schedule" : "Confirm Broadcast"}
              </h3>
              <p className="text-12 text-text-muted mt-1">
                “{effectiveName}” will be sent to <strong className="text-text">{count ?? 0}</strong> customer
                {count === 1 ? "" : "s"} on WhatsApp
                {mode === "schedule" ? ` on ${formatDateTime(dayjs(scheduleAt).toISOString())}` : " right away"}. The
                final list is taken when sending starts.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  submit(primaryAction);
                }}
                className="flex-1 py-2 rounded-lg bg-primary hover:bg-[#2BAFC0] text-primary-foreground text-13 font-semibold cursor-pointer shadow-xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <BroadcastDetail
          key={viewing.id}
          id={viewing.id}
          open={viewing.open}
          onClose={() => setViewing((v) => (v ? { ...v, open: false } : v))}
          onCancel={(b) => setToCancel(b)}
        />
      )}

      <ConfirmDialog
        isOpen={toCancel !== null}
        onClose={() => setToCancel(null)}
        onConfirm={() => {
          if (!toCancel) return;
          const target = toCancel;
          cancelMutation.mutate(target.id, {
            onSuccess: () => toast.success("Broadcast cancelled", { description: target.name }),
            onError: (err) => toast.error("Couldn't cancel broadcast", { description: err.message }),
          });
        }}
        title="Cancel this broadcast?"
        description={
          toCancel?.status === "sending"
            ? `“${toCancel.name}” stops before its next batch; up to 50 more messages may still go out.`
            : `“${toCancel?.name ?? ""}” will not be sent.`
        }
        confirmLabel="Cancel broadcast"
        cancelLabel="Keep it"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          const target = toDelete;
          deleteMutation.mutate(target.id, {
            onSuccess: () => {
              toast.success("Draft deleted", { description: target.name });
              if (editingId === target.id) resetComposer();
            },
            onError: (err) => toast.error("Couldn't delete draft", { description: err.message }),
          });
        }}
        title="Delete this draft?"
        description={`“${toDelete?.name ?? ""}” will be removed permanently.`}
        confirmLabel="Delete draft"
        tone="danger"
      />
    </div>
  );
}
