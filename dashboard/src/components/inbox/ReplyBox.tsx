import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { fieldBase } from "../ui/Input.tsx";
import { cn } from "../../lib/cn.ts";

const MAX_LENGTH = 4096;

export interface ReplyBoxProps {
  /** Resolve with anything on success (text is then cleared); reject to keep the text. */
  onSend: (text: string) => Promise<unknown>;
  onResolve?: (() => void) | undefined;
  /** Show the Resolve button (conversation is escalated / owner_handling). */
  canResolve: boolean;
  sending: boolean;
  resolving: boolean;
  /** The 24h window has passed: free-form replies will be rejected by Meta. */
  windowClosed: boolean;
}

/** Enter sends, Shift+Enter adds a newline. Errors are reported by the caller (toast). */
export function ReplyBox({ onSend, onResolve, canResolve, sending, resolving, windowClosed }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const warningId = `${inputId}-warning`;
  const busy = sending || resolving;
  const trimmed = text.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
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

  return (
    <form onSubmit={onSubmit} className="border-t border-gray-200 bg-white px-3 py-3 pb-safe sm:px-4">
      {windowClosed && (
        <p
          id={warningId}
          className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          The 24-hour reply window has closed. Meta only allows approved templates now, so a normal reply may be rejected.
        </p>
      )}
      <label htmlFor={inputId} className="sr-only">
        Reply message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_LENGTH}
          placeholder="Type a reply…"
          aria-describedby={windowClosed ? warningId : undefined}
          disabled={resolving}
          className={cn(fieldBase, "max-h-40 min-h-11 flex-1 resize-none border-gray-300 py-2.5")}
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 sm:w-auto sm:px-4"
          disabled={!trimmed || resolving}
          loading={sending}
          aria-label="Send reply"
        >
          {!sending && <Send className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="hidden text-xs text-gray-400 sm:block">Enter to send · Shift+Enter for a new line</p>
        {canResolve && onResolve && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-10 sm:h-9"
            onClick={onResolve}
            loading={resolving}
            disabled={sending}
          >
            {!resolving && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />}
            Resolve · hand back to AI
          </Button>
        )}
      </div>
    </form>
  );
}
