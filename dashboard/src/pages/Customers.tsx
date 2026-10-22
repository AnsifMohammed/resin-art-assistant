import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Info,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Search,
  Star,
  Table as TableIcon,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.tsx";
import { CustomerNotesField } from "../components/shared/CustomerNotesField.tsx";
import { CustomerSegmentChips, OptedOutBadge } from "../components/shared/CustomerChips.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { SlideOver } from "../components/shared/SlideOver.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { useCustomer, useCustomerOrders, useInfiniteCustomers, useUpdateCustomer } from "../hooks/useCustomers.ts";
import { useDebounced } from "../hooks/useDebounced.ts";
import { CUSTOMER_LANGUAGES, formatRupees, languageLabel } from "../lib/customers.ts";
import { customerLabel, formatDateTime, formatRelative, formatShortDate, humanize } from "../lib/format.ts";
import {
  SEGMENT_LABELS,
  SEGMENTS,
  type ChannelType,
  type CustomerListItem,
  type CustomerListParams,
  type CustomerSegment,
  type CustomerSort,
  type Segment,
  type UpdateCustomerRequest,
} from "../types/index.ts";

const SEARCH_DEBOUNCE_MS = 300;
/** Virtual table: fixed row height (px), rows rendered beyond the viewport, and prefetch distance. */
const TABLE_ROW_HEIGHT = 56;
const TABLE_OVERSCAN = 8;
const TABLE_PREFETCH_ROWS = 10;
/** Shared by the sticky header and every virtual row so the columns stay aligned. */
const TABLE_COLS =
  "grid grid-cols-[minmax(220px,2.2fr)_minmax(100px,1fr)_minmax(170px,1.6fr)_72px_110px_100px_110px_80px]";

const SORT_LABELS: Record<CustomerSort, string> = {
  recent: "Sort by Recent",
  spend: "Sort by Spend",
  orders: "Sort by Orders",
  name: "Sort by Name",
};

function lastActive(c: CustomerListItem): string {
  return c.lastMessageAt ? formatRelative(c.lastMessageAt) : "No messages";
}

/** Up to two initials from the name, else the first character of the handle. */
function initials(c: CustomerListItem): string {
  const words = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0)
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  return c.handleOrPhone.replace(/^[@+]/, "").charAt(0).toUpperCase() || "?";
}

/** Average order value; null when the customer has no orders. */
function averageOrderValue(c: CustomerListItem): number | null {
  return c.ordersCount > 0 ? Math.round(c.totalSpend / c.ordersCount) : null;
}

// ─── Mutations shared by cards, rows and the slide-over ──────────────────────

function useCustomerActions() {
  const update = useUpdateCustomer();
  const save = (c: CustomerListItem, body: UpdateCustomerRequest, success?: string) =>
    update.mutate(
      { id: c.id, body },
      {
        onSuccess: () => {
          if (success) toast.success(success, { description: customerLabel(c) });
        },
        onError: (err) => toast.error("Couldn't update customer", { description: err.message }),
      },
    );
  return {
    pending: update.isPending,
    pendingId: update.isPending ? update.variables?.id : undefined,
    toggleFavourite: (c: CustomerListItem) =>
      save(c, { isFavourite: !c.isFavourite }, c.isFavourite ? "Removed from favourites" : "Marked as favourite"),
    togglePriority: (c: CustomerListItem) =>
      save(c, { isPriority: !c.isPriority }, c.isPriority ? "Priority removed" : "Marked as priority"),
    save,
  };
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function FlagButtons({
  customer,
  onFavourite,
  onPriority,
  size = 16,
}: {
  customer: CustomerListItem;
  onFavourite: () => void;
  onPriority: () => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPriority();
        }}
        aria-pressed={customer.isPriority}
        aria-label={customer.isPriority ? "Remove priority" : "Mark as priority"}
        title={customer.isPriority ? "Remove priority" : "Mark as priority"}
        className="p-1 rounded-md hover:bg-surface-muted text-text-muted transition-colors cursor-pointer"
      >
        <Zap
          style={{ width: size, height: size }}
          className={`transition-transform active:scale-125 ${
            customer.isPriority ? "text-rose-500 fill-rose-500" : "text-border hover:text-rose-400"
          }`}
        />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFavourite();
        }}
        aria-pressed={customer.isFavourite}
        aria-label={customer.isFavourite ? "Remove from favourites" : "Mark as favourite"}
        title={customer.isFavourite ? "Remove from favourites" : "Mark as favourite"}
        className="p-1 rounded-md hover:bg-surface-muted text-text-muted transition-colors cursor-pointer"
      >
        <Star
          style={{ width: size, height: size }}
          className={`transition-transform active:scale-125 ${
            customer.isFavourite ? "text-amber-500 fill-amber-500" : "text-border hover:text-amber-400"
          }`}
        />
      </button>
    </div>
  );
}

/** Text value that turns into an input on click; saves on blur/Enter, Escape reverts. */
function InlineEdit({
  value,
  placeholder,
  maxLength,
  onSave,
  className = "",
  inputClassName = "",
  label,
}: {
  value: string | null;
  placeholder: string;
  maxLength: number;
  onSave: (next: string | null) => void;
  className?: string;
  inputClassName?: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    onSave(next ? next : null);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`Edit ${label.toLowerCase()}`}
        className={`rounded-md px-1 hover:bg-surface cursor-text ${value ? "" : "italic text-text-muted"} ${className}`}
      >
        {value || placeholder}
      </button>
    );
  }
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      className={`rounded-lg border border-border bg-surface px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-primary ${inputClassName}`}
    />
  );
}

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-12">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">{children}</dd>
    </div>
  );
}

// ─── Detail slide-over ───────────────────────────────────────────────────────

function CustomerDetail({ initial, open, onClose }: { initial: CustomerListItem; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const detail = useCustomer(initial.id);
  const orders = useCustomerOrders(initial.id);
  const actions = useCustomerActions();
  const [confirmOptOut, setConfirmOptOut] = useState(false);
  const c = detail.data ?? initial;
  const name = customerLabel(c);

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Customer Profile"
        subtitle={c.optedOut ? undefined : "Click a name or city to edit"}
        badge={c.optedOut ? <OptedOutBadge /> : undefined}
        widthClass="max-w-md"
      >
        <div className="text-center p-4 rounded-xl border border-border bg-surface-muted">
          <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary mx-auto flex items-center justify-center font-bold text-24 font-outfit text-primary-text mb-2">
            {name.charAt(0).toUpperCase() || "?"}
          </div>
          <InlineEdit
            label="Name"
            value={c.name}
            placeholder="Add name"
            maxLength={100}
            onSave={(next) => actions.save(c, { name: next }, "Name updated")}
            className="text-18 font-bold font-outfit text-text"
            inputClassName="text-14 text-center w-full"
          />
          <div className="flex items-center justify-center gap-1.5 text-12 text-text-muted mt-0.5">
            <ChannelIcon channel={c.channel} size={13} />
            <span>{c.handleOrPhone}</span>
          </div>
          <div className="mt-1 text-12 text-text-muted">
            <InlineEdit
              label="City"
              value={c.city}
              placeholder="Add city"
              maxLength={80}
              onSave={(next) => actions.save(c, { city: next }, "City updated")}
              inputClassName="text-12 text-center"
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <FlagButtons
              customer={c}
              size={18}
              onFavourite={() => actions.toggleFavourite(c)}
              onPriority={() => actions.togglePriority(c)}
            />
          </div>
          <CustomerSegmentChips customer={c} className="mt-2 justify-center" />
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded-lg border border-border bg-surface-muted">
            <p className="text-11 text-text-muted font-medium">Lifetime Spend</p>
            <p className="text-18 font-bold font-outfit text-text mt-0.5 tabular-nums">{formatRupees(c.totalSpend)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-surface-muted">
            <p className="text-11 text-text-muted font-medium">Orders</p>
            <p className="text-18 font-bold font-outfit text-text mt-0.5 tabular-nums">{c.ordersCount}</p>
          </div>
        </div>

        <dl className="divide-y divide-border/60">
          <ProfileRow label="Channel">{c.channel === "whatsapp" ? "WhatsApp" : "Instagram"}</ProfileRow>
          <ProfileRow label="Handle / phone">{c.handleOrPhone}</ProfileRow>
          <ProfileRow label="Language">{languageLabel(c.language)}</ProfileRow>
          <ProfileRow label="Last active">{lastActive(c)}</ProfileRow>
          <ProfileRow label="Customer since">
            <span title={formatDateTime(c.createdAt)}>{formatShortDate(c.createdAt)}</span>
          </ProfileRow>
        </dl>

        <CustomerNotesField
          value={c.notes}
          saving={actions.pending && actions.pendingId === c.id}
          onSave={(notes) => actions.save(c, { notes }, "Notes saved")}
        />

        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface-muted">
          <div>
            <p className="text-13 font-semibold text-text">Receives broadcasts</p>
            <p className="text-11 text-text-muted">
              {c.optedOut
                ? `Opted out${c.optedOutAt ? ` ${formatRelative(c.optedOutAt)}` : ""}. Replying START re-subscribes.`
                : "Offers and updates via WhatsApp broadcasts"}
            </p>
          </div>
          <Switch
            checked={!c.optedOut}
            label="Receives broadcasts"
            onChange={(next) => {
              if (next) actions.save(c, { optedOut: false }, "Customer opted back in");
              else setConfirmOptOut(true);
            }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">Recent Orders</p>
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className="text-11 font-semibold text-primary-text hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              All orders <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          {orders.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orders.isError ? (
            <div className="p-3 rounded-lg border border-border text-12 text-text-muted flex items-center justify-between">
              <span>Couldn't load orders</span>
              <button
                type="button"
                onClick={() => void orders.refetch()}
                className="font-semibold text-text hover:underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : orders.data.length === 0 ? (
            <p className="p-3 rounded-lg border border-dashed border-border text-12 text-text-muted text-center">
              No orders yet
            </p>
          ) : (
            <ul className="divide-y divide-border/50 rounded-lg border border-border">
              {orders.data.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => navigate("/orders")}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-muted cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-13 font-semibold text-text truncate">{o.orderNo}</p>
                      <p className="text-11 text-text-muted">
                        {humanize(o.status)} · {o.itemsCount} item{o.itemsCount === 1 ? "" : "s"} ·{" "}
                        {formatShortDate(o.createdAt)}
                      </p>
                    </div>
                    <span className="text-13 font-bold font-outfit text-text tabular-nums">
                      {formatRupees(o.totalAmount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={!c.conversationId}
          onClick={() => c.conversationId && navigate(`/inbox?c=${encodeURIComponent(c.conversationId)}`)}
          title={c.conversationId ? undefined : "No conversation with this customer yet"}
          className="w-full py-2.5 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{c.conversationId ? "Open Conversation in Inbox" : "No conversation yet"}</span>
        </button>
      </SlideOver>
      {/* Outside the panel: its transform would otherwise trap the fixed overlay. */}
      <ConfirmDialog
        isOpen={confirmOptOut}
        onClose={() => setConfirmOptOut(false)}
        onConfirm={() => actions.save(c, { optedOut: true }, "Customer opted out")}
        title="Opt out of broadcasts?"
        description={`${name} won't receive broadcasts. They can re-subscribe by replying START.`}
        confirmLabel="Opt out"
        tone="warning"
      />
    </>
  );
}

// ─── Virtualized table ───────────────────────────────────────────────────────

type TableChip = CustomerSegment | "opted_out";
const TABLE_CHIP_LABELS: Partial<Record<TableChip, string>> = {
  repeat_buyers: "Repeat buyer",
  new: "New",
  inactive: "Inactive",
  opted_out: "Opted out",
};

/** Segment chips for a table row: at most two, then "+n". Favourite/priority live in the Actions column. */
function TableSegmentChips({ customer }: { customer: CustomerListItem }) {
  const chips: TableChip[] = (["repeat_buyers", "new", "inactive"] as const).filter((s) =>
    customer.segments.includes(s),
  );
  if (customer.optedOut) chips.push("opted_out");
  if (chips.length === 0) return <span className="text-text-muted">—</span>;
  const visible = chips.slice(0, 2);
  const hidden = chips.slice(2);
  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      {visible.map((chip) => (
        <CustomerSegmentChips
          key={chip}
          className="shrink-0 flex-nowrap"
          customer={{
            isFavourite: false,
            isPriority: false,
            optedOut: chip === "opted_out",
            segments: chip === "opted_out" ? [] : [chip],
          }}
        />
      ))}
      {hidden.length > 0 && (
        <span
          className="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-muted text-text-muted border border-border"
          title={hidden.map((h) => TABLE_CHIP_LABELS[h] ?? h).join(", ")}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}

/** `sort` marks headers that re-sort the list when clicked (the API sorts one way per key). */
const TABLE_HEADERS: Array<{ label: string; align?: "right"; sort?: CustomerSort }> = [
  { label: "Customer", sort: "name" },
  { label: "City" },
  { label: "Segments" },
  { label: "Orders", align: "right", sort: "orders" },
  { label: "Total spend", align: "right", sort: "spend" },
  { label: "AOV", align: "right" },
  { label: "Last active", sort: "recent" },
  { label: "Actions", align: "right" },
];

const VIEW_STORAGE_KEY = "customers:view";

/** Saved choice wins; otherwise a table on wide screens and cards on phones. */
function initialViewMode(): "grid" | "table" {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "grid" || saved === "table") return saved;
  } catch {
    // storage blocked (private mode etc.) — fall through to the screen-size default
  }
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "table" : "grid";
}

function CustomerTable({
  rows,
  total,
  loading,
  hasNextPage,
  canFetchMore,
  isFetchingNextPage,
  fetchNextPage,
  resetKey,
  sort,
  onSort,
  onOpen,
  actions,
}: {
  rows: CustomerListItem[];
  total: number;
  loading: boolean;
  hasNextPage: boolean;
  /** False while a refetch or placeholder data is showing, so we never page from stale data. */
  canFetchMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  /** Changes whenever segment/search/filters/sort change; scrolls back to the top. */
  resetKey: string;
  sort: CustomerSort;
  onSort: (sort: CustomerSort) => void;
  onOpen: (c: CustomerListItem) => void;
  actions: ReturnType<typeof useCustomerActions>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TABLE_ROW_HEIGHT,
    overscan: TABLE_OVERSCAN,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? -1;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (lastIndex < 0 || lastIndex < rows.length - TABLE_PREFETCH_ROWS) return;
    if (hasNextPage && canFetchMore && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, canFetchMore, isFetchingNextPage, fetchNextPage]);

  const cell = "px-3.5 flex items-center min-w-0";
  const right = "justify-end text-right";

  return (
    <div
      ref={scrollRef}
      role="table"
      aria-label="Customers"
      aria-rowcount={loading ? -1 : total + 1}
      aria-busy={loading || isFetchingNextPage}
      className="h-[calc(100vh-14rem)] min-h-[420px] overflow-auto rounded-xl border border-border bg-surface custom-scrollbar"
    >
      <div className="min-w-[960px]">
        <div role="rowgroup" className="sticky top-0 z-10">
          <div
            role="row"
            aria-rowindex={1}
            className={`${TABLE_COLS} bg-surface border-b border-border text-11 uppercase font-semibold text-text-muted`}
          >
            {TABLE_HEADERS.map((h) => {
              const active = h.sort !== undefined && h.sort === sort;
              const ascending = h.sort === "name";
              return (
                <div
                  key={h.label}
                  role="columnheader"
                  aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
                  className={`px-3.5 py-3 ${h.align === "right" ? "text-right" : ""}`}
                >
                  {h.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(h.sort!)}
                      className={`inline-flex items-center gap-1 uppercase cursor-pointer hover:text-text transition-colors ${
                        active ? "text-text" : ""
                      }`}
                      title={`Sort by ${h.label.toLowerCase()}`}
                    >
                      {h.label}
                      {active &&
                        (ascending ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </button>
                  ) : (
                    h.label
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div role="rowgroup" aria-label="Loading customers">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                role="row"
                className={`${TABLE_COLS} border-b border-border/40`}
                style={{ height: TABLE_ROW_HEIGHT }}
              >
                <div role="cell" className={`${cell} gap-3`}>
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                {Array.from({ length: 7 }, (_, j) => (
                  <div key={j} role="cell" className={cell}>
                    <Skeleton className="h-3.5 w-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((vi) => {
              const c = rows[vi.index];
              const position = {
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
              };
              if (!c) {
                return (
                  <div
                    key="loader"
                    role="row"
                    className="absolute left-0 top-0 w-full flex items-center justify-center gap-2 text-12 text-text-muted"
                    style={position}
                  >
                    <div role="cell" className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      <span>Loading more customers…</span>
                    </div>
                  </div>
                );
              }
              const name = customerLabel(c);
              const aov = averageOrderValue(c);
              return (
                <div
                  key={c.id}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  tabIndex={0}
                  onClick={() => onOpen(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) onOpen(c);
                  }}
                  className={`${TABLE_COLS} absolute left-0 top-0 w-full border-b border-border/40 text-13 hover:bg-surface-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                    c.optedOut ? "opacity-80" : ""
                  }`}
                  style={position}
                >
                  <div role="cell" className={`${cell} gap-3`}>
                    <div
                      className="w-8 h-8 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-12 font-outfit text-primary-text"
                      aria-hidden
                    >
                      {initials(c)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold font-outfit text-text truncate">{name}</p>
                      <div className="flex items-center gap-1.5 text-11 text-text-muted">
                        <ChannelIcon channel={c.channel} size={12} />
                        <span className="truncate">{c.handleOrPhone}</span>
                      </div>
                    </div>
                  </div>
                  <div role="cell" className={`${cell} text-text-muted`}>
                    <span className="truncate">{c.city ?? "—"}</span>
                  </div>
                  <div role="cell" className={cell}>
                    <TableSegmentChips customer={c} />
                  </div>
                  <div role="cell" className={`${cell} ${right} tabular-nums text-text font-medium`}>
                    {c.ordersCount}
                  </div>
                  <div role="cell" className={`${cell} ${right} tabular-nums font-bold font-outfit text-text`}>
                    {formatRupees(c.totalSpend)}
                  </div>
                  <div role="cell" className={`${cell} ${right} tabular-nums text-text`}>
                    {aov === null ? <span className="text-text-muted">—</span> : formatRupees(aov)}
                  </div>
                  <div
                    role="cell"
                    className={`${cell} text-text-muted whitespace-nowrap`}
                    title={c.lastMessageAt ? formatDateTime(c.lastMessageAt) : undefined}
                  >
                    <span className="truncate">{lastActive(c)}</span>
                  </div>
                  <div role="cell" className={`${cell} ${right}`}>
                    <FlagButtons
                      customer={c}
                      size={15}
                      onFavourite={() => actions.toggleFavourite(c)}
                      onPriority={() => actions.togglePriority(c)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Customers() {
  const navigate = useNavigate();
  const [segment, setSegment] = useState<Segment>("all");
  const [searchInput, setSearchInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [language, setLanguage] = useState("");
  const [channel, setChannel] = useState<ChannelType | "">("");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [viewMode, setViewModeState] = useState<"grid" | "table">(initialViewMode);
  const setViewMode = (mode: "grid" | "table") => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // not persisted; the choice still applies for this visit
    }
  };
  const [showBanner, setShowBanner] = useState(true);
  // `selected` stays set while the slide-over animates out.
  const [selected, setSelectedState] = useState<CustomerListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const setSelected = (c: CustomerListItem) => {
    setSelectedState(c);
    setDetailOpen(true);
  };

  const search = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const city = useDebounced(cityInput.trim(), SEARCH_DEBOUNCE_MS);

  // Changing any filter swaps the query key, so the infinite list restarts from page 1.
  const params: Omit<CustomerListParams, "page" | "limit"> = { segment, sort };
  if (search) params.search = search.slice(0, 100);
  if (city) params.city = city.slice(0, 80);
  if (language) params.language = language;
  if (channel) params.channel = channel;
  const resetKey = JSON.stringify(params);

  const query = useInfiniteCustomers(params);
  const actions = useCustomerActions();

  const { rows: customers, counts, total, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const canFetchMore = !query.isFetching && !query.isPlaceholderData;
  const filtersActive = Boolean(search || city || language || channel);

  const openChat = (c: CustomerListItem) => {
    if (c.conversationId) navigate(`/inbox?c=${encodeURIComponent(c.conversationId)}`);
  };

  const clearFilters = () => {
    setSearchInput("");
    setCityInput("");
    setLanguage("");
    setChannel("");
  };

  let body: ReactNode;
  if (query.isPending) {
    body =
      viewMode === "grid" ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          aria-busy="true"
          aria-label="Loading customers"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-surface space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <CustomerTable
          rows={[]}
          total={0}
          loading
          hasNextPage={false}
          canFetchMore={false}
          isFetchingNextPage={false}
          fetchNextPage={fetchNextPage}
          resetKey={resetKey}
          sort={sort}
          onSort={setSort}
          onOpen={setSelected}
          actions={actions}
        />
      );
  } else if (query.isError) {
    body = (
      <div className="p-12 text-center rounded-2xl border border-border bg-surface">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
        <p className="text-14 font-semibold text-text">Couldn't load customers</p>
        <p className="mt-1 text-12 text-text-muted">{query.error.message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  } else if (customers.length === 0) {
    body = (
      <div className="rounded-2xl border border-border bg-surface">
        {filtersActive ? (
          <EmptyState
            icon={Search}
            title="No customers match"
            description="Try a different search, city or language."
            action={{ label: "Clear filters", onClick: clearFilters }}
          />
        ) : segment !== "all" ? (
          <EmptyState
            icon={Users}
            title={`No ${SEGMENT_LABELS[segment].toLowerCase()} customers`}
            description="Customers appear here once they match this segment."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Everyone who messages you on WhatsApp or Instagram will be listed here."
          />
        )}
      </div>
    );
  } else if (viewMode === "grid") {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => {
            const name = customerLabel(c);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(c);
                }}
                className={`p-5 rounded-xl border border-border bg-surface hover:border-border/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  c.optedOut ? "opacity-80" : ""
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-16 font-outfit text-primary-text">
                        {name.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-15 font-bold font-outfit text-text truncate">{name}</h3>
                        <div className="flex items-center gap-1.5 text-11 text-text-muted">
                          <ChannelIcon channel={c.channel} size={12} />
                          <span className="truncate">{c.handleOrPhone}</span>
                        </div>
                      </div>
                    </div>
                    <FlagButtons
                      customer={c}
                      onFavourite={() => actions.toggleFavourite(c)}
                      onPriority={() => actions.togglePriority(c)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <CustomerSegmentChips customer={c} />
                    {c.city && (
                      <span className="px-2 py-0.5 rounded text-10 font-medium bg-surface-muted text-text-muted border border-border/60">
                        {c.city}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg border border-border/40 bg-surface-muted text-center text-12">
                    <div>
                      <span className="text-11 text-text-muted block">Spend</span>
                      <strong className="text-text tabular-nums font-outfit text-14">
                        {formatRupees(c.totalSpend)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-11 text-text-muted block">Orders</span>
                      <strong className="text-text tabular-nums font-outfit text-14">{c.ordersCount}</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/40 flex items-center justify-between text-12">
                  <span
                    className="text-11 text-text-muted"
                    title={c.lastMessageAt ? formatDateTime(c.lastMessageAt) : undefined}
                  >
                    Active: {lastActive(c)}
                  </span>
                  <button
                    type="button"
                    disabled={!c.conversationId}
                    onClick={(e) => {
                      e.stopPropagation();
                      openChat(c);
                    }}
                    title={c.conversationId ? undefined : "No conversation yet"}
                    className="px-2.5 py-1 rounded-md bg-primary/10 text-primary-text font-semibold hover:bg-primary/20 transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open chat</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={!canFetchMore || isFetchingNextPage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-13 font-medium text-text hover:bg-surface-muted cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {isFetchingNextPage ? "Loading…" : `Load more (${total - customers.length} left)`}
            </button>
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <CustomerTable
        rows={customers}
        total={total}
        loading={false}
        hasNextPage={hasNextPage}
        canFetchMore={canFetchMore}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        resetKey={resetKey}
        sort={sort}
        onSort={setSort}
        onOpen={setSelected}
        actions={actions}
      />
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Customer Directory</span>
            {counts && (
              <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
                {counts.all} contacts
              </span>
            )}
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Buyer segments, lifetime spend, notes, and conversation shortcuts
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-3">
          {query.isSuccess && total > 0 && (
            <span className="text-12 text-text-muted tabular-nums" aria-live="polite">
              Showing {customers.length} of {total}
            </span>
          )}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Card grid"
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

      {/* ─── Dismissible Info Banner ──────────────────────────────────────────── */}
      {showBanner && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-13 text-text">
            <Info className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong>Segments update automatically:</strong> new = joined in the last 14 days, inactive = last order
              over 90 days ago. Star favourites and mark priority customers to target them in broadcasts.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowBanner(false)}
            aria-label="Dismiss"
            className="p-1 rounded-lg hover:bg-primary/20 text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Segment Tabs & Search Bar ────────────────────────────────────────── */}
      <div className="p-3 rounded-xl border border-border bg-surface space-y-3">
        <div
          className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium"
          role="tablist"
        >
          {SEGMENTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={segment === s}
              onClick={() => setSegment(s)}
              className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                segment === s
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-muted text-text-muted hover:text-text"
              }`}
            >
              {SEGMENT_LABELS[s]}
              {counts ? ` (${counts[s]})` : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] md:max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
            <input
              type="search"
              placeholder="Search name, phone or city..."
              aria-label="Search customers"
              value={searchInput}
              maxLength={100}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <input
            type="text"
            placeholder="City"
            aria-label="Filter by city"
            value={cityInput}
            maxLength={80}
            onChange={(e) => setCityInput(e.target.value)}
            className="w-28 px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <select
            value={language}
            aria-label="Filter by language"
            onChange={(e) => setLanguage(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer focus:outline-none"
          >
            <option value="">All languages</option>
            {CUSTOMER_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {languageLabel(l)}
              </option>
            ))}
          </select>

          <select
            value={channel}
            aria-label="Filter by channel"
            onChange={(e) => setChannel(e.target.value as ChannelType | "")}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer focus:outline-none"
          >
            <option value="">All channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </select>

          <select
            value={sort}
            aria-label="Sort customers"
            onChange={(e) => setSort(e.target.value as CustomerSort)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text font-medium cursor-pointer focus:outline-none md:ml-auto"
          >
            {(Object.keys(SORT_LABELS) as CustomerSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Results ──────────────────────────────────────────────────────────── */}
      <div className={query.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>{body}</div>

      {/* ─── Customer SlideOver ───────────────────────────────────────────────── */}
      {selected && (
        <CustomerDetail key={selected.id} initial={selected} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  );
}
