import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import {
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useTemplates,
  useUpdateTemplate,
} from "../hooks/useTemplates.ts";
import {
  COMMON_TEMPLATE_VARIABLES,
  TEMPLATE_MAX_LENGTH,
  extractVariables,
  splitTemplateBody,
  templateCategoryLabels,
  templateChannelLabels,
} from "../lib/templates.ts";
import { formatRelative } from "../lib/format.ts";
import { isApiError } from "../api/client.ts";
import {
  META_TEMPLATE_STATUSES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  type CreateTemplateRequest,
  type MessageTemplate,
  type MetaTemplateStatus,
  type TemplateCategory,
  type TemplateChannel,
  type UpdateTemplateRequest,
} from "../types/index.ts";

// ─── Constants & small helpers ────────────────────────────────────────────────

const META_NAME_RE = /^[a-z0-9_]+$/;
const NAME_MAX_LENGTH = 80;

const metaStatusLabels: Record<MetaTemplateStatus, string> = {
  not_submitted: "Not submitted",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const metaStatusStyles: Record<MetaTemplateStatus, string> = {
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  not_submitted: "bg-surface-muted text-text-muted border-border/60",
};

type CategoryFilter = "all" | TemplateCategory;
type FormField = "name" | "category" | "channel" | "body" | "isActive" | "metaTemplateName" | "metaStatus";
type FieldErrors = Partial<Record<FormField, string>>;

const FORM_FIELDS: readonly FormField[] = [
  "name",
  "category",
  "channel",
  "body",
  "isActive",
  "metaTemplateName",
  "metaStatus",
];

function isFormField(value: string): value is FormField {
  return (FORM_FIELDS as readonly string[]).includes(value);
}

function isTemplateCategory(value: string): value is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

function isTemplateChannel(value: string): value is TemplateChannel {
  return (TEMPLATE_CHANNELS as readonly string[]).includes(value);
}

function isMetaStatus(value: string): value is MetaTemplateStatus {
  return (META_TEMPLATE_STATUSES as readonly string[]).includes(value);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

/** Body text with {variables} rendered as amber chips. */
function TemplateBody({ body }: { body: string }) {
  return (
    <>
      {splitTemplateBody(body).map((part, i) =>
        part.variable !== null ? (
          <span
            key={i}
            className="inline-block px-1.5 py-0.2 mx-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-11 font-semibold"
          >
            {part.text}
          </span>
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {part.text}
          </span>
        ),
      )}
    </>
  );
}

function MetaStatusBadge({ template }: { template: MessageTemplate }) {
  if (!template.metaTemplateName) return null;
  return (
    <span
      title={`WhatsApp template: ${template.metaTemplateName}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-11 font-medium ${metaStatusStyles[template.metaStatus]}`}
    >
      <span>WA {metaStatusLabels[template.metaStatus]}</span>
      <span className="font-mono text-[10px] opacity-80 truncate max-w-[140px]">{template.metaTemplateName}</span>
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function TemplateCard({
  template: t,
  onEdit,
  onDuplicate,
  onDelete,
  duplicating,
}: {
  template: MessageTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicating: boolean;
}) {
  return (
    <div
      className={`p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all flex flex-col justify-between space-y-4 ${
        t.isActive ? "" : "opacity-60"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-15 font-bold font-outfit text-text break-words min-w-0">{t.name}</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-surface-muted text-text-muted border border-border/60 shrink-0">
            <ChannelIcon channel={t.channel} size={11} />
            <span>{templateChannelLabels[t.channel]}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="px-2 py-0.5 rounded text-11 font-medium bg-primary/10 text-primary-text">
            {templateCategoryLabels[t.category]}
          </span>
          {!t.isActive && (
            <span className="px-2 py-0.5 rounded text-11 font-medium bg-surface-muted text-text-muted border border-border/60">
              Inactive
            </span>
          )}
          <MetaStatusBadge template={t} />
        </div>

        {/* Body Text with Amber Chips */}
        <div className="p-3 rounded-lg border border-border/50 bg-surface-muted/60 text-12 text-text leading-relaxed">
          <TemplateBody body={t.body} />
        </div>

        {/* Variables Used */}
        {t.variables.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1 items-center">
            <span className="text-[11px] text-text-muted mr-1">Variables:</span>
            {t.variables.map((v) => (
              <span
                key={v}
                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                {`{${v}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12 text-text-muted">
        <span className="text-11">Updated {formatRelative(t.updatedAt)}</span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={duplicating}
            className="p-1.5 rounded-lg hover:bg-surface-muted hover:text-text cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Duplicate template"
            aria-label={`Duplicate ${t.name}`}
          >
            {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-surface-muted hover:text-text cursor-pointer transition-colors"
            title="Edit template"
            aria-label={`Edit ${t.name}`}
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-danger cursor-pointer transition-colors"
            title="Delete template"
            aria-label={`Delete ${t.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateCardSkeleton() {
  return (
    <div className="p-5 rounded-xl border border-border bg-surface space-y-4">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="w-40 h-5" />
        <Skeleton className="w-20 h-5" />
      </div>
      <Skeleton className="w-24 h-4" />
      <Skeleton className="w-full h-20 rounded-lg" />
      <div className="pt-3 border-t border-border/40 flex items-center justify-between">
        <Skeleton className="w-28 h-3" />
        <Skeleton className="w-20 h-5" />
      </div>
    </div>
  );
}

// ─── Editor slide-over ────────────────────────────────────────────────────────

const labelClass = "block text-12 font-semibold uppercase tracking-wider text-text-muted mb-1.5";
const inputBase =
  "w-full p-2.5 rounded-xl border bg-surface-muted text-13 text-text focus:outline-none focus:ring-1";

function inputClass(hasError: boolean): string {
  return `${inputBase} ${hasError ? "border-danger focus:ring-danger" : "border-border focus:ring-primary"}`;
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-11 text-danger">{message}</p>;
}

function TemplateEditor({
  open,
  template,
  onClose,
}: {
  open: boolean;
  /** null = creating a new template. */
  template: MessageTemplate | null;
  onClose: () => void;
}) {
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? "general");
  const [channel, setChannel] = useState<TemplateChannel>(template?.channel ?? "both");
  const [body, setBody] = useState(template?.body ?? "Hi {customerName}! ");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [metaTemplateName, setMetaTemplateName] = useState(template?.metaTemplateName ?? "");
  const [metaStatus, setMetaStatus] = useState<MetaTemplateStatus>(template?.metaStatus ?? "not_submitted");
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(template?.metaTemplateName));
  const [previewChannel, setPreviewChannel] = useState<"whatsapp" | "instagram">(
    template?.channel === "instagram" ? "instagram" : "whatsapp",
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const limit = TEMPLATE_MAX_LENGTH[channel];
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  const trimmedMetaName = metaTemplateName.trim();
  const overLimit = trimmedBody.length > limit;
  const metaNameInvalid = trimmedMetaName !== "" && !META_NAME_RE.test(trimmedMetaName);
  const nameTooLong = trimmedName.length > NAME_MAX_LENGTH;
  const detectedVariables = useMemo(() => extractVariables(body), [body]);

  const canSave =
    !isPending && trimmedName !== "" && !nameTooLong && trimmedBody !== "" && !overLimit && !metaNameInvalid;

  const clearError = (field: FormField) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const insertVariable = (variable: string) => {
    const token = `{${variable}}`;
    const el = textareaRef.current;
    const start = el ? el.selectionStart : body.length;
    const end = el ? el.selectionEnd : body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    clearError("body");
    const caret = start + token.length;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const buildPayload = (): CreateTemplateRequest => ({
    name: trimmedName,
    category,
    channel,
    body: trimmedBody,
    isActive,
    metaTemplateName: trimmedMetaName === "" ? null : trimmedMetaName,
    metaStatus,
  });

  const buildPatch = (original: MessageTemplate): UpdateTemplateRequest => {
    const full = buildPayload();
    const patch: UpdateTemplateRequest = {};
    if (full.name !== original.name) patch.name = full.name;
    if (full.category !== original.category) patch.category = full.category;
    if (full.channel !== undefined && full.channel !== original.channel) patch.channel = full.channel;
    if (full.body !== original.body) patch.body = full.body;
    if (full.isActive !== undefined && full.isActive !== original.isActive) patch.isActive = full.isActive;
    if (full.metaTemplateName !== undefined && full.metaTemplateName !== original.metaTemplateName) {
      patch.metaTemplateName = full.metaTemplateName;
    }
    if (full.metaStatus !== undefined && full.metaStatus !== original.metaStatus) patch.metaStatus = full.metaStatus;
    return patch;
  };

  const handleServerError = (err: unknown) => {
    if (isApiError(err)) {
      if (err.status === 409 && err.code === "TEMPLATE_NAME_TAKEN") {
        setErrors((prev) => ({ ...prev, name: "A template with this name already exists" }));
        return;
      }
      const fieldErrors: FieldErrors = {};
      for (const detail of err.details ?? []) {
        const field = detail.path.split(".")[0] ?? "";
        if (isFormField(field) && fieldErrors[field] === undefined) fieldErrors[field] = detail.message;
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        if (fieldErrors.metaTemplateName !== undefined || fieldErrors.metaStatus !== undefined) {
          setAdvancedOpen(true);
        }
        return;
      }
    }
    toast.error(errorMessage(err));
  };

  const handleSave = () => {
    if (!canSave) return;
    if (template) {
      const patch = buildPatch(template);
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      updateMutation.mutate(
        { id: template.id, body: patch },
        {
          onSuccess: ({ template: saved }) => {
            toast.success("Template updated", { description: saved.name });
            onClose();
          },
          onError: handleServerError,
        },
      );
    } else {
      createMutation.mutate(buildPayload(), {
        onSuccess: ({ template: saved }) => {
          toast.success("Template created", { description: saved.name });
          onClose();
        },
        onError: handleServerError,
      });
    }
  };

  const handleClose = () => {
    if (isPending) return;
    onClose();
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleClose}
        disabled={isPending}
        className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="px-5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 cursor-pointer shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        <span>{isPending ? "Saving..." : "Save Template"}</span>
      </button>
    </div>
  );

  return (
    <SlideOver
      open={open}
      onClose={handleClose}
      title={template ? "Edit Template" : "New Response Template"}
      subtitle={template ? template.name : "Reusable reply with {variables} filled in when sending"}
      footer={footer}
      widthClass="max-w-lg"
    >
      {/* Name */}
      <div>
        <label htmlFor="tmpl-name" className={labelClass}>
          Template Name
        </label>
        <input
          id="tmpl-name"
          type="text"
          placeholder="e.g. Order Confirmed, Festive Onam"
          value={name}
          maxLength={NAME_MAX_LENGTH + 20}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          className={inputClass(Boolean(errors.name) || nameTooLong)}
        />
        <FieldError message={errors.name ?? (nameTooLong ? `Name must be ${NAME_MAX_LENGTH} characters or less` : undefined)} />
      </div>

      {/* Category & Channel */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="tmpl-category" className={labelClass}>
            Category
          </label>
          <select
            id="tmpl-category"
            value={category}
            onChange={(e) => {
              const v = e.target.value;
              if (isTemplateCategory(v)) setCategory(v);
              clearError("category");
            }}
            className={`${inputClass(Boolean(errors.category))} text-12 font-medium cursor-pointer`}
          >
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {templateCategoryLabels[c]}
              </option>
            ))}
          </select>
          <FieldError message={errors.category} />
        </div>

        <div>
          <label htmlFor="tmpl-channel" className={labelClass}>
            Channel
          </label>
          <select
            id="tmpl-channel"
            value={channel}
            onChange={(e) => {
              const v = e.target.value;
              if (isTemplateChannel(v)) {
                setChannel(v);
                if (v !== "both") setPreviewChannel(v);
              }
              clearError("channel");
              clearError("body");
            }}
            className={`${inputClass(Boolean(errors.channel))} text-12 font-medium cursor-pointer`}
          >
            {TEMPLATE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {templateChannelLabels[c]}
              </option>
            ))}
          </select>
          <FieldError message={errors.channel} />
        </div>
      </div>

      {/* Body Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="tmpl-body" className="block text-12 font-semibold uppercase tracking-wider text-text-muted">
            Message Body
          </label>
          <span className={`text-11 tabular-nums ${overLimit ? "text-danger font-semibold" : "text-text-muted"}`}>
            {trimmedBody.length} / {limit}
          </span>
        </div>

        <textarea
          id="tmpl-body"
          ref={textareaRef}
          rows={6}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            clearError("body");
          }}
          placeholder="Type message text... (e.g. Hi {customerName}! Your order is on the way.)"
          className={`${inputClass(Boolean(errors.body) || overLimit)} p-3 font-mono leading-relaxed`}
        />
        <FieldError
          message={
            errors.body ??
            (overLimit ? `Too long for ${templateChannelLabels[channel]}: maximum ${limit} characters` : undefined)
          }
        />

        {/* Variable Quick-insert Pills */}
        <div className="space-y-1">
          <span className="text-[11px] text-text-muted block">Click to insert variable at the cursor:</span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVariable(v)}
                className="px-2 py-0.5 rounded text-11 font-mono font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                +{`{${v}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Detected variables */}
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <span className="text-[11px] text-text-muted mr-1">Detected variables:</span>
          {detectedVariables.length === 0 ? (
            <span className="text-[11px] text-text-muted italic">none</span>
          ) : (
            detectedVariables.map((v) => (
              <span
                key={v}
                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                {`{${v}}`}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Active */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-muted/50">
        <div>
          <p className="text-13 font-semibold text-text">Active</p>
          <p className="text-11 text-text-muted">Turn off to hide it from replies without deleting it.</p>
        </div>
        <Switch
          checked={isActive}
          onChange={(next) => {
            setIsActive(next);
            clearError("isActive");
          }}
          label="Template active"
        />
      </div>
      <FieldError message={errors.isActive} />

      {/* Advanced: WhatsApp approval */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          className="w-full flex items-center gap-1.5 px-3 py-2.5 text-12 font-semibold text-text cursor-pointer hover:bg-surface-muted/60 rounded-xl"
        >
          {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span>Advanced: WhatsApp approval</span>
        </button>
        {advancedOpen && (
          <div className="px-3 pb-3 space-y-3">
            <p className="text-11 text-text-muted leading-relaxed">
              Needed only to message customers after 24 hours or for broadcasts. Create the same template in WhatsApp
              Manager, then paste its name here.
            </p>
            <div>
              <label htmlFor="tmpl-meta-name" className={labelClass}>
                WhatsApp template name
              </label>
              <input
                id="tmpl-meta-name"
                type="text"
                placeholder="order_dispatched"
                value={metaTemplateName}
                onChange={(e) => {
                  setMetaTemplateName(e.target.value);
                  clearError("metaTemplateName");
                }}
                className={`${inputClass(Boolean(errors.metaTemplateName) || metaNameInvalid)} font-mono`}
              />
              {errors.metaTemplateName || metaNameInvalid ? (
                <FieldError
                  message={errors.metaTemplateName ?? "Use only lowercase letters, numbers and underscores"}
                />
              ) : (
                <p className="mt-1 text-11 text-text-muted">
                  lowercase letters, numbers and underscores, e.g. order_dispatched
                </p>
              )}
            </div>
            <div>
              <label htmlFor="tmpl-meta-status" className={labelClass}>
                Approval status
              </label>
              <select
                id="tmpl-meta-status"
                value={metaStatus}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isMetaStatus(v)) setMetaStatus(v);
                  clearError("metaStatus");
                }}
                className={`${inputClass(Boolean(errors.metaStatus))} text-12 font-medium cursor-pointer`}
              >
                {META_TEMPLATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {metaStatusLabels[s]}
                  </option>
                ))}
              </select>
              <FieldError message={errors.metaStatus} />
            </div>
          </div>
        )}
      </div>

      {/* Live WhatsApp vs Instagram Preview */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-12 font-semibold uppercase tracking-wider text-text-muted">Live Style Preview</span>
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-11 font-medium">
            <button
              type="button"
              onClick={() => setPreviewChannel("whatsapp")}
              className={`px-2 py-0.5 rounded-md cursor-pointer ${
                previewChannel === "whatsapp" ? "bg-emerald-500/15 text-emerald-600 font-bold" : "text-text-muted"
              }`}
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setPreviewChannel("instagram")}
              className={`px-2 py-0.5 rounded-md cursor-pointer ${
                previewChannel === "instagram" ? "bg-pink-500/15 text-pink-600 font-bold" : "text-text-muted"
              }`}
            >
              Instagram
            </button>
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            previewChannel === "whatsapp" ? "border-emerald-500/30 bg-emerald-500/5" : "border-pink-500/30 bg-pink-500/5"
          }`}
        >
          <div className="p-3 rounded-xl bg-surface border border-border text-13 text-text leading-relaxed shadow-xs">
            <TemplateBody body={body || "Hi {customerName}..."} />
          </div>
        </div>
      </div>
    </SlideOver>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  usePageTitle("Templates");

  const templatesQuery = useTemplates({ active: "all" });
  const duplicateMutation = useDuplicateTemplate();
  const deleteMutation = useDeleteTemplate();

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (activeCategory !== "all" && t.category !== activeCategory) return false;
      if (q) {
        return (
          t.name.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q) ||
          t.variables.some((v) => v.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [templates, activeCategory, searchQuery]);

  const openEditor = (t: MessageTemplate | null) => {
    setEditingTemplate(t);
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  };

  const handleDuplicate = (t: MessageTemplate) => {
    duplicateMutation.mutate(t.id, {
      onSuccess: ({ template }) => toast.success("Template duplicated", { description: template.name }),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const handleDelete = (t: MessageTemplate) => {
    deleteMutation.mutate(t.id, {
      onSuccess: () => toast.success("Template deleted", { description: t.name }),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const tabs: Array<{ key: CategoryFilter; label: string }> = [
    { key: "all", label: "All" },
    ...TEMPLATE_CATEGORIES.map((c) => ({ key: c, label: templateCategoryLabels[c] })),
  ];

  const duplicatingId = duplicateMutation.isPending ? duplicateMutation.variables : undefined;

  let content: ReactNode;
  if (templatesQuery.isPending) {
    content = (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <TemplateCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (templatesQuery.isError) {
    content = (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={FileText}
          title="Couldn't load templates"
          description={errorMessage(templatesQuery.error)}
          action={{ label: "Try again", onClick: () => void templatesQuery.refetch() }}
        />
      </div>
    );
  } else if (templates.length === 0) {
    content = (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Save replies you send often, like order confirmations and delivery updates, and reuse them in one click."
          action={{ label: "New template", onClick: () => openEditor(null) }}
        />
      </div>
    );
  } else if (filteredTemplates.length === 0) {
    content = (
      <p className="py-10 text-center text-13 text-text-muted">
        No templates match{searchQuery.trim() ? ` "${searchQuery.trim()}"` : " this category"}.
      </p>
    );
  } else {
    content = (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            duplicating={duplicatingId === t.id}
            onEdit={() => openEditor(t)}
            onDuplicate={() => handleDuplicate(t)}
            onDelete={() => setDeleteTarget(t)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Response Templates</span>
            {templatesQuery.isSuccess && (
              <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
                {templates.length} {templates.length === 1 ? "template" : "templates"}
              </span>
            )}
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Pre-approved messaging snippets with auto-fill variables for WhatsApp and Instagram
          </p>
        </div>

        <button
          type="button"
          onClick={() => openEditor(null)}
          className="px-4 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      {/* ─── Category Tabs & Search ───────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
          {tabs.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                activeCategory === cat.key
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search templates & variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* ─── Template Cards ───────────────────────────────────────────────────── */}
      {content}

      {/* ─── SlideOver Editor (New / Edit) ─────────────────────────────────────── */}
      <TemplateEditor
        key={editorKey}
        open={editorOpen}
        template={editingTemplate}
        onClose={() => setEditorOpen(false)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
        title="Delete template?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed permanently. Messages already sent are not affected.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
