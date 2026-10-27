import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { AlertTriangle, FileText, Film, Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { uploadToCloudinary } from "../../api/products.ts";
import { cn } from "../../lib/cn.ts";
import type { ChannelType } from "../../types/index.ts";
import { TemplatePicker } from "./TemplatePicker.tsx";

const MAX_LENGTH = 4096;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileTypeBadge(ext: string): { label: string; color: string } {
  const e = ext.toLowerCase();
  if (e === "pdf") return { label: "PDF", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" };
  if (e === "doc" || e === "docx") return { label: "DOC", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" };
  if (e === "ppt" || e === "pptx") return { label: "PPT", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" };
  if (e === "xls" || e === "xlsx") return { label: "XLS", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
  return { label: ext.toUpperCase().slice(0, 4) || "FILE", color: "bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20" };
}

interface DraftAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  ext: string;
  isImage: boolean;
  isVideo: boolean;
  previewUrl?: string | undefined;
  uploadedUrl?: string | undefined;
  isUploading: boolean;
  error?: string | undefined;
}

export interface ReplyBoxProps {
  /** Resolve with anything on success (text and attachments cleared); reject to keep the text. */
  onSend: (payload: { text?: string | undefined; mediaUrls?: string[] | undefined }) => Promise<unknown>;
  /** Send a template directly: { templateId, variables }. Reject with the ApiError on failure. */
  onSendTemplate: (templateId: string, variables: Record<string, string>) => Promise<unknown>;
  sending: boolean;
  /** Disables the composer (e.g. while resolving). */
  disabled?: boolean;
  /** The 24h window has passed: free-form replies are rejected; only approved templates can be sent. */
  windowClosed: boolean;
  /** Conversation channel (filters templates). */
  channel: ChannelType;
  /** Customer display name (pre-fills {customerName}). */
  customerName: string;
}

/** Enter sends, Shift+Enter adds a newline. Errors are reported by the caller (toast). */
export function ReplyBox({
  onSend,
  onSendTemplate,
  sending,
  disabled = false,
  windowClosed,
  channel,
  customerName,
}: ReplyBoxProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const warningId = `${inputId}-warning`;
  const trimmed = text.trim();
  const textDisabled = disabled || windowClosed;

  const isUploadingAny = attachments.some((a) => a.isUploading);
  const readyAttachments = attachments.filter((a) => a.uploadedUrl && !a.isUploading);
  const hasContent = Boolean(trimmed || readyAttachments.length > 0);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // reset input so picking the same file again still fires onChange
    e.target.value = "";

    const newAttachments: DraftAttachment[] = files.map((file) => {
      const ext = file.name.split(".").pop() ?? "";
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const previewUrl = isImage || isVideo ? URL.createObjectURL(file) : undefined;
      return {
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        ext,
        isImage,
        isVideo,
        previewUrl,
        isUploading: true,
      };
    });

    setAttachments((prev) => [...prev, ...newAttachments]);

    // Upload each file to Cloudinary (/auto/upload handles photos, videos, and documents)
    for (const item of newAttachments) {
      try {
        const uploadedUrl = await uploadToCloudinary(item.file);
        setAttachments((prev) =>
          prev.map((att) => (att.id === item.id ? { ...att, uploadedUrl, isUploading: false } : att)),
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        toast.error(`Couldn't upload ${item.name}: ${errorMsg}`);
        setAttachments((prev) =>
          prev.map((att) => (att.id === item.id ? { ...att, isUploading: false, error: errorMsg } : att)),
        );
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const match = prev.find((a) => a.id === id);
      if (match?.previewUrl) URL.revokeObjectURL(match.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const submit = async () => {
    if (!hasContent || sending || textDisabled || isUploadingAny) return;
    try {
      await onSend({
        text: trimmed || undefined,
        mediaUrls: readyAttachments.length > 0 ? readyAttachments.map((a) => a.uploadedUrl!) : undefined,
      });
      setText("");
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setAttachments([]);
    } catch {
      /* caller shows the error; keep the draft */
    } finally {
      textareaRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const insert = (rendered: string) => {
    setText(rendered);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(rendered.length, rendered.length);
    });
  };

  return (
    <form onSubmit={onSubmit} className="shrink-0 border-t border-border bg-surface p-3 pb-safe sm:p-3.5">
      {windowClosed && (
        <p
          id={warningId}
          className="mb-2 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-12 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          The 24-hour reply window has closed. Only approved WhatsApp templates can be sent now.
        </p>
      )}
      <label htmlFor={inputId} className="sr-only">
        Reply message
      </label>
      <div
        className={cn(
          "rounded-xl border border-border bg-surface-muted p-2 transition-all focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary",
          textDisabled && "opacity-70",
        )}
      >
        {/* ─── Draft Attachments Tray ─────────────────────────────────────────── */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 max-h-36 overflow-y-auto custom-scrollbar">
            {attachments.map((att) => {
              const badge = getFileTypeBadge(att.ext);
              return (
                <div
                  key={att.id}
                  className="group relative flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-2xs max-w-[210px] sm:max-w-[250px]"
                >
                  {/* Thumbnail / Icon */}
                  {att.isImage && att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="h-8 w-8 rounded object-cover shrink-0" />
                  ) : att.isVideo ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-stone-900/10 text-stone-700 dark:bg-white/10 dark:text-stone-300 shrink-0">
                      <Film className="h-4 w-4" />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded border font-semibold text-10",
                        badge.color,
                      )}
                    >
                      {badge.label}
                    </div>
                  )}

                  {/* Name & Size / Status */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-11 font-medium text-text">{att.name}</p>
                    <div className="flex items-center gap-1.5 text-10 text-text-muted">
                      <span>{formatFileSize(att.size)}</span>
                      {att.isUploading && (
                        <span className="flex items-center gap-1 text-primary">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Uploading…
                        </span>
                      )}
                      {att.error && <span className="text-danger truncate">Failed</span>}
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text cursor-pointer transition"
                    title="Remove attachment"
                    aria-label={`Remove ${att.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <textarea
          ref={textareaRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_LENGTH}
          placeholder={
            windowClosed
              ? "Window closed: send an approved template"
              : attachments.length > 0
                ? "Add a caption or message (optional)…"
                : `Reply to ${customerName}…`
          }
          aria-describedby={windowClosed ? warningId : undefined}
          disabled={textDisabled}
          className="max-h-40 min-h-11 w-full resize-none border-none bg-transparent font-sans text-13 leading-relaxed text-text placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
        />

        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 text-12">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={disabled}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-11 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 sm:text-12",
                windowClosed
                  ? "border-primary/50 bg-primary/10 text-primary-text hover:bg-primary/20"
                  : "border-border/80 bg-surface text-text hover:bg-surface-muted",
              )}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span className="hidden sm:inline">Use template</span>
              <span className="sm:hidden">Template</span>
            </button>

            {/* Hidden native device file input supporting photos, videos, PDFs, Word, PPT, Excel, TXT */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || windowClosed}
              className="shrink-0 rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:p-1.5"
              title="Attach photos, videos, PDFs, or documents from device"
              aria-label="Attach a file from device"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-11 text-text-muted lg:inline">Enter to send · Shift+Enter new line</span>
            <button
              type="submit"
              disabled={!hasContent || textDisabled || sending || isUploadingAny}
              aria-busy={sending || isUploadingAny || undefined}
              aria-label="Send reply"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-12 font-semibold text-primary-foreground shadow-xs transition hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5"
            >
              <span>{sending ? "Sending…" : isUploadingAny ? "Uploading…" : "Send"}</span>
              <Send className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <TemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        channel={channel}
        customerName={customerName}
        windowClosed={windowClosed}
        onInsert={insert}
        onSend={onSendTemplate}
      />
    </form>
  );
}
