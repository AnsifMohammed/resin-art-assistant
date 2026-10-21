import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, FileText, Paperclip, Send } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import type { ChannelType } from "../../types/index.ts";
import { TemplatePicker } from "./TemplatePicker.tsx";

const MAX_LENGTH = 4096;

export interface ReplyBoxProps {
  /** Resolve with anything on success (text is then cleared); reject to keep the text. */
  onSend: (text: string) => Promise<unknown>;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const warningId = `${inputId}-warning`;
  const trimmed = text.trim();
  const textDisabled = disabled || windowClosed;

  const submit = async () => {
    if (!trimmed || sending || textDisabled) return;
    try {
      await onSend(trimmed);
      setText("");
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
        <textarea
          ref={textareaRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_LENGTH}
          placeholder={windowClosed ? "Window closed: send an approved template" : `Reply to ${customerName}…`}
          aria-describedby={windowClosed ? warningId : undefined}
          disabled={textDisabled}
          className="max-h-40 min-h-11 w-full resize-none border-none bg-transparent text-[15px] text-text placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed sm:text-13"
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

            <button
              type="button"
              disabled
              className="shrink-0 rounded-lg p-1 text-text-muted opacity-50 cursor-not-allowed sm:p-1.5"
              title="Attachments: coming soon"
              aria-label="Attach a file (coming soon)"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-11 text-text-muted lg:inline">Enter to send · Shift+Enter new line</span>
            <button
              type="submit"
              disabled={!trimmed || textDisabled || sending}
              aria-busy={sending || undefined}
              aria-label="Send reply"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-12 font-semibold text-primary-foreground shadow-xs transition hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5"
            >
              <span>{sending ? "Sending…" : "Send"}</span>
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
