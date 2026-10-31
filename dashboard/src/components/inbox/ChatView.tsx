import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, PauseCircle, PlayCircle } from "lucide-react";
import { escalationReasonLabel } from "../../lib/escalationReasons.ts";
import { ChannelIcon } from "../shared/ChannelIcon.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.tsx";
import { TagBadge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useAuth } from "../../hooks/useAuth.ts";
import {
  appendMessageToCache,
  usePauseConversation,
  useReply,
  useResolve,
  useResumeConversation,
} from "../../hooks/useConversations.ts";
import { useNow } from "../../hooks/useNow.ts";
import { useSocketEvent } from "../../hooks/useSocket.ts";
import { customerLabel, formatDayLabel, windowTimeLeft } from "../../lib/format.ts";
import type { ConversationDetail, Message } from "../../types/index.ts";
import { ConvStateChip } from "./ConvStateChip.tsx";
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
  /** Extra buttons at the right of the header (e.g. the inbox's customer-panel toggle). */
  headerActions?: ReactNode;
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const headerButton =
  "inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-11 font-medium text-text transition-colors " +
  "hover:bg-surface-muted cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-2.5 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Admin only: stop / restart the AI for this one conversation. */
function PauseResumeButton({ conversation }: { conversation: ConversationDetail }) {
  const { toast } = useToast();
  const pause = usePauseConversation(conversation.id);
  const resume = useResumeConversation(conversation.id);
  const { state } = conversation;
  const busy = pause.isPending || resume.isPending;

  if (state === "paused") {
    return (
      <button
        type="button"
        className={headerButton}
        disabled={busy}
        aria-busy={busy || undefined}
        title="Let the AI answer this customer again"
        aria-label="Resume AI"
        onClick={() =>
          resume.mutate(undefined, {
            onSuccess: () => toast({ variant: "success", title: "AI resumed for this chat" }),
            onError: (err) => toast({ variant: "error", title: "Couldn't resume the AI", description: err.message }),
          })
        }
      >
        <PlayCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
        <span className="hidden sm:inline">Resume AI</span>
        
      </button>
    );
  }

  const escalated = state === "escalated";
  return (
    <span title={escalated ? "Resolve first" : "Stop the AI from replying to this customer"}>
      <button
        type="button"
        className={headerButton}
        disabled={busy || escalated}
        aria-busy={busy || undefined}
        aria-label={escalated ? "Pause AI (resolve the escalation first)" : "Pause AI"}
        onClick={() =>
          pause.mutate(undefined, {
            onSuccess: () => toast({ variant: "info", title: "AI paused for this chat" }),
            onError: (err) => toast({ variant: "error", title: "Couldn't pause the AI", description: err.message }),
          })
        }
      >
        <PauseCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <span className="hidden sm:inline">Pause AI</span>
      </button>
    </span>
  );
}

/** Full thread + reply box for one conversation. Used by the admin Inbox and StaffChat. */
export function ChatView({ conversation, onBack, backOnlyOnMobile = false, onResolved, headerActions }: ChatViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const reply = useReply(conversation.id);
  const resolve = useResolve(conversation.id);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const now = useNow(30_000);
  const isAdmin = user?.role === "admin";

  // Reset profile pic error state when switching conversations.
  useEffect(() => { setImgFailed(false); }, [conversation.id]);

  // Live messages for this conversation (staff rely on this; admin also gets the global message:new).
  useSocketEvent(`message:new:${conversation.id}`, (e) => appendMessageToCache(qc, conversation.id, e.message));

  const messages = conversation.messages;
  const pendingReply =
    reply.isPending && reply.variables && !("templateId" in reply.variables) ? reply.variables : undefined;
  const pendingText = pendingReply?.text;

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

  const windowClosed = conversation.windowClosesAt !== null && windowTimeLeft(conversation.windowClosesAt, now).expired;
  const canResolve = conversation.state === "escalated" || conversation.state === "owner_handling";
  const esc = conversation.openEscalation;

  const handleSend = (payload: { text?: string | undefined; mediaUrls?: string[] | undefined }) =>
    reply.mutateAsync(payload).catch((err: unknown) => {
      toast({
        variant: "error",
        title: "Reply not sent",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
      throw err;
    });

  // The template picker shows its own errors (variables mapped to inputs, others toasted).
  const handleSendTemplate = (templateId: string, variables: Record<string, string>) =>
    reply.mutateAsync({ templateId, variables });

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
    <section className="flex h-full min-h-0 flex-col bg-surface-muted/30" aria-label={`Conversation with ${name}`}>
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-surface p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className={
                  "-ml-1 shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-text cursor-pointer " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" +
                  (backOnlyOnMobile ? " md:hidden" : "")
                }
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {conversation.customer.profilePicUrl && !imgFailed ? (
              <img
                src={conversation.customer.profilePicUrl}
                alt={name}
                className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-outfit text-13 font-bold text-primary-text">
                {name.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <div className="min-w-0">
              {/* Row 1: Customer Name, Channel, and Handle */}
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="truncate font-outfit text-14 sm:text-15 font-semibold text-text">{name}</h2>
                <ChannelIcon channel={conversation.channelType} size={12} className="shrink-0" />
                {conversation.customer.name && conversation.customer.handleOrPhone && (
                  <span className="truncate text-12 text-text-muted">
                    • {conversation.customer.handleOrPhone}
                  </span>
                )}
              </div>

              {/* Row 2: Status, Tag, Countdown, Assignee - neatly aligned together */}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-11">
                {esc ? (
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-10 font-medium text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    <span>Escalated · {escalationReasonLabel(esc.reason)}</span>
                  </span>
                ) : (
                  <ConvStateChip state={conversation.state} />
                )}
                {conversation.tag && <TagBadge tag={conversation.tag} />}
                <WindowCountdown windowClosesAt={conversation.windowClosesAt} />
                {esc && (
                  <span className="text-11 text-text-muted truncate">
                    • {esc.assignedTo
                      ? `Assigned to ${esc.assignedTo.id === user?.id ? "you" : esc.assignedTo.name}`
                      : "Unassigned"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isAdmin && <PauseResumeButton conversation={conversation} />}
            {canResolve && (
              <button
                type="button"
                onClick={() => setConfirmResolve(true)}
                disabled={resolve.isPending || reply.isPending}
                aria-busy={resolve.isPending || undefined}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-11 font-medium text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-3"
                title="Mark resolved and hand back to the AI"
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{resolve.isPending ? "Resolving…" : "Mark resolved"}</span>
                <span className="sm:hidden">Resolve</span>
              </button>
            )}
            {headerActions}
          </div>
        </div>
      </header>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 custom-scrollbar md:p-6"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {messages.length === 0 && !pendingText ? (
          <EmptyState
            size="compact"
            title="No messages yet"
            description="When this customer sends a message or you reply, it will appear here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <div className="my-2 self-center rounded-full border border-border bg-surface px-3 py-1 text-11 font-medium text-text-muted shadow-xs">
                      {formatDayLabel(m.createdAt)}
                    </div>
                  )}
                  <MessageBubble message={m} senderLabel={labelFor(m)} />
                </Fragment>
              );
            })}
            {(pendingText || (pendingReply?.mediaUrls && pendingReply.mediaUrls.length > 0)) && (
              <MessageBubble
                pending
                senderLabel="You"
                message={{
                  id: "pending",
                  senderType: user?.role === "staff" ? "staff" : "owner",
                  content: pendingText || null,
                  mediaUrls: pendingReply?.mediaUrls ?? [],
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
        onSendTemplate={handleSendTemplate}
        sending={reply.isPending}
        disabled={resolve.isPending}
        windowClosed={windowClosed}
        channel={conversation.channelType}
        customerName={name}
      />

      <ConfirmDialog
        isOpen={confirmResolve}
        onClose={() => setConfirmResolve(false)}
        onConfirm={handleResolve}
        title="Resolve conversation?"
        description="This hands the chat back to the AI assistant. Routine questions will be answered automatically again."
        confirmLabel="Confirm & hand to AI"
      />
    </section>
  );
}
