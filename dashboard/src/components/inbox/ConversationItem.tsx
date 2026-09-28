import { EscalationBadge } from "../escalations/EscalationBadge.tsx";
import { StateBadge, TagBadge } from "../ui/Badge.tsx";
import { cn } from "../../lib/cn.ts";
import { customerLabel, formatRelative, formatShortDate } from "../../lib/format.ts";
import type { ConversationListItem, SenderType } from "../../types/index.ts";
import { ChannelIcon } from "../ui/ChannelIcon.tsx";

const previewPrefix: Partial<Record<SenderType, string>> = {
  ai: "AI: ",
  owner: "You: ",
  staff: "Staff: ",
};

export function ConversationItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ConversationListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const name = customerLabel(conversation.customer);
  const last = conversation.lastMessage;
  const when = last?.createdAt ?? conversation.lastCustomerMessageAt ?? conversation.updatedAt;
  const preview = last ? `${previewPrefix[last.senderType] ?? ""}${last.content?.trim() || "📎 Attachment"}` : "No messages yet";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors",
        "focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500",
        selected ? "bg-emerald-50" : "bg-white hover:bg-gray-50",
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
          {name.charAt(0).toUpperCase()}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 shadow-sm">
          <ChannelIcon channel={conversation.channelType} className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate text-sm text-gray-900", conversation.state === "escalated" ? "font-semibold" : "font-medium")}>
            {name}
          </p>
          <time dateTime={when} title={formatRelative(when)} className="shrink-0 text-xs text-gray-400">
            {formatShortDate(when)}
          </time>
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-500">{preview}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StateBadge state={conversation.state} />
          {conversation.tag && <TagBadge tag={conversation.tag} />}
          {conversation.openEscalation && <EscalationBadge reason={conversation.openEscalation.reason} />}
        </div>
      </div>
    </button>
  );
}
