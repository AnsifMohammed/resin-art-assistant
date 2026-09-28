import { AlertCircle, Bot } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { formatTime } from "../../lib/format.ts";
import type { Message, SenderType } from "../../types/index.ts";

/** Exact bubble styles from CLAUDE.md → "Dashboard UI patterns". */
export const bubbleStyles: Record<SenderType, string> = {
  customer: "bg-gray-100 text-gray-900 self-start rounded-tr-2xl rounded-b-2xl",
  ai: "bg-blue-50 text-blue-900 self-end border border-blue-200 rounded-tl-2xl rounded-b-2xl",
  owner: "bg-emerald-500 text-white self-end rounded-tl-2xl rounded-b-2xl",
  staff: "bg-violet-500 text-white self-end rounded-tl-2xl rounded-b-2xl",
  system: "text-gray-400 text-xs text-center self-center bg-transparent",
};

const metaTone: Record<SenderType, string> = {
  customer: "text-gray-500",
  ai: "text-blue-700/80",
  owner: "text-white/80",
  staff: "text-white/80",
  system: "text-gray-400",
};

export interface MessageBubbleProps {
  message: Pick<Message, "id" | "senderType" | "content" | "mediaUrls" | "createdAt" | "deliveryStatus">;
  /** Label above the text for outbound messages: "AI", staff/owner name, "You". */
  senderLabel?: string | null;
  /** Optimistic message not yet confirmed by the server. */
  pending?: boolean;
}

export function MessageBubble({ message, senderLabel, pending = false }: MessageBubbleProps) {
  const { senderType } = message;
  const media = Array.isArray(message.mediaUrls) ? message.mediaUrls.filter((u) => typeof u === "string" && u) : [];

  if (senderType === "system") {
    return (
      <div className={cn(bubbleStyles.system, "max-w-[90%] px-2 py-1")}>
        {message.content}
        <span className="ml-1">· {formatTime(message.createdAt)}</span>
      </div>
    );
  }

  const failed = message.deliveryStatus === "failed";

  return (
    <div
      className={cn(
        bubbleStyles[senderType],
        "max-w-[85%] px-3.5 py-2 text-[15px] leading-snug shadow-sm sm:max-w-[70%] sm:text-sm",
        pending && "opacity-70",
      )}
    >
      {senderLabel && (
        <p className={cn("mb-0.5 flex items-center gap-1 text-xs font-semibold", metaTone[senderType])}>
          {senderType === "ai" && <Bot className="h-3.5 w-3.5" aria-hidden />}
          {senderLabel}
        </p>
      )}

      {media.length > 0 && (
        <div className={cn("mb-1.5 grid gap-1.5", media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {media.map((url, i) => (
            <a
              key={`${url}-${i}`}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                loading="lazy"
                className="h-32 w-full max-w-[16rem] bg-black/5 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {message.content && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>}

      <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", metaTone[senderType])}>
        {failed && (
          <span className="inline-flex items-center gap-0.5 font-medium">
            <AlertCircle className="h-3 w-3" aria-hidden /> Not delivered ·
          </span>
        )}
        {pending ? "Sending…" : <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}
      </p>
    </div>
  );
}
