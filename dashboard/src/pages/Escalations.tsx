import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  UserCheck,
  UserPlus,
  ArrowRight,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext.tsx";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { SkeletonCard } from "../components/shared/Skeleton.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { WindowCountdown } from "../components/inbox/WindowCountdown.tsx";
import { AssignModal } from "../components/escalations/AssignModal.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { useEscalations } from "../hooks/useEscalations.ts";
import { useResolve } from "../hooks/useConversations.ts";
import { useNow } from "../hooks/useNow.ts";
import { escalationReasonLabel } from "../lib/escalationReasons.ts";
import { customerLabel, formatDateTime, formatDuration } from "../lib/format.ts";
import { ESCALATION_REASONS, type EscalationListItem } from "../types/index.ts";

type FilterType = "all" | "unassigned" | "mine";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Seconds since an ISO timestamp (never negative). */
function secondsSince(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 1000);
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function WaitBadge({ createdAt, now }: { createdAt: string; now: number }) {
  const seconds = secondsSince(createdAt, now);
  const label = formatDuration(seconds);
  const long = seconds * 1000 > ONE_HOUR_MS;
  return (
    <span
      title={`Escalated ${formatDateTime(createdAt)}`}
      className={
        long
          ? "inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded text-11 font-bold bg-red-500/15 text-red-600 dark:text-red-400 whitespace-nowrap"
          : "inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded text-11 font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap"
      }
    >
      <Clock className="w-3 h-3" aria-hidden /> Waiting {label}
    </span>
  );
}

function ReasonPill({ reason, size = "md" }: { reason: string; size?: "sm" | "md" }) {
  return (
    <span
      className={
        size === "md"
          ? "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-11 font-semibold bg-red-500/10 text-red-600 dark:text-red-400"
          : "inline-flex items-center px-2 py-0.5 rounded text-11 font-semibold bg-red-500/10 text-red-600 dark:text-red-400 whitespace-nowrap"
      }
      title={`Escalation reason: ${escalationReasonLabel(reason)}`}
    >
      {size === "md" && <AlertTriangle className="w-3 h-3" aria-hidden />}
      {escalationReasonLabel(reason)}
    </span>
  );
}

function LastMessageText({ escalation }: { escalation: EscalationListItem }) {
  const last = escalation.conversation.lastMessage;
  const text = last?.content?.trim();
  if (text) return <>“{text}”</>;
  return <span className="italic text-text-muted/80">{last ? "Attachment" : "No messages"}</span>;
}

/** Per-conversation resolve button (useResolve is bound to one conversation id). */
function ResolveButton({ conversationId, customerName }: { conversationId: string; customerName: string }) {
  const resolve = useResolve(conversationId);
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (resolve.isPending) return;
    resolve.mutate(undefined, {
      onSuccess: () => toast.success("Escalation resolved", { description: "Handed back to the AI" }),
      onError: (err) => toast.error(err.message),
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={resolve.isPending}
      aria-label={`Resolve escalation for ${customerName}`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-11 font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
    >
      {resolve.isPending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
      {resolve.isPending ? "Resolving…" : "Resolve"}
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Escalations() {
  usePageTitle("Escalations");
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const userId = user?.id;
  const now = useNow(30_000);

  const escalationsQuery = useEscalations();
  const { data, isPending, isError, error, refetch } = escalationsQuery;

  const [filterType, setFilterType] = useState<FilterType>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [assigning, setAssigning] = useState<EscalationListItem | null>(null);

  // Open escalations in this user's scope. The server already scopes staff to
  // assigned-to-them + unassigned; filter defensively here too.
  const scoped = useMemo(() => {
    const open = (data ?? []).filter((e) => !e.resolvedAt);
    if (isAdmin) return open;
    return open.filter((e) => e.assignedToUserId === null || e.assignedToUserId === userId);
  }, [data, isAdmin, userId]);

  const unassignedCount = scoped.filter((e) => e.assignedToUserId === null).length;
  const mineCount = scoped.filter((e) => userId !== undefined && e.assignedToUserId === userId).length;
  const totalOpen = scoped.length;

  const oldestCreatedAt = useMemo(() => {
    let oldest: string | null = null;
    for (const e of scoped) {
      if (oldest === null || new Date(e.createdAt).getTime() < new Date(oldest).getTime()) oldest = e.createdAt;
    }
    return oldest;
  }, [scoped]);
  const longestWait = oldestCreatedAt ? formatDuration(secondsSince(oldestCreatedAt, now)) : "—";

  // Reason options: only reasons present in the data (plus the selected one, so the select never goes blank).
  const reasonOptions = useMemo(() => {
    const present = new Set<string>(scoped.map((e) => e.reason));
    if (reasonFilter !== "all") present.add(reasonFilter);
    const known: string[] = ESCALATION_REASONS.filter((r) => present.has(r));
    const unknown = [...present].filter((r) => !(ESCALATION_REASONS as readonly string[]).includes(r));
    return [...known, ...unknown];
  }, [scoped, reasonFilter]);

  const filteredEscalations = useMemo(
    () =>
      scoped.filter((e) => {
        if (filterType === "unassigned" && e.assignedToUserId !== null) return false;
        if (filterType === "mine" && (userId === undefined || e.assignedToUserId !== userId)) return false;
        if (reasonFilter !== "all" && e.reason !== reasonFilter) return false;
        return true;
      }),
    [scoped, filterType, reasonFilter, userId],
  );

  const openEscalation = (e: EscalationListItem) => {
    const id = encodeURIComponent(e.conversation.id);
    navigate(isAdmin ? `/inbox?c=${id}` : `/conversations/${id}`);
  };

  const onOpenKey = (ev: KeyboardEvent<HTMLElement>, e: EscalationListItem) => {
    if (ev.target !== ev.currentTarget) return;
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      openEscalation(e);
    }
  };

  const assigneeLabel = (e: EscalationListItem): string => {
    if (e.assignedToUserId !== null && e.assignedToUserId === userId) return "You";
    return e.assignedTo?.name ?? (e.assignedToUserId ? "Assigned" : "Unassigned");
  };

  const openAssign = (ev: MouseEvent<HTMLButtonElement>, e: EscalationListItem) => {
    ev.stopPropagation();
    setAssigning(e);
  };

  const clearFilters = () => {
    setFilterType("all");
    setReasonFilter("all");
  };

  const statValue = (value: string | number) => (isPending ? "—" : value);

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
      active ? "bg-primary text-primary-foreground font-semibold" : "bg-surface-muted text-text-muted hover:text-text"
    }`;

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading escalations">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  } else if (isError) {
    content = (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load escalations"
          description={error.message}
          action={{ label: "Try again", onClick: () => void refetch() }}
        />
      </div>
    );
  } else if (scoped.length === 0) {
    content = (
      <div className="p-12 text-center rounded-2xl border border-border bg-surface space-y-3">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-16 font-bold font-outfit text-text">All caught up!</h3>
        <p className="text-13 text-text-muted max-w-sm mx-auto">
          There are no pending escalations waiting for human handling right now.
        </p>
      </div>
    );
  } else if (filteredEscalations.length === 0) {
    content = (
      <div className="p-6 text-center rounded-xl border border-border bg-surface">
        <p className="text-13 text-text-muted">No escalations match these filters.</p>
        <button
          type="button"
          onClick={clearFilters}
          className="mt-2 text-12 font-semibold text-primary-text hover:underline cursor-pointer"
        >
          Clear filters
        </button>
      </div>
    );
  } else if (viewMode === "cards") {
    content = (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEscalations.map((e) => {
          const conv = e.conversation;
          const name = customerLabel(conv.customer);
          return (
            <div
              key={e.id}
              role="link"
              tabIndex={0}
              aria-label={`Open escalation: ${name}`}
              onClick={() => openEscalation(e)}
              onKeyDown={(ev) => onOpenKey(ev, e)}
              className="p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-14 font-outfit text-primary-text">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-14 font-bold font-outfit text-text truncate">{name}</h4>
                      <div className="flex items-center gap-1.5 text-11 text-text-muted min-w-0">
                        <ChannelIcon channel={conv.channelType} size={11} />
                        <span className="truncate">{conv.customer.handleOrPhone}</span>
                      </div>
                    </div>
                  </div>
                  <WaitBadge createdAt={e.createdAt} now={now} />
                </div>

                {/* Reason + reply window */}
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                  <ReasonPill reason={e.reason} />
                  <WindowCountdown windowClosesAt={conv.windowClosesAt} />
                </div>

                {/* Last Message Excerpt */}
                <p className="text-12 text-text-muted line-clamp-3 break-words [overflow-wrap:anywhere] bg-surface-muted p-2.5 rounded-lg border border-border/40 italic">
                  <span className="sr-only">Last message: </span>
                  <LastMessageText escalation={e} />
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50 text-12 text-text-muted">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={(ev) => openAssign(ev, e)}
                    onKeyDown={(ev) => ev.stopPropagation()}
                    aria-label={`${e.assignedToUserId ? "Reassign" : "Assign"} escalation for ${name}`}
                    className="inline-flex min-w-0 items-center gap-1.5 px-2 py-1 rounded-md bg-surface-muted hover:bg-surface border border-border/70 text-text text-11 font-medium transition-colors cursor-pointer"
                  >
                    {e.assignedToUserId ? (
                      <UserCheck className="w-3 h-3 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <UserPlus className="w-3 h-3 shrink-0 text-primary" aria-hidden />
                    )}
                    <span className="truncate">{assigneeLabel(e)}</span>
                  </button>
                ) : (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-11 font-medium text-text">
                    <UserCheck className="w-3 h-3 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{assigneeLabel(e)}</span>
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <ResolveButton conversationId={conv.id} customerName={name} />
                  <span className="text-primary font-semibold inline-flex items-center gap-0.5 text-12" aria-hidden>
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    content = (
      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        <table className="w-full text-left text-13">
          <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
            <tr>
              <th className="p-3.5">Customer</th>
              <th className="p-3.5">Channel</th>
              <th className="p-3.5">Reason</th>
              <th className="p-3.5">Excerpt</th>
              <th className="p-3.5">Waiting Time</th>
              <th className="p-3.5">Reply Window</th>
              <th className="p-3.5">Assignee</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredEscalations.map((e) => {
              const conv = e.conversation;
              const name = customerLabel(conv.customer);
              return (
                <tr
                  key={e.id}
                  tabIndex={0}
                  aria-label={`Open escalation: ${name}`}
                  onClick={() => openEscalation(e)}
                  onKeyDown={(ev) => onOpenKey(ev, e)}
                  className="hover:bg-surface-muted transition-colors cursor-pointer focus:outline-none focus-visible:bg-surface-muted"
                >
                  <td className="p-3.5">
                    <div className="font-semibold text-text">{name}</div>
                    <div className="text-11 text-text-muted">{conv.customer.handleOrPhone}</div>
                  </td>
                  <td className="p-3.5">
                    <ChannelIcon channel={conv.channelType} size={14} />
                  </td>
                  <td className="p-3.5">
                    <ReasonPill reason={e.reason} size="sm" />
                  </td>
                  <td className="p-3.5 text-text-muted max-w-xs truncate">
                    <LastMessageText escalation={e} />
                  </td>
                  <td className="p-3.5">
                    <WaitBadge createdAt={e.createdAt} now={now} />
                  </td>
                  <td className="p-3.5">
                    <WindowCountdown windowClosesAt={conv.windowClosesAt} />
                  </td>
                  <td className="p-3.5">
                    <span className="text-12 font-medium text-text whitespace-nowrap">{assigneeLabel(e)}</span>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(ev) => openAssign(ev, e)}
                          onKeyDown={(ev) => ev.stopPropagation()}
                          aria-label={`${e.assignedToUserId ? "Reassign" : "Assign"} escalation for ${name}`}
                          className="px-2.5 py-1 rounded-md bg-surface-muted hover:bg-surface border border-border/70 text-text text-11 font-semibold transition-colors cursor-pointer"
                        >
                          {e.assignedToUserId ? "Reassign" : "Assign"}
                        </button>
                      )}
                      <ResolveButton conversationId={conv.id} customerName={name} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Header & Top Stats ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Escalation Queue</span>
            {totalOpen > 0 && (
              <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-red-500 text-white">
                {totalOpen} open
              </span>
            )}
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            {isAdmin
              ? "Customer inquiries requiring human review, custom pricing, or approvals"
              : "Escalations assigned to you or waiting for someone"}
          </p>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "cards" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Cards view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "table" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Table view"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Metric Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Open Escalations</p>
            <p className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums">{statValue(totalOpen)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-500/10 text-red-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Unassigned</p>
            <p className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums">{statValue(unassignedCount)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
            <UserPlus className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-surface flex items-center justify-between">
          <div>
            <p className="text-12 font-medium text-text-muted">Longest Wait</p>
            <p
              className="text-24 font-bold font-outfit text-text mt-0.5 tabular-nums"
              title={oldestCreatedAt ? `Oldest escalation: ${formatDateTime(oldestCreatedAt)}` : undefined}
            >
              {statValue(longestWait)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-teal/10 text-teal">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── Filters Bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-1.5 text-12 font-medium" role="group" aria-label="Assignment filter">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            aria-pressed={filterType === "all"}
            className={chipClass(filterType === "all")}
          >
            All ({totalOpen})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("unassigned")}
            aria-pressed={filterType === "unassigned"}
            className={chipClass(filterType === "unassigned")}
          >
            Unassigned ({unassignedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("mine")}
            aria-pressed={filterType === "mine"}
            className={chipClass(filterType === "mine")}
          >
            Assigned to me ({mineCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-12 text-text-muted font-medium">Reason:</span>
          <div className="relative inline-flex items-center">
            <select
              value={reasonFilter}
              aria-label="Filter by escalation reason"
              onChange={(ev) => setReasonFilter(ev.target.value)}
              className="h-8 pl-2.5 pr-7.5 appearance-none rounded-lg border border-border bg-surface-muted text-12 text-text font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All reasons</option>
              {reasonOptions.map((r) => (
                <option key={r} value={r}>
                  {escalationReasonLabel(r)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
          </div>
        </div>
      </div>

      {/* ─── Content: Cards vs Table ─────────────────────────────────────────── */}
      {content}

      {isAdmin && <AssignModal escalation={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}
