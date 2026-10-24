import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Filter,
  Loader2,
  MessagesSquare,
  PanelRightClose,
  PanelRightOpen,
  Search,
  SearchX,
  Star,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { isApiError } from "../api/client.ts";
import { ChatView } from "../components/inbox/ChatView.tsx";
import { ConvStateChip } from "../components/inbox/ConvStateChip.tsx";
import { WindowCountdown } from "../components/inbox/WindowCountdown.tsx";
import { EscalationBadge } from "../components/escalations/EscalationBadge.tsx";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { OptedOutBadge } from "../components/shared/CustomerChips.tsx";
import { CustomerNotesField } from "../components/shared/CustomerNotesField.tsx";
import { Skeleton, SkeletonTableRow } from "../components/shared/Skeleton.tsx";
import { TagBadge } from "../components/ui/Badge.tsx";
import {
  useConversation,
  useInfiniteConversations,
  useMarkRead,
  type ConversationFilters,
} from "../hooks/useConversations.ts";
import { useCustomer, useCustomerOrders, useUpdateCustomer } from "../hooks/useCustomers.ts";
import { cn } from "../lib/cn.ts";
import { formatRupees } from "../lib/customers.ts";
import { customerLabel, formatDateTime, formatRelative, formatShortDate, humanize } from "../lib/format.ts";
import {
  CHANNEL_TYPES,
  type ChannelType,
  type ConversationDetail,
  type ConversationListItem,
  type UpdateCustomerRequest,
} from "../types/index.ts";

type FilterState = "all" | "unread" | "ai_active" | "escalated" | "owner_handling" | "paused";

const FILTERS: Array<{ key: FilterState; label: string; danger?: boolean }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "ai_active", label: "AI active" },
  { key: "escalated", label: "Escalated", danger: true },
  { key: "owner_handling", label: "Human handling" },
  { key: "paused", label: "Paused" },
];

const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function pickChannel(value: string | null): ChannelType | undefined {
  return value && (CHANNEL_TYPES as readonly string[]).includes(value) ? (value as ChannelType) : undefined;
}

function previewPrefix(item: ConversationListItem): string {
  const sender = item.lastMessage?.senderType;
  if (sender === "ai") return "AI: ";
  if (sender === "owner" || sender === "staff") return "You: ";
  return "";
}

// ─── Conversation list row ────────────────────────────────────────────────────

function ConversationRow({
  item,
  selected,
  onSelect,
}: {
  item: ConversationListItem;
  selected: boolean;
  onSelect: (item: ConversationListItem) => void;
}) {
  const name = customerLabel(item.customer);
  const when = item.lastMessageAt ?? item.lastMessage?.createdAt ?? item.updatedAt;
  const content = item.lastMessage?.content?.trim();
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-current={selected ? "true" : undefined}
      data-conversation-id={item.id}
      className={cn(
        "relative flex w-full items-start gap-2.5 p-2.5 sm:p-3 text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        selected
          ? "border-l-[3px] border-l-primary bg-primary-soft/50 dark:bg-primary-soft/20 shadow-2xs"
          : item.state === "escalated"
            ? "border-l-[3px] border-l-rose-500 bg-surface hover:bg-surface-muted/80"
            : "border-l-[3px] border-l-transparent bg-surface hover:bg-surface-muted/80",
      )}
    >
      {/* Avatar Column */}
      <div className="relative shrink-0 mt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-outfit text-12 font-bold text-primary-text">
          {name.charAt(0).toUpperCase() || "?"}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5 shadow-2xs">
          <ChannelIcon channel={item.channelType} size={10} />
        </span>
      </div>

      {/* Content Column */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <span className={cn("block truncate text-13 text-text", item.unread ? "font-bold" : "font-semibold")}>
              {name}
            </span>
            {item.customer.name && (
              <p className="truncate text-11 text-text-muted">{item.customer.handleOrPhone}</p>
            )}
          </div>

          <div className="shrink-0 text-right pt-0.5">
            <time dateTime={when} title={formatDateTime(when)} className="text-11 text-text-muted tabular-nums">
              {formatRelative(when)}
            </time>
            {item.unread && (
              <span className="ml-auto mt-1 block h-1.5 w-1.5 rounded-full bg-primary" aria-label="Unread" role="img" />
            )}
          </div>
        </div>

        <p className={cn("line-clamp-1 text-12 leading-snug", item.unread ? "text-text font-medium" : "text-text-muted")}>
          {item.lastMessage ? (
            content ? (
              `${previewPrefix(item)}${content}`
            ) : (
              <span className="italic">{previewPrefix(item)}Attachment</span>
            )
          ) : (
            <span className="italic">No messages yet</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1 pt-0.5 text-10">
          <ConvStateChip state={item.state} />
          {item.openEscalation && <EscalationBadge reason={item.openEscalation.reason} />}
        </div>
      </div>
    </button>
  );
}

// ─── Middle pane ─────────────────────────────────────────────────────────────

function ConversationPane({
  id,
  onBack,
  showPanel,
  onTogglePanel,
  onLoaded,
}: {
  id: string;
  onBack: () => void;
  showPanel: boolean;
  onTogglePanel: () => void;
  onLoaded: (c: ConversationDetail | undefined) => void;
}) {
  const query = useConversation(id);

  useEffect(() => {
    onLoaded(query.data);
  }, [query.data, onLoaded]);

  if (query.isPending) {
    return (
      <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading conversation">
        <div className="flex items-center gap-3 border-b border-border bg-surface p-3.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-12 w-2/3 rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
          <Skeleton className="h-16 w-3/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404;
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-surface p-2 md:hidden">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-3 py-1.5 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
          >
            ← Back to inbox
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          {notFound ? (
            <SearchX className="mb-2 h-8 w-8 text-text-muted opacity-60" aria-hidden />
          ) : (
            <AlertCircle className="mb-2 h-8 w-8 text-danger" aria-hidden />
          )}
          <p className="text-14 font-semibold text-text">
            {notFound ? "Conversation not found" : "Couldn't load this conversation"}
          </p>
          <p className="mt-1 text-12 text-text-muted">{notFound ? "It may have been removed." : query.error.message}</p>
          {!notFound && (
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ChatView
      key={id}
      conversation={query.data}
      onBack={onBack}
      backOnlyOnMobile
      headerActions={
        <button
          type="button"
          onClick={onTogglePanel}
          className={cn(
            "rounded-lg border border-border p-1.5 transition-colors cursor-pointer",
            showPanel
              ? "bg-surface-muted text-text ring-1 ring-primary/20"
              : "bg-surface text-text-muted hover:text-text",
          )}
          title="Toggle customer details panel"
          aria-label="Toggle customer details panel"
          aria-pressed={showPanel}
        >
          {showPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
      }
    />
  );
}

// ─── Customer panel ──────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-12">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">{children}</dd>
    </div>
  );
}

/** Admin-only customer data for the panel: flags, city, spend, recent orders, editable notes. */
function CustomerInsights({ customerId, fallbackNotes }: { customerId: string; fallbackNotes: string | null }) {
  const navigate = useNavigate();
  const customerQuery = useCustomer(customerId);
  const ordersQuery = useCustomerOrders(customerId);
  const update = useUpdateCustomer();
  const c = customerQuery.data;

  const save = (body: UpdateCustomerRequest, success?: string) => {
    if (!c) return;
    update.mutate(
      { id: c.id, body },
      {
        onSuccess: () => {
          if (success) toast.success(success, { description: customerLabel(c) });
        },
        onError: (err) => toast.error("Couldn't update customer", { description: err.message }),
      },
    );
  };

  if (customerQuery.isPending) {
    return (
      <div className="space-y-2 border-t border-border/60 pt-3" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (customerQuery.isError || !c) {
    return (
      <div className="space-y-3 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between text-11 text-text-muted">
          <span>Couldn't load orders and flags.</span>
          <button
            type="button"
            onClick={() => void customerQuery.refetch()}
            className="font-semibold text-text hover:underline cursor-pointer"
          >
            Retry
          </button>
        </div>
        {fallbackNotes && (
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-muted p-2 text-12 text-text">
            {fallbackNotes}
          </p>
        )}
      </div>
    );
  }

  const orders = ordersQuery.data ?? [];
  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => save({ isFavourite: !c.isFavourite }, c.isFavourite ? "Removed from favourites" : "Marked as favourite")}
            aria-pressed={c.isFavourite}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-11 font-medium transition-colors cursor-pointer",
              c.isFavourite
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border text-text-muted hover:text-text",
            )}
          >
            <Star className={cn("h-3 w-3", c.isFavourite && "fill-amber-500 text-amber-500")} />
            Favourite
          </button>
          <button
            type="button"
            onClick={() => save({ isPriority: !c.isPriority }, c.isPriority ? "Priority removed" : "Marked as priority")}
            aria-pressed={c.isPriority}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-11 font-medium transition-colors cursor-pointer",
              c.isPriority
                ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "border-border text-text-muted hover:text-text",
            )}
          >
            <Zap className={cn("h-3 w-3", c.isPriority && "fill-rose-500 text-rose-500")} />
            Priority
          </button>
        </div>
        {c.optedOut && <OptedOutBadge />}
      </div>

      <dl className="divide-y divide-border/60">
        <DetailRow label="City">{c.city ?? "Unknown"}</DetailRow>
        <DetailRow label="Orders">{c.ordersCount}</DetailRow>
        <DetailRow label="Total spend">{formatRupees(c.totalSpend)}</DetailRow>
      </dl>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Recent orders</p>
          {orders.length > 0 && (
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className="text-11 font-semibold text-primary-text hover:underline cursor-pointer"
            >
              All orders
            </button>
          )}
        </div>
        {ordersQuery.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : ordersQuery.isError ? (
          <p className="text-11 text-text-muted">Couldn't load orders.</p>
        ) : orders.length === 0 ? (
          <p className="text-11 text-text-muted">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {orders.slice(0, 3).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-12">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text">{o.orderNo}</p>
                  <p className="text-11 text-text-muted">
                    {humanize(o.status)} · {formatShortDate(o.createdAt)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-text">{formatRupees(o.totalAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CustomerNotesField
        label="Notes"
        rows={3}
        value={c.notes}
        saving={update.isPending}
        onSave={(notes) => save({ notes }, "Notes saved")}
      />
    </div>
  );
}

function CustomerPanel({ conversation, onClose }: { conversation: ConversationDetail; onClose: () => void }) {
  const { customer } = conversation;
  const name = customerLabel(customer);
  return (
    <>
      {/* Backdrop on screens < xl to allow full width for chat */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200 xl:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[88vw] shrink-0 flex-col space-y-4 overflow-y-auto border-l border-border bg-surface p-4 shadow-2xl animate-in slide-in-from-right duration-200 custom-scrollbar sm:w-[340px] xl:relative xl:inset-auto xl:z-auto xl:w-[300px] xl:shadow-none 2xl:w-[320px]"
        aria-label="Customer profile"
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h3 className="font-outfit text-15 font-bold text-text">Customer Profile</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text cursor-pointer"
            aria-label="Close customer profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-border/60 bg-surface-muted p-3.5 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/20 font-outfit text-22 font-bold text-primary-text">
            {name.charAt(0).toUpperCase() || "?"}
          </div>
          <h4 className="font-outfit text-15 font-bold text-text">{name}</h4>
          <div className="mt-0.5 flex items-center justify-center gap-1.5 text-11 text-text-muted">
            <ChannelIcon channel={conversation.channelType} size={12} />
            <span className="truncate">{customer.handleOrPhone}</span>
          </div>
        </div>

        <dl className="divide-y divide-border/60">
          <DetailRow label="Channel">{conversation.channelType === "whatsapp" ? "WhatsApp" : "Instagram"}</DetailRow>
          <DetailRow label="Language">{customer.language ? humanize(customer.language) : "Unknown"}</DetailRow>
          <DetailRow label="Status">
            <ConvStateChip state={conversation.state} />
          </DetailRow>
          <DetailRow label="Tag">{conversation.tag ? <TagBadge tag={conversation.tag} /> : "None"}</DetailRow>
          <DetailRow label="Reply window">
            <WindowCountdown windowClosesAt={conversation.windowClosesAt} />
          </DetailRow>
          <DetailRow label="Customer since">{formatShortDate(customer.createdAt)}</DetailRow>
        </dl>

        <CustomerInsights key={conversation.customerId} customerId={conversation.customerId} fallbackNotes={customer.notes} />
      </aside>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Inbox() {
  usePageTitle("Inbox");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("c");
  const channel = pickChannel(searchParams.get("channel"));

  const [filterState, setFilterState] = useState<FilterState>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  // Default customer panel open only on xl+ screens (>= 1280px) to prevent crushing chat on tablet/mobile
  const [showCustomerPanel, setShowCustomerPanel] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1280 : false,
  );
  const [openConversation, setOpenConversation] = useState<ConversationDetail | undefined>(undefined);

  const filters: ConversationFilters = {
    channel,
    search: search || undefined,
    unread: filterState === "unread" || undefined,
    state: filterState === "all" || filterState === "unread" ? undefined : filterState,
  };
  const query = useInfiniteConversations(filters);
  const markRead = useMarkRead();

  const conversations = useMemo(() => {
    const seen = new Set<string>();
    const out: ConversationListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const c of page.conversations) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }, [query.data]);
  const total = query.data?.pages[0]?.pagination.total;

  const updateParams = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (id !== selectedId) updateParams({ c: id });
    },
    [selectedId, updateParams],
  );

  // Mark the open conversation read when it is (or becomes) unread. Fire-and-forget.
  const selectedItem = conversations.find((c) => c.id === selectedId);
  const markReadRef = useRef(markRead.mutate);
  markReadRef.current = markRead.mutate;
  const pendingRead = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || !selectedItem?.unread || pendingRead.current === selectedId) return;
    pendingRead.current = selectedId;
    markReadRef.current(selectedId, {
      onSettled: () => {
        pendingRead.current = null;
      },
    });
  }, [selectedId, selectedItem?.unread, selectedItem?.lastCustomerMessageAt]);

  // Clear the panel's data when the selection changes.
  useEffect(() => {
    setOpenConversation(undefined);
  }, [selectedId]);

  // Desktop auto-selection: on tablet/desktop (>= 768px), auto-select first conversation if none selected
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) return;
    const first = conversations[0];
    if (!selectedId && first && !query.isLoading) {
      updateParams({ c: first.id }, true);
    }
  }, [selectedId, conversations, query.isLoading, updateParams]);

  // J/K (or arrows) move through the list.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      const down = e.key === "j" || e.key === "ArrowDown";
      const up = e.key === "k" || e.key === "ArrowUp";
      if (!down && !up) return;
      e.preventDefault();
      const idx = conversations.findIndex((c) => c.id === selectedId);
      const next = down ? conversations[idx + 1] : idx > 0 ? conversations[idx - 1] : undefined;
      if (next) selectConversation(next.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [conversations, selectedId, selectConversation]);

  // Infinite scroll: load the next page when the sentinel comes into view.
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: listRef.current, rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, conversations.length]);

  const filtersActive = filterState !== "all" || Boolean(search) || Boolean(channel);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-bg">
      {/* ─── Pane 1: Conversation List (Responsive width) ─────────────────────────── */}
      <div
        className={cn(
          selectedId ? "hidden md:flex" : "flex",
          "z-10 h-full w-full shrink-0 flex-col border-r border-border bg-surface md:w-[320px] lg:w-[340px] xl:w-[360px]",
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-border/70 p-3 sm:p-3.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden />
            <input
              type="search"
              placeholder="Search conversations... (J/K to move)"
              aria-label="Search conversations"
              value={searchInput}
              maxLength={100}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-muted py-1.5 pl-9 pr-3.5 text-13 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 text-12 font-medium custom-scrollbar"
            role="group"
            aria-label="Filter conversations"
          >
            {FILTERS.map((f) => {
              const active = filterState === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilterState(f.key)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 transition-colors cursor-pointer",
                    f.danger
                      ? active
                        ? "bg-danger font-semibold text-white"
                        : "bg-surface-muted text-danger hover:bg-danger/10"
                      : active
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "bg-surface-muted text-text-muted hover:text-text",
                  )}
                >
                  {f.label}
                  {active && total !== undefined && ` (${total})`}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={listRef}
          className="flex-1 divide-y divide-border/40 overflow-y-auto custom-scrollbar"
          aria-busy={query.isFetching || undefined}
        >
          {query.isPending ? (
            <div className="px-3.5" aria-label="Loading conversations">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonTableRow key={i} />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-8 text-center text-text-muted">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
              <p className="text-13 font-medium text-text">Couldn't load conversations</p>
              <p className="mt-1 text-11">{query.error.message}</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-3 rounded-lg border border-border bg-surface px-3 py-1.5 text-12 font-medium text-text hover:bg-surface-muted cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <Filter className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden />
              <p className="text-13 font-medium text-text">
                {filtersActive ? "No conversations found" : "No conversations yet"}
              </p>
              <p className="mt-1 text-11">
                {filtersActive
                  ? "Try clearing filters or search query"
                  : "Customer messages from WhatsApp and Instagram will appear here."}
              </p>
            </div>
          ) : (
            <>
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  item={c}
                  selected={c.id === selectedId}
                  onSelect={(item) => selectConversation(item.id)}
                />
              ))}
              {hasNextPage && (
                <div ref={sentinelRef} className="flex justify-center p-3">
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-12 font-medium text-text hover:bg-surface-muted cursor-pointer disabled:opacity-60"
                  >
                    {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Pane 2: Middle Chat Area (Flex-1) ─────────────────────────────────── */}
      <div
        className={cn(
          selectedId ? "flex" : "hidden md:flex",
          "relative h-full min-w-0 flex-1 flex-col bg-surface-muted/30",
        )}
      >
        {selectedId ? (
          <ConversationPane
            id={selectedId}
            onBack={() => updateParams({ c: null })}
            showPanel={showCustomerPanel}
            onTogglePanel={() => setShowCustomerPanel((v) => !v)}
            onLoaded={setOpenConversation}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-text shadow-xs">
              <MessagesSquare className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="font-outfit text-16 font-bold text-text">Select a conversation</h3>
            <p className="mt-1.5 text-13 text-text-muted">Pick a customer on the left to read the thread and reply.</p>
          </div>
        )}
      </div>

      {/* ─── Pane 3: Collapsible Customer Profile Panel ─────────────────────────── */}
      {showCustomerPanel && selectedId && openConversation && openConversation.id === selectedId && (
        <CustomerPanel conversation={openConversation} onClose={() => setShowCustomerPanel(false)} />
      )}
    </div>
  );
}
