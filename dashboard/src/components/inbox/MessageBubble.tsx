import { useId, useState } from "react";
import { AlertCircle, Bot, ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { escalationReasonLabel } from "../../lib/escalationReasons.ts";
import { formatTime, humanize } from "../../lib/format.ts";
import type { AiDecisionSummary, Message, SenderType } from "../../types/index.ts";

/** Bubble styles (new design; theme tokens so they work in light and dark). */
const bubbleStyles: Record<SenderType, string> = {
  customer: "bg-surface border border-border text-text self-start rounded-2xl rounded-tl-sm",
  ai: "bg-gradient-to-br from-violet-600/90 to-violet-700 text-white self-end rounded-2xl rounded-tr-sm",
  owner: "bg-primary text-primary-foreground self-end rounded-2xl rounded-tr-sm",
  staff: "bg-teal text-white self-end rounded-2xl rounded-tr-sm",
  system: "text-text-muted text-11 text-center self-center",
};

const metaTone: Record<SenderType, string> = {
  customer: "text-text-muted",
  ai: "text-white/80",
  owner: "text-primary-foreground/70",
  staff: "text-white/80",
  system: "text-text-muted",
};

export interface MessageBubbleProps {
  message: Pick<Message, "id" | "senderType" | "content" | "mediaUrls" | "createdAt" | "deliveryStatus"> & {
    aiDecision?: AiDecisionSummary | undefined;
  };
  /** Label above the text for outbound messages: "AI", staff/owner name, "You". */
  senderLabel?: string | null;
  /** Optimistic message not yet confirmed by the server. */
  pending?: boolean;
}

function ReasoningList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{title}</p>
      <ul className="mt-0.5 list-inside list-disc space-y-0.5 text-text">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="break-words [overflow-wrap:anywhere]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Admin only (the API only sends aiDecision to admins): why the AI replied or escalated. */
function AiReasoning({ decision }: { decision: AiDecisionSummary }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const outcome = decision.escalate
    ? `Escalated${decision.escalateReason ? `: ${escalationReasonLabel(decision.escalateReason)}` : ""}`
    : decision.sent
      ? "Auto-replied"
      : "Not sent";

  return (
    <div className="mt-1 max-w-full self-start text-11">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        <span>AI reasoning: {humanize(decision.intent)}</span>
        <span className="text-text-muted">· {outcome}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          className="mt-1 space-y-2 rounded-lg border border-border bg-surface-muted p-2.5 text-12 text-text"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-muted">Intent</dt>
            <dd className="font-medium">{humanize(decision.intent)}</dd>
            <dt className="text-text-muted">Escalated</dt>
            <dd className="font-medium">
              {decision.escalate
                ? `Yes${decision.escalateReason ? ` (${escalationReasonLabel(decision.escalateReason)})` : ""}`
                : "No"}
            </dd>
            {decision.languageDetected && (
              <>
                <dt className="text-text-muted">Language</dt>
                <dd className="font-medium">{humanize(decision.languageDetected)}</dd>
              </>
            )}
            {decision.suggestedTag && (
              <>
                <dt className="text-text-muted">Suggested tag</dt>
                <dd className="font-medium">{humanize(decision.suggestedTag)}</dd>
              </>
            )}
          </dl>
          <ReasoningList title="Facts used" items={decision.factsUsed} />
          <ReasoningList title="Missing facts" items={decision.missingFacts} />
          {decision.factsUsed.length === 0 && decision.missingFacts.length === 0 && (
            <p className="text-text-muted">No knowledge-base facts were used.</p>
          )}
        </div>
      )}
    </div>
  );
}

type FileCategory = "image" | "video" | "document";

function getFileCategory(url: string): { category: FileCategory; ext: string; filename: string } {
  try {
    const cleanUrl = url.split("?")[0]?.split("#")[0] ?? url;
    const filename = decodeURIComponent(cleanUrl.split("/").pop() || "attachment");
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext) || url.includes("/image/upload/")) {
      return { category: "image", ext, filename };
    }
    if (["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext) || url.includes("/video/upload/")) {
      return { category: "video", ext, filename };
    }
    return { category: "document", ext, filename };
  } catch {
    return { category: "document", ext: "", filename: "attachment" };
  }
}

function getDocumentBadge(ext: string): { label: string; bg: string } {
  const e = ext.toLowerCase();
  if (e === "pdf") return { label: "PDF", bg: "bg-red-500/20 text-red-600 dark:text-red-400" };
  if (e === "doc" || e === "docx") return { label: "DOC", bg: "bg-blue-500/20 text-blue-600 dark:text-blue-400" };
  if (e === "ppt" || e === "pptx") return { label: "PPT", bg: "bg-amber-500/20 text-amber-600 dark:text-amber-400" };
  if (e === "xls" || e === "xlsx") return { label: "XLS", bg: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" };
  return { label: ext.toUpperCase().slice(0, 4) || "FILE", bg: "bg-stone-500/20 text-stone-600 dark:text-stone-400" };
}

export function MessageBubble({ message, senderLabel, pending = false }: MessageBubbleProps) {
  const { senderType } = message;
  const media = Array.isArray(message.mediaUrls) ? message.mediaUrls.filter((u) => typeof u === "string" && u) : [];

  if (senderType === "system") {
    return (
      <div className={cn(bubbleStyles.system, "my-1 max-w-[90%]")}>
        <span className="inline-block rounded-md border border-border/40 bg-surface-muted px-3 py-1">
          {message.content}
          <span className="ml-1">· {formatTime(message.createdAt)}</span>
        </span>
      </div>
    );
  }

  const failed = message.deliveryStatus === "failed";

  const bubble = (
    <div
      className={cn(
        bubbleStyles[senderType],
        "max-w-[85%] px-3.5 py-2 text-13 leading-relaxed shadow-xs sm:max-w-[70%]",
        message.aiDecision && "max-w-full sm:max-w-full",
        pending && "opacity-70",
      )}
    >
      {senderLabel && (
        <p className={cn("mb-0.5 flex items-center gap-1 text-11 font-semibold", metaTone[senderType])}>
          {senderType === "ai" && <Bot className="h-3.5 w-3.5" aria-hidden />}
          {senderLabel}
        </p>
      )}

      {media.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {media.map((url, i) => {
            const { category, ext, filename } = getFileCategory(url);

            if (category === "video") {
              return (
                <div key={`${url}-${i}`} className="overflow-hidden rounded-xl bg-black/10 dark:bg-black/40">
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    className="max-h-64 w-full rounded-xl bg-black"
                  />
                </div>
              );
            }

            if (category === "document") {
              const docBadge = getDocumentBadge(ext);
              return (
                <a
                  key={`${url}-${i}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border border-current/15 p-2.5 transition-colors cursor-pointer",
                    senderType === "customer"
                      ? "bg-surface-muted/60 hover:bg-surface-muted text-text"
                      : "bg-black/10 hover:bg-black/20 text-current",
                  )}
                  title={`Open ${filename}`}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-11 shadow-2xs",
                      docBadge.bg,
                    )}
                  >
                    {docBadge.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-12 font-medium leading-snug">{filename}</p>
                    <span className="text-10 opacity-75">Click to view document</span>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 opacity-70" />
                </a>
              );
            }

            return (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  loading="lazy"
                  className="max-h-60 w-full max-w-[18rem] rounded-xl bg-black/5 object-cover"
                />
              </a>
            );
          })}
        </div>
      )}

      {message.content && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>}

      <p className={cn("mt-1 flex items-center justify-end gap-1 text-11", metaTone[senderType])}>
        {failed && (
          <span className="inline-flex items-center gap-0.5 font-medium">
            <AlertCircle className="h-3 w-3" aria-hidden /> Not delivered ·
          </span>
        )}
        {pending ? "Sending…" : <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}
      </p>
    </div>
  );

  if (!message.aiDecision) return bubble;

  // Customer message with an AI decision: bubble + reasoning expander, kept together on the left.
  return (
    <div className="flex max-w-[85%] flex-col items-start self-start sm:max-w-[70%]">
      {bubble}
      <AiReasoning decision={message.aiDecision} />
    </div>
  );
}
