import { Link } from "react-router-dom";
import { CheckCircle2, MessageSquareReply, UserPlus } from "lucide-react";
import { ChannelIcon } from "../ui/ChannelIcon.tsx";
import { WindowCountdown } from "../inbox/WindowCountdown.tsx";
import { Button, buttonVariants } from "../ui/Button.tsx";
import { StateBadge } from "../ui/Badge.tsx";
import { cn } from "../../lib/cn.ts";
import { customerLabel, formatDateTime, formatRelative } from "../../lib/format.ts";
import type { EscalationListItem } from "../../types/index.ts";
import { EscalationBadge } from "./EscalationBadge.tsx";

export function EscalationCard({
  escalation,
  currentUserId,
  isAdmin,
  onAssign,
}: {
  escalation: EscalationListItem;
  currentUserId: string | undefined;
  isAdmin: boolean;
  /** Admin only. Omit to hide the Assign button. */
  onAssign?: ((escalation: EscalationListItem) => void) | undefined;
}) {
  const conv = escalation.conversation;
  const name = customerLabel(conv.customer);
  const resolved = Boolean(escalation.resolvedAt);
  const last = conv.lastMessage;
  const assignee = escalation.assignedTo
    ? escalation.assignedTo.id === currentUserId
      ? "You"
      : escalation.assignedTo.name
    : null;

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm",
        resolved ? "border-gray-200 opacity-80" : "border-gray-200",
      )}
      aria-label={`Escalation: ${name}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 shadow-sm">
            <ChannelIcon channel={conv.channelType} className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">{name}</h3>
            <time
              dateTime={escalation.createdAt}
              title={formatDateTime(escalation.createdAt)}
              className="shrink-0 text-xs text-gray-400"
            >
              {formatRelative(escalation.createdAt)}
            </time>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <EscalationBadge reason={escalation.reason} />
            {!resolved && <WindowCountdown windowClosesAt={conv.windowClosesAt} />}
            {isAdmin && <StateBadge state={conv.state} />}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 break-words text-sm text-gray-600 [overflow-wrap:anywhere]">
        {last?.content?.trim() ? (
          <>
            <span className="sr-only">Last message: </span>“{last.content.trim()}”
          </>
        ) : (
          <span className="italic text-gray-400">{last ? "Attachment" : "No messages"}</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <p className="min-w-0 text-xs text-gray-500">
          {resolved ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Resolved {formatRelative(escalation.resolvedAt)}
            </span>
          ) : assignee ? (
            <>
              Assigned to <span className="font-medium text-gray-700">{assignee}</span>
            </>
          ) : (
            <span className="font-medium text-amber-700">Unassigned</span>
          )}
        </p>
        <div className="ml-auto flex gap-2">
          {isAdmin && onAssign && !resolved && (
            <Button variant="outline" className="h-10" onClick={() => onAssign(escalation)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              {escalation.assignedTo ? "Reassign" : "Assign"}
            </Button>
          )}
          <Link
            to={`/conversations/${encodeURIComponent(conv.id)}`}
            className={cn(buttonVariants({ variant: resolved ? "outline" : "primary" }), "h-10")}
            aria-label={`${resolved || isAdmin ? "Open" : "Reply to"} conversation with ${name}`}
          >
            <MessageSquareReply className="h-4 w-4" aria-hidden />
            {resolved || isAdmin ? "Open" : "Reply"}
          </Link>
        </div>
      </div>
    </article>
  );
}
