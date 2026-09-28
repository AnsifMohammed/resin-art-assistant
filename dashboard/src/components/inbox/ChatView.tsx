import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, UserRound } from "lucide-react";
import { EscalationBadge } from "../escalations/EscalationBadge.tsx";
import { StateBadge, TagBadge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useAuth } from "../../hooks/useAuth.ts";
import { appendMessageToCache, useReply, useResolve } from "../../hooks/useConversations.ts";
import { useSocketEvent } from "../../hooks/useSocket.ts";
import { customerLabel, formatDayLabel, windowTimeLeft } from "../../lib/format.ts";
import type { ConversationDetail, Message } from "../../types/index.ts";
import { ChannelIcon, channelLabels } from "../ui/ChannelIcon.tsx";
import { MessageBubble } from "./MessageBubble.tsx";
import { ReplyBox } from "./ReplyBox.tsx";
import { WindowCountdown } from "./WindowCountdown.tsx";

export interface ChatViewProps {
  conversation: ConversationDetail;
  /** Shows a back arrow in the header (phones, or StaffChat). */
  onBack?: (() => void) | undefined;
  /** Hide the back arrow from md up (two-pane inbox). */
  backOnlyOnMobile?: boolean;
  /** Called after a successful resolve. */
  onResolved?: (() => void) | undefined;
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Full thread + reply box for one conversation. Used by AdminInbox and StaffChat. */
export function ChatView({ conversation, onBack, backOnlyOnMobile = false, onResolved }: ChatViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const reply = useReply(conversation.id);
  const resolve = useResolve(conversation.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Live messages for this conversation (staff rely on this; admin also gets the global message:new).
  useSocketEvent(`message:new:${conversation.id}`, (e) => appendMessageToCache(qc, conversation.id, e.message));

  const messages = conversation.messages;
  const pendingText = reply.isPending ? reply.variables : undefined;

  /** Label for outbound messages. Messages only carry senderId (see report: contract gap). */
  const labelFor = useMemo(() => {
    const assigned = conversation.openEscalation?.assignedTo ?? null;
    return (m: Message): string | null => {
      if (m.senderType === "customer" || m.senderType === "system") return null;
      if (m.senderType === "ai") return "AI";
      if (m.senderId && user && m.senderId === user.id) return "You";
      const metaName = m.metadata?.["senderName"];
      if (typeof metaName === "string" && metaName) return metaName;
      if (m.senderId && assigned && m.senderId === assigned.id) return assigned.name;
      return m.senderType === "owner" ? "Owner" : "Staff";
    };
  }, [conversation.openEscalation, user]);

  // Track whether the user is reading history; only auto-scroll when they're at the bottom.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // New conversation → jump to bottom.
  useLayoutEffect(() => {
    stickToBottom.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id]);

  // New messages (or our own pending one) → follow if at bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current || pendingText) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingText]);

  const windowClosed = windowTimeLeft(conversation.windowClosesAt).expired && conversation.windowClosesAt !== null;
  const canResolve = conversation.state === "escalated" || conversation.state === "owner_handling";
  const esc = conversation.openEscalation;

  const handleSend = (text: string) =>
    reply.mutateAsync(text).catch((err: unknown) => {
      toast({
        variant: "error",
        title: "Reply not sent",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
      throw err;
    });

  const handleResolve = () =>
    resolve.mutate(undefined, {
      onSuccess: () => {
        toast({ variant: "success", title: "Resolved", description: "The conversation is back with the AI." });
        onResolved?.();
      },
      onError: (err) => toast({ variant: "error", title: "Couldn't resolve", description: err.message }),
    });

  const name = customerLabel(conversation.customer);

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label={`Conversation with ${name}`}>
      {/* Header */}
      <header className="border-b border-gray-200 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={
                "-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" +
                (backOnlyOnMobile ? " md:hidden" : "")
              }
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
            {name.charAt(0).toUpperCase() || <UserRound className="h-5 w-5" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-gray-900 sm:text-base">{name}</h2>
            <p className="flex min-w-0 items-center gap-1 text-xs text-gray-500">
              <ChannelIcon channel={conversation.channelType} className="h-3.5 w-3.5" />
              <span className="truncate">
                {channelLabels[conversation.channelType]}
                {conversation.customer.name ? ` · ${conversation.customer.handleOrPhone}` : ""}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StateBadge state={conversation.state} />
          {conversation.tag && <TagBadge tag={conversation.tag} />}
          <WindowCountdown windowClosesAt={conversation.windowClosesAt} />
          {esc && (
            <>
              <EscalationBadge reason={esc.reason} />
              <span className="text-xs text-gray-500">
                {esc.assignedTo
                  ? `Assigned to ${esc.assignedTo.id === user?.id ? "you" : esc.assignedTo.name}`
                  : "Unassigned"}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/60 px-3 py-4 sm:px-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {messages.length === 0 && !pendingText ? (
          <EmptyState icon={MessageSquare} title="No messages yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <div className="my-2 self-center rounded-full bg-white px-3 py-0.5 text-xs font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
                      {formatDayLabel(m.createdAt)}
                    </div>
                  )}
                  <MessageBubble message={m} senderLabel={labelFor(m)} />
                </Fragment>
              );
            })}
            {pendingText && (
              <MessageBubble
                pending
                senderLabel="You"
                message={{
                  id: "pending",
                  senderType: user?.role === "staff" ? "staff" : "owner",
                  content: pendingText,
                  mediaUrls: [],
                  createdAt: new Date().toISOString(),
                  deliveryStatus: "queued",
                }}
              />
            )}
          </div>
        )}
      </div>

      <ReplyBox
        key={conversation.id}
        onSend={handleSend}
        onResolve={handleResolve}
        canResolve={canResolve}
        sending={reply.isPending}
        resolving={resolve.isPending}
        windowClosed={windowClosed}
      />
    </section>
  );
}
