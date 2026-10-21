import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowLeft, FileText, Lock, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { isApiError } from "../../api/client.ts";
import { useTemplates } from "../../hooks/useTemplates.ts";
import { cn } from "../../lib/cn.ts";
import {
  TEMPLATE_MAX_LENGTH,
  extractVariables,
  renderTemplate,
  splitTemplateBody,
  templateCategoryLabels,
  variableLabel,
} from "../../lib/templates.ts";
import { TEMPLATE_CATEGORIES, type ChannelType, type MessageTemplate, type TemplateCategory } from "../../types/index.ts";
import { Skeleton } from "../shared/Skeleton.tsx";

export interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** The conversation's channel: only templates for it (or "both") are listed. */
  channel: ChannelType;
  /** Pre-fills {customerName}. */
  customerName: string;
  /** 24h window closed: only approved WhatsApp templates, sent directly. */
  windowClosed: boolean;
  /** Window open: put the rendered text in the reply box. */
  onInsert: (text: string) => void;
  /** POST reply { templateId, variables }. Reject with the ApiError on failure. */
  onSend: (templateId: string, variables: Record<string, string>) => Promise<unknown>;
}

type CategoryFilter = "all" | TemplateCategory;

const isApprovedMeta = (t: MessageTemplate) => Boolean(t.metaTemplateName) && t.metaStatus === "approved";

function BodyPreview({ body }: { body: string }) {
  return (
    <>
      {splitTemplateBody(body).map((part, i) =>
        part.variable ? (
          <span
            key={i}
            className="mx-0.5 inline-block rounded bg-amber-500/15 px-1 font-mono text-11 font-semibold text-amber-600 dark:text-amber-400"
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Choose a message template, fill its variables, then insert it into the reply box or send it directly. */
export function TemplatePicker({
  open,
  onClose,
  channel,
  customerName,
  windowClosed,
  onInsert,
  onSend,
}: TemplatePickerProps) {
  const titleId = useId();
  const query = useTemplates({ channel, active: "true" }, { enabled: open });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  // Reset when (re)opened.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCategory("all");
    setSelected(null);
    setValues({});
    setErrors({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, sending]);

  const available = useMemo(() => {
    const all = query.data ?? [];
    return windowClosed ? all.filter(isApprovedMeta) : all;
  }, [query.data, windowClosed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
    });
  }, [available, category, search]);

  if (!open) return null;

  const choose = (t: MessageTemplate) => {
    const vars = t.variables.length > 0 ? t.variables : extractVariables(t.body);
    const initial: Record<string, string> = {};
    for (const v of vars) initial[v] = v === "customerName" ? customerName : "";
    setSelected(t);
    setValues(initial);
    setErrors({});
  };

  const variables = selected ? (selected.variables.length > 0 ? selected.variables : extractVariables(selected.body)) : [];
  const rendered = selected ? renderTemplate(selected.body, values) : null;
  const limit = TEMPLATE_MAX_LENGTH[channel];
  const tooLong = rendered ? rendered.text.length > limit : false;

  /** Client-side check before insert/send. Returns true when all variables are filled. */
  const validate = (): boolean => {
    if (!rendered) return false;
    if (rendered.missing.length === 0) return true;
    setErrors(Object.fromEntries(rendered.missing.map((name) => [name, "Required"])));
    return false;
  };

  const handleInsert = () => {
    if (!rendered || !validate()) return;
    onInsert(rendered.text);
    onClose();
  };

  const handleSend = async () => {
    if (!selected || !validate()) return;
    setSending(true);
    try {
      await onSend(selected.id, values);
      toast.success("Template sent", { description: selected.name });
      onClose();
    } catch (err) {
      if (isApiError(err) && err.code === "TEMPLATE_VARIABLES_MISSING" && err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, "Required"])));
      } else {
        toast.error("Template not sent", { description: err instanceof Error ? err.message : "Something went wrong." });
      }
    } finally {
      setSending(false);
    }
  };

  const categoryTabs: Array<{ key: CategoryFilter; label: string }> = [
    { key: "all", label: "All" },
    ...TEMPLATE_CATEGORIES.map((c) => ({ key: c, label: templateCategoryLabels[c] })),
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-in fade-in sm:items-center sm:p-4">
      <div className="absolute inset-0" aria-hidden onClick={() => !sending && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={sending}
                className="-ml-1 rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text cursor-pointer"
                aria-label="Back to templates"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h3 id={titleId} className="truncate text-16 font-bold font-outfit text-text">
                {selected ? selected.name : "Choose a template"}
              </h3>
              <p className="text-12 text-text-muted">
                {selected
                  ? "Fill in the details, check the preview, then send."
                  : windowClosed
                    ? "The 24-hour window has closed: only approved WhatsApp templates can be sent."
                    : "Pick a template to fill in for this customer."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-1 text-text-muted hover:text-text cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!selected ? (
          <>
            <div className="space-y-2 border-b border-border/60 px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden />
                <input
                  type="search"
                  placeholder="Search templates…"
                  aria-label="Search templates"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-3.5 text-13 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-12 font-medium custom-scrollbar">
                {categoryTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={category === tab.key}
                    onClick={() => setCategory(tab.key)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 transition-colors cursor-pointer",
                      category === tab.key
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "bg-surface-muted text-text-muted hover:text-text",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-40 flex-1 space-y-2 overflow-y-auto px-5 py-3 custom-scrollbar">
              {query.isPending ? (
                Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
              ) : query.isError ? (
                <div className="py-8 text-center text-13 text-text-muted">
                  <AlertCircle className="mx-auto mb-2 h-6 w-6 text-danger" aria-hidden />
                  <p>Couldn't load templates. {query.error.message}</p>
                  <button
                    type="button"
                    onClick={() => void query.refetch()}
                    className="mt-3 rounded-lg border border-border px-3 py-1.5 text-12 font-medium text-text hover:bg-surface-muted cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              ) : available.length === 0 ? (
                <div className="py-8 text-center text-13 text-text-muted">
                  {windowClosed ? (
                    <Lock className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden />
                  ) : (
                    <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden />
                  )}
                  <p className="font-medium text-text">
                    {windowClosed ? "No approved WhatsApp templates." : "No templates yet."}
                  </p>
                  <p className="mt-1 text-12">
                    {windowClosed
                      ? "Ask the admin to link one in Templates."
                      : "Templates are created by the admin under Templates."}
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-13 text-text-muted">No templates match.</p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choose(t)}
                    className="w-full space-y-1 rounded-xl border border-border bg-surface-muted p-3 text-left transition-colors hover:border-primary/50 hover:bg-surface cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-13 font-semibold text-text">{t.name}</span>
                      <span className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                        {templateCategoryLabels[t.category]}
                      </span>
                    </span>
                    <span className="line-clamp-2 block text-12 text-text-muted">
                      <BodyPreview body={t.body} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            {variables.length > 0 && (
              <div className="space-y-3">
                {variables.map((name) => {
                  const inputId = `${titleId}-${name}`;
                  const error = errors[name];
                  return (
                    <div key={name}>
                      <label htmlFor={inputId} className="mb-1 block text-12 font-semibold text-text-muted">
                        {variableLabel(name)}
                        {name === "customerName" && <span className="ml-1 font-normal">(from the customer)</span>}
                      </label>
                      <input
                        id={inputId}
                        type="text"
                        value={values[name] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setValues((prev) => ({ ...prev, [name]: v }));
                          if (errors[name]) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next[name];
                              return next;
                            });
                          }
                        }}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        className={cn(
                          "w-full rounded-lg border bg-surface-muted px-3 py-2 text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary",
                          error ? "border-danger" : "border-border",
                        )}
                      />
                      {error && (
                        <p id={`${inputId}-error`} className="mt-1 text-11 font-medium text-danger">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between text-12">
                <span className="font-semibold text-text-muted">Preview</span>
                <span className={cn("tabular-nums", tooLong ? "font-semibold text-danger" : "text-text-muted")}>
                  {rendered?.text.length ?? 0} / {limit}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-3 text-13 leading-relaxed text-text [overflow-wrap:anywhere]">
                {rendered && <BodyPreview body={rendered.text} />}
              </div>
              {tooLong && (
                <p className="mt-1 text-11 font-medium text-danger">The message is too long for this channel.</p>
              )}
            </div>
          </div>
        )}

        {selected && (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={sending}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer disabled:opacity-50"
            >
              Back
            </button>
            {!windowClosed && (
              <button
                type="button"
                onClick={handleInsert}
                disabled={sending || tooLong}
                className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-13 font-semibold text-primary-text hover:bg-primary/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Insert into reply
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || tooLong}
              aria-busy={sending || undefined}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-13 font-semibold text-primary-foreground shadow-xs hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {sending ? "Sending…" : windowClosed ? "Send" : "Send now"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
