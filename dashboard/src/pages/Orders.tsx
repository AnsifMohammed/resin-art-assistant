import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Clock,
  Calendar,
  Truck,
  MessageSquare,
  Search,
  X,
  Phone,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  Send,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { Skeleton } from "../components/shared/Skeleton.tsx";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { PaymentsPanel } from "../components/orders/PaymentsPanel.tsx";
import type { PaymentSummary, DbOrder, DbOrderItem, OrderStatus, OrderMessage } from "../types/index.ts";
import {
  useOrders,
  useCreateOrder,
  useUpdateOrder,
  useUpdateOrderStatus,
  useDeleteOrder,
  useOrderMessages,
  useSendProgressUpdate,
  useRetryOrderNotification,
} from "../hooks/useOrders.ts";
import { useTemplates } from "../hooks/useTemplates.ts";
import { renderTemplate } from "../lib/templates.ts";

const COLUMNS: Array<{ id: OrderStatus; label: string; color: string }> = [
  { id: "pending", label: "Pending", color: "bg-stone-500" },
  { id: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { id: "in_production", label: "In Production", color: "bg-amber-500" },
  { id: "ready", label: "Ready", color: "bg-violet-500" },
  { id: "dispatched", label: "Dispatched", color: "bg-teal" },
  { id: "delivered", label: "Delivered", color: "bg-emerald-500" },
];

const NEXT_ACTION: Record<OrderStatus, { next: OrderStatus; label: string } | null> = {
  pending: { next: "confirmed", label: "Confirm Order" },
  confirmed: { next: "in_production", label: "Start Production" },
  in_production: { next: "ready", label: "Mark as Ready" },
  ready: { next: "dispatched", label: "Dispatch Order" },
  dispatched: { next: "delivered", label: "Mark Delivered" },
  delivered: null,
  cancelled: null,
};

export type DueRangePreset = "all" | "7d" | "15d" | "1m" | "custom";

export interface DueDateRange {
  preset: DueRangePreset;
  from?: string | undefined;
  to?: string | undefined;
}

export function presetDueRange(preset: "7d" | "15d" | "1m"): DueDateRange {
  const today = dayjs().format("YYYY-MM-DD");
  if (preset === "7d") {
    return {
      preset,
      from: today,
      to: dayjs().add(7, "day").format("YYYY-MM-DD"),
    };
  }
  if (preset === "15d") {
    return {
      preset,
      from: today,
      to: dayjs().add(15, "day").format("YYYY-MM-DD"),
    };
  }
  return {
    preset: "1m",
    from: today,
    to: dayjs().add(1, "month").format("YYYY-MM-DD"),
  };
}

export function calculateProductionDays(order: DbOrder): number {
  if (order.status !== "in_production") return 0;
  const start = order.productionStartedAt || order.createdAt;
  const startTime = new Date(start).getTime();
  if (isNaN(startTime)) return 0;
  return Math.max(0, Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24)));
}

export interface DueMilestone {
  type: "overdue" | "today" | "1d" | "2d" | "7d" | "midpoint";
  label: string;
  badgeClass: string;
  borderClass: string;
  dotClass: string;
  pingClass: string;
}

export function getOrderDueMilestone(order: DbOrder): DueMilestone | null {
  // ONLY highlight in production!
  if (order.status !== "in_production") {
    return null;
  }
  if (!order.expectedDeliveryDate || !order.createdAt) {
    return null;
  }

  const created = dayjs(order.createdAt).startOf("day");
  const expected = dayjs(order.expectedDeliveryDate).startOf("day");
  if (!created.isValid() || !expected.isValid()) {
    return null;
  }

  const today = dayjs().startOf("day");
  const totalDuration = expected.diff(created, "day");
  const remainingDays = expected.diff(today, "day");
  const prodDays = calculateProductionDays(order);
  const elapsedDays = Math.max(prodDays, today.diff(created, "day"));
  const midpoint = Math.floor(totalDuration / 2);

  // 1. Overdue — static red left border, ping dot on badge only
  if (remainingDays < 0) {
    return {
      type: "overdue",
      label: `Overdue (${Math.abs(remainingDays)}d)`,
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
      borderClass: "border-border/80 border-l-4 border-l-rose-500 dark:border-l-rose-400 bg-rose-500/[0.04]",
      dotClass: "bg-rose-500",
      pingClass: "bg-rose-400",
    };
  }

  // 2. Due Today — static red left border, ping dot on badge only
  if (remainingDays === 0) {
    return {
      type: "today",
      label: "Due Today",
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
      borderClass: "border-border/80 border-l-4 border-l-rose-500 dark:border-l-rose-400 bg-rose-500/[0.04]",
      dotClass: "bg-rose-500",
      pingClass: "bg-rose-400",
    };
  }

  // 3. 1 Day Remaining — amber left border, ping dot
  if (remainingDays === 1) {
    return {
      type: "1d",
      label: "1 Day Remaining",
      badgeClass: "bg-amber-600/15 text-amber-800 dark:text-amber-300 border-amber-600/40",
      borderClass: "border-border/80 border-l-4 border-l-amber-600 dark:border-l-amber-500 bg-amber-600/[0.04]",
      dotClass: "bg-amber-600",
      pingClass: "bg-amber-400",
    };
  }

  // 4. 2 Days Remaining — orange left border, ping dot
  if (remainingDays === 2) {
    return {
      type: "2d",
      label: "2 Days Remaining",
      badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40",
      borderClass: "border-border/80 border-l-4 border-l-orange-500 dark:border-l-orange-400 bg-orange-500/[0.03]",
      dotClass: "bg-orange-500",
      pingClass: "bg-orange-400",
    };
  }

  // 5. 7 Days Remaining — subtle amber left border, no ping
  if (remainingDays === 7) {
    return {
      type: "7d",
      label: "7 Days Remaining",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      borderClass: "border-border/80 border-l-4 border-l-amber-400 dark:border-l-amber-500",
      dotClass: "bg-amber-500",
      pingClass: "",
    };
  }

  // 6. Midpoint Reached — subtle blue left border, no ping
  if (totalDuration >= 3 && elapsedDays === midpoint && midpoint > 0) {
    return {
      type: "midpoint",
      label: "Midpoint Reached",
      badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
      borderClass: "border-border/80 border-l-4 border-l-blue-400 dark:border-l-blue-500",
      dotClass: "bg-blue-500",
      pingClass: "",
    };
  }

  return null;
}

interface OrderCardProps {
  order: DbOrder;
  onSelect: () => void;
  onAdvance?: (nextStatus: OrderStatus) => void;
  onMoveTo: (status: OrderStatus) => void;
  onCopyTracking: (trackingId: string, e: React.MouseEvent) => void;
  isGrid?: boolean;
}

function OrderPaymentChip({ summary, orderTotal }: { summary?: PaymentSummary | undefined; orderTotal: number }) {
  // No payment made yet — hide the chip entirely
  if (!summary || summary.totalPaid === 0) return null;

  if (summary.paymentState === "fully_paid") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
        Fully Paid
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 tabular-nums whitespace-nowrap">
      Adv · Bal: ₹{summary.balanceDue.toLocaleString("en-IN")}
    </span>
  );
}

function OrderCard({
  order,
  onSelect,
  onAdvance,
  onMoveTo,
  onCopyTracking,
  isGrid = false,
}: OrderCardProps) {
  const next = NEXT_ACTION[order.status];
  const colInfo = COLUMNS.find((c) => c.id === order.status);
  const prodDays = calculateProductionDays(order);
  const isOverdue = order.status === "in_production" && prodDays >= 45;
  const isApproaching = order.status === "in_production" && prodDays >= 35 && prodDays < 45;
  const milestone = getOrderDueMilestone(order);

  const cardBorderBg = milestone
    ? milestone.borderClass
    : isOverdue
    ? "border-rose-500/70 bg-rose-500/[0.04] ring-1 ring-rose-500/30 shadow-xs animate-pulse"
    : isApproaching
    ? "border-amber-500/60 bg-amber-500/[0.03]"
    : "border-border bg-surface";

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-xl border ${cardBorderBg} hover:border-primary/50 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group ${
        isGrid ? "gap-3 min-h-[185px]" : "gap-2.5"
      }`}
    >
      <div className="space-y-2">
        {/* Top: Order #, Milestone badge (if any), Date */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="text-12 font-bold font-outfit text-text group-hover:text-primary transition-colors truncate shrink-0 max-w-[90px]">
              #{order.orderNo}
            </span>
            {milestone && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${milestone.badgeClass}`}
                title={`Production Milestone: ${milestone.label}`}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  {milestone.pingClass && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${milestone.pingClass} opacity-75`} />
                  )}
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${milestone.dotClass}`} />
                </span>
                <span className="truncate">{milestone.label}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isGrid && colInfo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold capitalize bg-surface-muted text-text-muted border border-border/50">
                <span className={`w-1.5 h-1.5 rounded-full ${colInfo.color}`} />
                {colInfo.label}
              </span>
            )}
            <span className="text-11 font-medium text-text-muted">
              {formatOrderDate(order.createdAt)}
            </span>
          </div>
        </div>

        {/* Customer row */}
        <div className="flex items-center gap-1.5 text-12 text-text-muted min-w-0">
          <ChannelIcon channel={order.channel} size={13} className="shrink-0" />
          <span className="font-semibold text-text truncate min-w-0">{order.customerName}</span>
        </div>

        {/* In Production Duration Badge */}
        {order.status === "in_production" && (
          <div className="pt-0.5">
            {isOverdue ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500 text-white shadow-2xs">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{prodDays}d in prod · Overdue (≥45d)</span>
              </span>
            ) : isApproaching ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{prodDays}d in prod · Approaching 45d</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                <Clock className="w-2.5 h-2.5 shrink-0" />
                <span>{prodDays} days in production</span>
              </span>
            )}
          </div>
        )}

        {/* Items list */}
        <div className="space-y-1 min-w-0">
          {order.items && order.items.length > 0 ? (
            order.items.map((item: DbOrderItem, idx: number) => (
              <p key={item.id || idx} className="text-11 text-text-muted truncate">
                • {item.productName}
                {item.quantity > 1 ? ` (x${item.quantity})` : ""}
              </p>
            ))
          ) : (
            <p className="text-11 text-text-muted italic">No items listed</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border/40">
        {/* Amount + Payment chip on left, Tracking + Due date on right */}
        <div className="flex items-center justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-12 sm:text-13 font-bold font-outfit text-text tabular-nums shrink-0">
              ₹{Number(order.totalAmount).toLocaleString("en-IN")}
            </span>
            <OrderPaymentChip summary={order.paymentSummary} orderTotal={Number(order.totalAmount)} />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {order.trackingId ? (
              <button
                onClick={(e) => onCopyTracking(order.trackingId!, e)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-muted text-10 font-mono text-text hover:bg-border transition-colors cursor-pointer shrink-0"
                title="Click to copy tracking ID"
              >
                <Truck className="w-3 h-3 text-teal-500 shrink-0" />
                <Copy className="w-2.5 h-2.5 shrink-0" />
              </button>
            ) : null}
            <span className="text-[10px] text-text-muted flex items-center gap-0.5 shrink-0 whitespace-nowrap">
              <Clock className="w-2.5 h-2.5 shrink-0" /> {formatDueDate(order.expectedDeliveryDate)}
            </span>
          </div>
        </div>

        {/* Action Buttons: 1-Click Advance + Move To Stage Dropdown (Hidden on delivered tab) */}
        {order.status !== "delivered" && order.status !== "cancelled" && (
          <div className="flex items-center gap-1.5 pt-0.5 min-w-0">
            {next && onAdvance ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvance(next.next);
                }}
                className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-11 font-semibold hover:brightness-105 active:scale-[0.98] transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                title={`Advance to ${next.label}`}
              >
                <span className="truncate">{next.label}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : null}

            <div className={`relative ${next && onAdvance ? "shrink-0" : "w-full"}`}>
              <button
                type="button"
                className={`${
                  next && onAdvance
                    ? "w-7 h-7 flex items-center justify-center rounded-lg bg-surface-muted hover:bg-border border border-border text-text-muted hover:text-text"
                    : "w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-border border border-border text-text text-11 font-medium"
                } transition-colors cursor-pointer`}
                title="Move to another stage"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                {!next && <span>Move Stage</span>}
              </button>
              <select
                onClick={(e) => e.stopPropagation()}
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onMoveTo(e.target.value as OrderStatus);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Move to another stage"
              >
                <option value="" disabled>
                  Move to stage...
                </option>
                {COLUMNS.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === order.status}>
                    {c.id === order.status ? `✓ ${c.label} (Current)` : `→ ${c.label}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatOrderDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / (1000 * 3600);
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return "Today";
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function formatDueDate(dateStr?: string | null): string {
  if (!dateStr) return "Not set";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 3600 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

interface ItemRow {
  productName: string;
  productDescription: string;
  quantity: number | string;
  unitPrice: number | string;
}

const errorMessage = (err: unknown): string | undefined =>
  err instanceof Error ? err.message : undefined;

function SkeletonOrderCard({ isGrid = false }: { isGrid?: boolean }) {
  return (
    <div
      className={`p-3 rounded-xl border border-border bg-surface flex flex-col justify-between ${
        isGrid ? "gap-3 min-h-[185px]" : "gap-2.5"
      }`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <Skeleton className="w-14 h-3.5" />
          <Skeleton className="w-14 h-3" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
          <Skeleton className="w-20 h-3.5" />
        </div>
        <div className="space-y-1">
          <Skeleton className="w-3/4 h-3" />
          <Skeleton className="w-1/2 h-3" />
        </div>
      </div>
      <div className="pt-2 border-t border-border/40 space-y-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="w-14 h-4" />
          <Skeleton className="w-14 h-3 rounded" />
        </div>
        <Skeleton className="w-24 h-4 rounded" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="flex-1 h-7 rounded-lg" />
          <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
        </div>
      </div>
    </div>
  );
}

function OrdersSkeleton({
  viewMode,
  selectedStatus,
}: {
  viewMode: "board" | "table";
  selectedStatus: string;
}) {
  if (viewMode === "table") {
    return (
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-left text-13">
          <thead className="bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
            <tr>
              <th className="p-3.5">Order</th>
              <th className="p-3.5">Customer</th>
              <th className="p-3.5">Products</th>
              <th className="p-3.5">Total</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Placed</th>
              <th className="p-3.5">Tracking / Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="p-3.5">
                <td className="p-3.5">
                  <Skeleton className="w-14 h-4" />
                </td>
                <td className="p-3.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                    <Skeleton className="w-24 h-3.5" />
                  </div>
                </td>
                <td className="p-3.5">
                  <Skeleton className="w-32 h-3.5" />
                </td>
                <td className="p-3.5">
                  <Skeleton className="w-16 h-4" />
                </td>
                <td className="p-3.5">
                  <Skeleton className="w-20 h-5 rounded-full" />
                </td>
                <td className="p-3.5">
                  <Skeleton className="w-16 h-3.5" />
                </td>
                <td className="p-3.5">
                  <Skeleton className="w-20 h-4 rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (selectedStatus !== "all") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface/80">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-3 h-3 rounded-full" />
            <Skeleton className="w-36 h-5" />
            <Skeleton className="w-16 h-5 rounded-full" />
          </div>
          <Skeleton className="w-28 h-4 hidden sm:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonOrderCard key={i} isGrid />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-start gap-3 xl:gap-3.5 2xl:gap-4 overflow-x-auto custom-scrollbar pb-2 pt-1 w-full">
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className="flex-1 min-w-[220px] xl:min-w-0 h-full flex flex-col rounded-xl border border-border bg-surface/60 shadow-2xs overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between p-2.5 sm:p-3 border-b border-border/40 bg-surface/95 rounded-t-xl">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full ${col.color} shrink-0`} />
              <span className="text-12 sm:text-13 font-bold font-outfit text-text truncate">{col.label}</span>
            </div>
            <Skeleton className="w-5 h-4 rounded shrink-0" />
          </div>
          <div className="flex-1 min-h-0 p-2.5 space-y-2.5 overflow-hidden">
            <SkeletonOrderCard />
            <SkeletonOrderCard />
          </div>
        </div>
      ))}
    </div>
  );
}

function SendProgressUpdateModal({
  order,
  onClose,
}: {
  order: DbOrder | null;
  onClose: () => void;
}) {
  const templatesQuery = useTemplates({ category: "production_progress", active: "true" });
  const sendMutation = useSendProgressUpdate();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [messageText, setMessageText] = useState("");

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  const placeholders = useMemo(() => {
    if (!order) return {};
    const prodDays = calculateProductionDays(order);
    const prodStart = order.productionStartedAt || order.createdAt;
    const prodStartTime = new Date(prodStart).getTime();
    const prodStartDateFormatted = !isNaN(prodStartTime)
      ? new Date(prodStartTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "Recently";

    const expectedCompletionFormatted = order.expectedDeliveryDate
      ? new Date(order.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "Soon";

    const remainingDays = order.expectedDeliveryDate
      ? Math.max(0, Math.ceil((new Date(order.expectedDeliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : Math.max(0, 45 - prodDays);

    const productName =
      order.items && order.items.length > 0
        ? order.items.map((i) => i.productName).join(", ")
        : "custom resin art piece";

    return {
      CustomerName: order.customerName,
      customerName: order.customerName,
      OrderNumber: order.orderNo,
      orderNumber: order.orderNo,
      orderNo: order.orderNo,
      ProductName: productName,
      productName: productName,
      product: productName,
      ProductionStartDate: prodStartDateFormatted,
      productionStartDate: prodStartDateFormatted,
      ExpectedCompletionDate: expectedCompletionFormatted,
      expectedCompletionDate: expectedCompletionFormatted,
      deliveryDate: expectedCompletionFormatted,
      ProductionDays: String(prodDays),
      productionDays: String(prodDays),
      RemainingDays: String(remainingDays),
      remainingDays: String(remainingDays),
      CurrentStatus: "In Production",
      currentStatus: "In Production",
    };
  }, [order]);

  useEffect(() => {
    if (!order || templates.length === 0) return;
    const prodDays = calculateProductionDays(order);
    let defaultTpl = templates.find((t) => t.name === "Production Progress Update");
    if (prodDays >= 45) {
      const delayTpl = templates.find((t) => t.name === "Production Delay Notification");
      if (delayTpl) defaultTpl = delayTpl;
    }
    if (!defaultTpl) defaultTpl = templates[0];

    if (defaultTpl) {
      setSelectedTemplateId(defaultTpl.id);
      const rendered = renderTemplate(defaultTpl.body, placeholders as Record<string, string>);
      setMessageText(rendered.text);
    }
  }, [order, templates, placeholders]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      const rendered = renderTemplate(tpl.body, placeholders as Record<string, string>);
      setMessageText(rendered.text);
    }
  };

  const handleSend = async () => {
    if (!order || !messageText.trim()) return;
    try {
      const res = await sendMutation.mutateAsync({
        id: order.id,
        data: {
          templateId: selectedTemplateId || undefined,
          text: messageText.trim(),
        },
      });

      const channelLabel = order.channel === "whatsapp" ? "WhatsApp" : "Instagram";
      if (res.ok) {
        toast.success("Progress update sent", {
          description: `Direct message delivered to ${order.customerName} on ${channelLabel}.`,
        });
        onClose();
      } else {
        toast.error("Message recorded but delivery failed", {
          description: res.error || `Could not deliver message via ${channelLabel}. You can retry from communication history.`,
        });
        onClose();
      }
    } catch (err: unknown) {
      toast.error("Failed to send progress update", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!order) return null;

  const prodDays = calculateProductionDays(order);
  const isOverdue = prodDays >= 45;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h3 className="text-16 font-bold font-outfit text-text flex items-center gap-2">
              <span>Send Production Progress Update</span>
              {isOverdue && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white">
                  Overdue ({prodDays}d)
                </span>
              )}
            </h3>
            <p className="text-12 text-text-muted mt-0.5 flex items-center gap-1.5">
              <span>Order #{order.orderNo}</span>
              <span>·</span>
              <span>{order.customerName}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-medium">
                <ChannelIcon channel={order.channel || "whatsapp"} size={12} />
                {order.channel === "whatsapp" ? "WhatsApp" : "Instagram DM"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Selector */}
        <div>
          <label className="text-11 font-medium text-text block mb-1">
            Template (from Message Templates):
          </label>
          <div className="relative">
            <select
              value={selectedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="w-full pl-3 pr-8 py-2 appearance-none rounded-lg border border-border bg-surface text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="" disabled>Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {!t.isActive ? "(Inactive)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
          </div>
        </div>

        {/* Editable Message Body */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-11 font-medium text-text">
              Preview & Edit Message Text:
            </label>
            <span className={`text-[10px] tabular-nums ${messageText.length > 1000 ? "text-danger font-semibold" : "text-text-muted"}`}>
              {messageText.length} / 1000
            </span>
          </div>
          <textarea
            rows={5}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="w-full p-3 rounded-xl border border-border bg-surface-muted text-12 font-mono text-text focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            placeholder="Type your production update message here..."
          />
        </div>

        {/* Dynamic Placeholders Quick-Insert */}
        <div className="space-y-1">
          <span className="text-[10px] text-text-muted block">Applied order variables:</span>
          <div className="flex flex-wrap gap-1 text-[10px]">
            {Object.keys(placeholders).filter((k) => /^[A-Z]/.test(k)).map((key) => (
              <span
                key={key}
                className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono text-[10px]"
                title={`Value: ${(placeholders as Record<string, string>)[key]}`}
              >
                {`{${key}}`}: <span className="font-semibold text-text">{(placeholders as Record<string, string>)[key]}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between text-11 text-text-muted">
          <div className="flex items-center gap-1.5">
            <ChannelIcon channel={order.channel || "whatsapp"} size={13} />
            <span>Sends via <strong>{order.channel === "whatsapp" ? "WhatsApp" : "Instagram Direct Message (DM)"}</strong></span>
          </div>
          <span className="text-primary font-semibold">Recorded in communication history</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-medium text-text cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sendMutation.isPending || !messageText.trim() || messageText.length > 1000}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-12 font-semibold cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Send {order.channel === "whatsapp" ? "WhatsApp Message" : "Instagram DM"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCommunicationHistory({
  order,
}: {
  order: DbOrder;
}) {
  const { data, isLoading } = useOrderMessages(order.id);
  const retryMutation = useRetryOrderNotification();
  const messages = data?.messages ?? [];

  const handleRetry = async (messageId: string) => {
    try {
      const res = await retryMutation.mutateAsync({ id: order.id, messageId });
      const channelLabel = (res.channel || order.channel) === "whatsapp" ? "WhatsApp" : "Instagram";
      if (res.ok) {
        toast.success(`Message resent successfully via ${channelLabel}!`);
      } else {
        toast.error("Retry failed", { description: res.error });
      }
    } catch (err: unknown) {
      toast.error("Failed to retry message", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h4 className="text-13 font-bold font-outfit text-text">
            Communication History ({messages.length})
          </h4>
        </div>
      </div>

      {isLoading ? (
        <p className="text-11 text-text-muted text-center py-3">Loading communication history...</p>
      ) : messages.length === 0 ? (
        <div className="py-4 text-center rounded-lg border border-dashed border-border bg-surface-muted/40">
          <p className="text-11 text-text-muted">No updates sent for this order yet.</p>
          <p className="text-[10px] text-text-muted/80 mt-0.5">
            Status changes and progress updates will be recorded here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
          {messages.map((m: OrderMessage) => {
            const isFailed = m.deliveryStatus === "failed";
            const isSent = m.deliveryStatus === "sent" || m.deliveryStatus === "delivered";

            return (
              <div
                key={m.id}
                className={`p-3 rounded-lg border text-12 space-y-1.5 ${
                  isFailed
                    ? "border-rose-500/30 bg-rose-500/5 text-text"
                    : "border-border bg-surface-muted text-text"
                }`}
              >
                <div className="flex items-center justify-between text-10">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold px-1.5 py-0.5 rounded bg-surface border border-border flex items-center gap-1">
                      <ChannelIcon channel={(m.metadata as any)?.channel || order.channel || "whatsapp"} size={11} />
                      {m.metadata?.templateName || (m.metadata?.channel === "whatsapp" ? "WhatsApp Update" : "Instagram DM")}
                    </span>
                    <span className="text-text-muted">
                      {new Date(m.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isSent ? (
                      <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-500/15 text-emerald-600 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Sent
                      </span>
                    ) : isFailed ? (
                      <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-rose-500/15 text-rose-600 flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Failed
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-amber-500/15 text-amber-600">
                        Queued
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-11 leading-relaxed whitespace-pre-wrap">{m.content}</p>

                {isFailed && (
                  <div className="flex items-center justify-between pt-1 border-t border-rose-500/20 text-[10px]">
                    <span className="text-rose-600 truncate max-w-[220px]">
                      {m.metadata?.error || "Delivery failed"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetry(m.id)}
                      disabled={retryMutation.isPending}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500 text-white font-semibold hover:bg-rose-600 cursor-pointer disabled:opacity-50"
                    >
                      {retryMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                      <span>Retry</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Filters & View State
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Due Date Filter State (like Analytics dashboard)
  const [dueRange, setDueRange] = useState<DueDateRange>({ preset: "all" });
  const [duePreset, setDuePreset] = useState<DueRangePreset>("all");
  const [showCustomDuePicker, setShowCustomDuePicker] = useState(false);
  const [showDueDropdown, setShowDueDropdown] = useState(false);
  const [customDueStartDate, setCustomDueStartDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [customDueEndDate, setCustomDueEndDate] = useState(() => dayjs().add(7, "day").format("YYYY-MM-DD"));

  // Queries & Mutations
  const { data, isLoading } = useOrders({
    status: selectedStatus === "all" ? undefined : selectedStatus,
    search: searchQuery.trim() || undefined,
    dueFrom: dueRange.from,
    dueTo: dueRange.to,
  });

  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();
  const updateOrderStatusMutation = useUpdateOrderStatus();
  const deleteOrderMutation = useDeleteOrder();

  const orders = data?.orders ?? [];
  const statusCounts = data?.statusCounts;

  // Selected Order for SlideOver
  const [activeOrder, setActiveOrder] = useState<DbOrder | null>(null);

  // Status Change Dialog State
  const [updatingOrder, setUpdatingOrder] = useState<DbOrder | null>(null);
  const [targetStatus, setTargetStatus] = useState<OrderStatus>("in_production");
  const [statusTrackingId, setStatusTrackingId] = useState("");
  const [statusCourier, setStatusCourier] = useState("");

  // Production Progress Modal State
  const [progressModalOrder, setProgressModalOrder] = useState<DbOrder | null>(null);

  // Create Order Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerPhone, setCreateCustomerPhone] = useState("");
  const [createCustomerEmail, setCreateCustomerEmail] = useState("");
  const [createChannel, setCreateChannel] = useState<"whatsapp" | "instagram">("whatsapp");
  const [createShippingAddress, setCreateShippingAddress] = useState("");
  const [createCourier, setCreateCourier] = useState("");
  const [createExpectedDate, setCreateExpectedDate] = useState("");
  const [createDeliveryCharge, setCreateDeliveryCharge] = useState<number | string>("");
  const [createDiscountAmount, setCreateDiscountAmount] = useState<number | string>("");
  const [createCustomerNotes, setCreateCustomerNotes] = useState("");
  const [createItems, setCreateItems] = useState<ItemRow[]>([
    { productName: "", productDescription: "", quantity: 1, unitPrice: "" },
  ]);

  // Edit Order Details & Items State (inside SlideOver)
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editShippingAddress, setEditShippingAddress] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [editTrackingId, setEditTrackingId] = useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editCustomerNotes, setEditCustomerNotes] = useState("");
  const [editDeliveryCharge, setEditDeliveryCharge] = useState<number | string>("");
  const [editDiscountAmount, setEditDiscountAmount] = useState<number | string>("");
  const [editItems, setEditItems] = useState<ItemRow[]>([]);

  // Delete Confirmation State
  const [deletingOrder, setDeletingOrder] = useState<DbOrder | null>(null);

  const handleDuePresetChange = (preset: DueRangePreset) => {
    setDuePreset(preset);
    if (preset === "custom") {
      setShowCustomDuePicker(true);
    } else {
      setShowCustomDuePicker(false);
      if (preset === "all") {
        setDueRange({ preset: "all" });
      } else {
        setDueRange(presetDueRange(preset));
      }
    }
  };

  const applyCustomDueRange = () => {
    if (!customDueStartDate || !customDueEndDate) {
      toast.error("Pick a start and end due date");
      return;
    }
    if (dayjs(customDueStartDate).isAfter(dayjs(customDueEndDate))) {
      toast.error("The start date must be on or before the end date");
      return;
    }
    setDueRange({
      preset: "custom",
      from: customDueStartDate,
      to: customDueEndDate,
    });
    setShowCustomDuePicker(false);
  };

  const resetCreateForm = () => {
    setCreateCustomerName("");
    setCreateCustomerPhone("");
    setCreateCustomerEmail("");
    setCreateShippingAddress("");
    setCreateCourier("");
    setCreateExpectedDate("");
    setCreateDeliveryCharge("");
    setCreateDiscountAmount("");
    setCreateCustomerNotes("");
    setCreateItems([
      { productName: "", productDescription: "", quantity: 1, unitPrice: "" },
    ]);
  };

  const handleOpenCreateModal = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateOpen(false);
    resetCreateForm();
  };

  // Keep activeOrder in sync with refetched query data
  const liveActiveOrder = useMemo(() => {
    if (!activeOrder) return null;
    return orders.find((o) => o.id === activeOrder.id) ?? activeOrder;
  }, [orders, activeOrder]);

  // Deep-link auto focus via ?focus=id or ?orderId=id
  useEffect(() => {
    const focusId = searchParams.get("focus") || searchParams.get("orderId");
    if (focusId && orders.length > 0) {
      const target = orders.find((o) => o.id === focusId || o.orderNo === focusId);
      if (target) {
        setActiveOrder(target);
      }
    }
  }, [searchParams, orders]);

  useEffect(() => {
    if (!showDueDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-due-dropdown]")) setShowDueDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDueDropdown]);

  const copyTracking = (trackingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(trackingId);
    toast.success("Tracking ID copied", { description: trackingId });
  };

  const handleOpenStatusDialog = (order: DbOrder, nextStatus: OrderStatus, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setUpdatingOrder(order);
    setTargetStatus(nextStatus);
    setStatusTrackingId(order.trackingId || "");
    setStatusCourier(order.courier || "");
  };

  const confirmStatusUpdate = async () => {
    if (!updatingOrder || updateOrderStatusMutation.isPending) return;
    try {
      await updateOrderStatusMutation.mutateAsync({
        id: updatingOrder.id,
        data: {
          status: targetStatus,
          trackingId: statusTrackingId.trim() || undefined,
          courier: statusCourier.trim() || undefined,
        },
      });

      toast.success("Order status updated", {
        description: `${updatingOrder.orderNo} moved to ${targetStatus.replace("_", " ")}`,
      });
      setUpdatingOrder(null);
    } catch (err: unknown) {
      toast.error("Failed to update status", { description: errorMessage(err) });
    }
  };

  // Start Editing Order Details & Items
  const handleStartEditing = (order: DbOrder) => {
    setIsEditingDetails(true);
    setEditCustomerName(order.customerName || "");
    setEditCustomerPhone(order.customerPhone || "");
    setEditShippingAddress(order.shippingAddress || "");
    setEditCourier(order.courier || "");
    setEditTrackingId(order.trackingId || "");
    setEditExpectedDate(order.expectedDeliveryDate || "");
    setEditCustomerNotes(order.customerNotes || "");
    setEditDeliveryCharge(Number(order.deliveryCharge) > 0 ? String(order.deliveryCharge) : "");
    setEditDiscountAmount(Number(order.discountAmount) > 0 ? String(order.discountAmount) : "");
    setEditItems(
      order.items && order.items.length > 0
        ? order.items.map((it) => ({
            productName: it.productName,
            productDescription: it.productDescription || "",
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice) > 0 ? String(it.unitPrice) : "",
          }))
        : [{ productName: "", productDescription: "", quantity: 1, unitPrice: "" }]
    );
  };

  const handleEditAddItem = () => {
    setEditItems((prev) => [
      ...prev,
      { productName: "", productDescription: "", quantity: 1, unitPrice: "" },
    ]);
  };

  const handleEditRemoveItem = (index: number) => {
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = <K extends keyof ItemRow>(index: number, field: K, value: ItemRow[K]) => {
    setEditItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const editSubtotal = useMemo(() => {
    return editItems.reduce((acc, it) => {
      const q = typeof it.quantity === "number" ? it.quantity : parseInt(String(it.quantity), 10) || 0;
      const p = typeof it.unitPrice === "number" ? it.unitPrice : parseFloat(String(it.unitPrice)) || 0;
      return acc + q * p;
    }, 0);
  }, [editItems]);

  const editTotal = useMemo(() => {
    const del = typeof editDeliveryCharge === "number" ? editDeliveryCharge : parseFloat(String(editDeliveryCharge)) || 0;
    const disc = typeof editDiscountAmount === "number" ? editDiscountAmount : parseFloat(String(editDiscountAmount)) || 0;
    return Math.max(0, editSubtotal + del - disc);
  }, [editSubtotal, editDeliveryCharge, editDiscountAmount]);

  const handleSaveOrderEdits = async () => {
    if (!liveActiveOrder) return;
    const validItems = editItems.filter((it) => it.productName.trim().length > 0);
    if (validItems.length === 0) {
      toast.error("Order must have at least one product name");
      return;
    }

    try {
      const res = await updateOrderMutation.mutateAsync({
        id: liveActiveOrder.id,
        data: {
          customerName: editCustomerName.trim() || undefined,
          customerPhone: editCustomerPhone.trim() || null,
          shippingAddress: editShippingAddress.trim() || null,
          courier: editCourier.trim() || null,
          trackingId: editTrackingId.trim() || null,
          expectedDeliveryDate: editExpectedDate.trim() || null,
          customerNotes: editCustomerNotes.trim() || null,
          deliveryCharge: parseFloat(String(editDeliveryCharge)) || 0,
          discountAmount: parseFloat(String(editDiscountAmount)) || 0,
          items: validItems.map((it) => ({
            productName: it.productName.trim(),
            productDescription: it.productDescription.trim() || undefined,
            quantity: parseInt(String(it.quantity), 10) || 1,
            unitPrice: parseFloat(String(it.unitPrice)) || 0,
          })),
        },
      });
      if (res?.order) {
        setActiveOrder(res.order);
      }
      setIsEditingDetails(false);
      toast.success("Order details and prices updated successfully!");
    } catch (err: unknown) {
      toast.error("Failed to save changes", { description: errorMessage(err) });
    }
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    try {
      await deleteOrderMutation.mutateAsync(deletingOrder.id);
      toast.success("Order deleted", {
        description: `Order ${deletingOrder.orderNo} has been removed.`,
      });
      setDeletingOrder(null);
      if (activeOrder?.id === deletingOrder.id) {
        setActiveOrder(null);
      }
    } catch (err: unknown) {
      toast.error("Failed to delete order", { description: errorMessage(err) });
    }
  };

  // Create Order Handlers
  const handleAddItem = () => {
    setCreateItems((prev) => [
      ...prev,
      { productName: "", productDescription: "", quantity: 1, unitPrice: "" },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (createItems.length <= 1) return;
    setCreateItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = <K extends keyof ItemRow>(index: number, field: K, value: ItemRow[K]) => {
    setCreateItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const createSubtotal = useMemo(() => {
    return createItems.reduce((acc, it) => {
      const q = typeof it.quantity === "number" ? it.quantity : parseInt(String(it.quantity), 10) || 0;
      const p = typeof it.unitPrice === "number" ? it.unitPrice : parseFloat(String(it.unitPrice)) || 0;
      return acc + q * p;
    }, 0);
  }, [createItems]);

  const createTotal = useMemo(() => {
    const del = typeof createDeliveryCharge === "number" ? createDeliveryCharge : parseFloat(String(createDeliveryCharge)) || 0;
    const disc = typeof createDiscountAmount === "number" ? createDiscountAmount : parseFloat(String(createDiscountAmount)) || 0;
    return Math.max(0, createSubtotal + del - disc);
  }, [createSubtotal, createDeliveryCharge, createDiscountAmount]);

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCustomerName.trim()) {
      toast.error("Please enter a customer name");
      return;
    }
    const validItems = createItems.filter((it) => it.productName.trim().length > 0);
    if (validItems.length === 0) {
      toast.error("Please enter at least one item with a product name");
      return;
    }

    try {
      const res = await createOrderMutation.mutateAsync({
        customerName: createCustomerName.trim(),
        customerPhone: createCustomerPhone.trim() || undefined,
        customerEmail: createCustomerEmail.trim() || undefined,
        channel: createChannel,
        shippingAddress: createShippingAddress.trim() || undefined,
        courier: createCourier.trim() || undefined,
        expectedDeliveryDate: createExpectedDate.trim() || undefined,
        deliveryCharge: parseFloat(String(createDeliveryCharge)) || 0,
        discountAmount: parseFloat(String(createDiscountAmount)) || 0,
        customerNotes: createCustomerNotes.trim() || undefined,
        items: validItems.map((it) => ({
          productName: it.productName.trim(),
          productDescription: it.productDescription.trim() || undefined,
          quantity: parseInt(String(it.quantity), 10) || 1,
          unitPrice: parseFloat(String(it.unitPrice)) || 0,
        })),
      });

      // Close slideover immediately and reset form completely
      handleCloseCreateModal();

      toast.success("Order created successfully!", {
        description: `Order #${res.order.orderNo} created for ${res.order.customerName}`,
      });
    } catch (err: unknown) {
      toast.error("Failed to create order", { description: errorMessage(err) });
    }
  };

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8 gap-4 overflow-hidden w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Orders & Production</span>
            <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
              {statusCounts?.all ?? orders.length} total
            </span>
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Handmade resin art production pipeline, tracking, and delivery updates
          </p>
        </div>

        {/* Action Buttons & Due Date Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Due Date Filter — compact dropdown */}
          <div className="relative" data-due-dropdown>
            <button
              type="button"
              onClick={() => setShowDueDropdown((v) => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-12 font-medium transition-colors cursor-pointer ${
                duePreset !== "all"
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface hover:bg-surface-muted text-text"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>
                Due:{" "}
                {{ all: "All", "7d": "7 days", "15d": "15 days", "1m": "1 month", custom: "Custom" }[duePreset]}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${showDueDropdown ? "rotate-180" : ""}`} />
            </button>

            {showDueDropdown && (
              <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {(["all", "7d", "15d", "1m", "custom"] as DueRangePreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      handleDuePresetChange(preset);
                      if (preset !== "custom") setShowDueDropdown(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-12 font-medium transition-colors cursor-pointer flex items-center justify-between ${
                      duePreset === preset
                        ? "bg-primary/10 text-primary"
                        : "text-text hover:bg-surface-muted"
                    }`}
                  >
                    {{ all: "All", "7d": "7 days", "15d": "15 days", "1m": "1 month", custom: "Custom range" }[preset]}
                    {duePreset === preset && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}

                {/* Custom date inputs shown inline in dropdown */}
                {showCustomDuePicker && (
                  <div className="px-3.5 py-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={customDueStartDate}
                        max={customDueEndDate || undefined}
                        onChange={(e) => setCustomDueStartDate(e.target.value)}
                        className="flex-1 px-2 py-1 text-11 rounded-md border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span className="text-text-muted text-11 shrink-0">to</span>
                      <input
                        type="date"
                        value={customDueEndDate}
                        min={customDueStartDate || undefined}
                        onChange={(e) => setCustomDueEndDate(e.target.value)}
                        className="flex-1 px-2 py-1 text-11 rounded-md border border-border bg-surface-muted text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { applyCustomDueRange(); setShowDueDropdown(false); }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-medium hover:bg-amber-600 transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="px-3.5 py-2 rounded-xl bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-13 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Order</span>
          </button>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "board"
                  ? "bg-surface-muted text-text font-bold"
                  : "text-text-muted hover:text-text"
              }`}
              title="Kanban Board view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-surface-muted text-text font-bold"
                  : "text-text-muted hover:text-text"
              }`}
              title="Table view"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Search & Status Tabs ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
          <button
            onClick={() => setSelectedStatus("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              selectedStatus === "all"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            All ({statusCounts?.all ?? orders.length})
          </button>
          {COLUMNS.map((col) => {
            const count = statusCounts ? statusCounts[col.id] ?? 0 : orders.filter((o) => o.status === col.id).length;
            return (
              <button
                key={col.id}
                onClick={() => setSelectedStatus(col.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  selectedStatus === col.id
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-surface-muted text-text-muted hover:text-text"
                }`}
              >
                {col.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:min-w-[240px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search order #, customer, item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-border bg-surface-muted text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <OrdersSkeleton viewMode={viewMode} selectedStatus={selectedStatus} />
        ) : viewMode === "board" ? (
          selectedStatus !== "all" ? (
            /* ─── Focus Grid View for Selected Stage ────────────────────────── */
            <div className="h-full overflow-y-auto custom-scrollbar space-y-4 pr-1">
              {/* Stage Summary Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3.5 rounded-xl border border-border bg-surface/80 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${COLUMNS.find((c) => c.id === selectedStatus)?.color ?? "bg-primary"}`} />
                  <h2 className="text-15 font-bold font-outfit text-text">
                    {COLUMNS.find((c) => c.id === selectedStatus)?.label ?? "Filtered"} Orders
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-11 font-bold bg-primary/10 text-primary">
                    {orders.length} {orders.length === 1 ? "order" : "orders"}
                  </span>
                  <span className="text-12 text-text-muted hidden md:inline">
                    · Full-width grid view
                  </span>
                </div>

                <button
                  onClick={() => setSelectedStatus("all")}
                  className="inline-flex items-center gap-1.5 text-12 font-semibold text-primary hover:underline cursor-pointer"
                >
                  <span>View all pipeline stages</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Responsive Card Grid */}
              {orders.length === 0 ? (
                <div className="rounded-xl border border-border bg-surface p-6 sm:p-10">
                  <EmptyState
                    title={`No orders in ${COLUMNS.find((c) => c.id === selectedStatus)?.label.toLowerCase() ?? "this stage"}`}
                    description="Move an order to this stage or switch back to the full pipeline."
                    action={{
                      label: "Back to full board",
                      onClick: () => setSelectedStatus("all"),
                      variant: "outline",
                    }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch pb-4">
                  {orders.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      isGrid
                      onSelect={() => setActiveOrder(o)}
                      onAdvance={(nextStatus) => handleOpenStatusDialog(o, nextStatus)}
                      onMoveTo={(status) => handleOpenStatusDialog(o, status)}
                      onCopyTracking={copyTracking}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ─── Full Pipeline Kanban View (All Stages) ────────────────────── */
            <div className="h-full flex items-start gap-3 xl:gap-3.5 2xl:gap-4 overflow-x-auto custom-scrollbar pb-2 pt-1 w-full">
              {COLUMNS.map((col) => {
                const columnOrders = orders.filter((o) => o.status === col.id);
                return (
                  <div
                    key={col.id}
                    className="flex-1 min-w-[220px] xl:min-w-0 h-full flex flex-col rounded-xl border border-border bg-surface/60 shadow-2xs transition-all overflow-hidden"
                  >
                    {/* Sticky Column Header with Quick Focus Click */}
                    <div
                      onClick={() => setSelectedStatus(col.id)}
                      className="shrink-0 flex items-center justify-between p-2.5 sm:p-3 border-b border-border/40 bg-surface/95 backdrop-blur-sm rounded-t-xl cursor-pointer hover:bg-surface-muted/60 transition-colors"
                      title={`Click to focus on ${col.label} orders`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${col.color} shrink-0`} />
                        <span className="text-12 sm:text-13 font-bold font-outfit text-text truncate">{col.label}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-11 font-bold bg-surface-muted text-text-muted hover:bg-primary/10 hover:text-primary transition-colors shrink-0">
                        {columnOrders.length}
                      </span>
                    </div>

                    {/* Independent Scrollable Body */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
                      {columnOrders.length === 0 ? (
                        <div className="p-4 rounded-lg border border-dashed border-border/60 text-center text-11 text-text-muted">
                          No orders
                        </div>
                      ) : (
                        columnOrders.map((o) => (
                          <OrderCard
                            key={o.id}
                            order={o}
                            onSelect={() => setActiveOrder(o)}
                            onAdvance={(nextStatus) => handleOpenStatusDialog(o, nextStatus)}
                            onMoveTo={(status) => handleOpenStatusDialog(o, status)}
                            onCopyTracking={copyTracking}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ─── Table View ────────────────────────────────────────────────────────── */
          <div className="h-full overflow-auto rounded-xl border border-border bg-surface custom-scrollbar">
            <table className="w-full text-left text-13">
              <thead className="sticky top-0 z-10 bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted">
                <tr>
                  <th className="p-3.5">Order</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Products</th>
                  <th className="p-3.5">Total</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Placed</th>
                  <th className="p-3.5">Tracking / Due</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted text-13 font-normal">
                      No orders found matching the filter.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const prodDays = calculateProductionDays(o);
                    const isOverdue = o.status === "in_production" && prodDays >= 45;
                    const isApproaching = o.status === "in_production" && prodDays >= 35 && prodDays < 45;

                    return (
                      <tr
                        key={o.id}
                        onClick={() => setActiveOrder(o)}
                        className={`hover:bg-surface-muted transition-colors cursor-pointer ${
                          isOverdue ? "bg-rose-500/[0.03]" : isApproaching ? "bg-amber-500/[0.02]" : ""
                        }`}
                      >
                        <td className="p-3.5 font-bold font-outfit text-text">#{o.orderNo}</td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <ChannelIcon channel={o.channel} size={13} />
                            <span className="font-medium text-text">{o.customerName}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-text-muted max-w-xs truncate">
                          {o.items?.map((i) => i.productName).join(", ") || "No items"}
                        </td>
                        <td className="p-3.5 font-bold font-outfit text-text tabular-nums">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span>₹{Number(o.totalAmount).toLocaleString("en-IN")}</span>
                            <OrderPaymentChip summary={o.paymentSummary} orderTotal={Number(o.totalAmount)} />
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="px-2 py-0.5 rounded text-11 font-semibold capitalize bg-surface-muted border border-border">
                              {o.status.replace("_", " ")}
                            </span>
                            {o.status === "in_production" && (
                              isOverdue ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white shadow-2xs">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  <span>{prodDays}d · Overdue (≥45d)</span>
                                </span>
                              ) : isApproaching ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                  <Clock className="w-2.5 h-2.5 shrink-0" />
                                  <span>{prodDays}d · Approaching 45d</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                  <Clock className="w-2.5 h-2.5 shrink-0" />
                                  <span>{prodDays}d in prod</span>
                                </span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-text-muted">{formatOrderDate(o.createdAt)}</td>
                        <td className="p-3.5">
                          {o.trackingId ? (
                            <span className="font-mono text-11 text-teal-500 flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5" /> {o.trackingId}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="text-12 text-text-muted">
                                {formatDueDate(o.expectedDeliveryDate)}
                              </span>
                              {(() => {
                                const ms = getOrderDueMilestone(o);
                                if (!ms) return null;
                                return (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ms.badgeClass}`}
                                    title={`Milestone: ${ms.label}`}
                                  >
                                    <Calendar className="w-2.5 h-2.5 shrink-0" />
                                    <span>{ms.label}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setActiveOrder(o)}
                              className="px-2.5 py-1 rounded-lg border border-border bg-surface hover:bg-surface-muted text-11 font-medium text-text cursor-pointer transition-colors"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Create Order SlideOver ───────────────────────────────────────────── */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={handleCloseCreateModal}
        >
          <div
            className="w-full max-w-lg bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-5 custom-scrollbar animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-18 font-bold font-outfit text-text">Create New Order</h3>
                <p className="text-12 text-text-muted">Enter customer details, products, and shipping info</p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="space-y-4">
              {/* Customer Info */}
              <div className="space-y-3 p-4 rounded-xl border border-border bg-surface-muted">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Customer Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-11 font-medium text-text">Customer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Divya Subramanian"
                      value={createCustomerName}
                      onChange={(e) => setCreateCustomerName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Channel</label>
                    <div className="relative mt-1">
                      <select
                        value={createChannel}
                        onChange={(e) => setCreateChannel(e.target.value as "whatsapp" | "instagram")}
                        className="w-full pl-3 pr-8 py-2 appearance-none rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="instagram">Instagram</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
                    </div>
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Phone / Handle</label>
                    <input
                      type="text"
                      placeholder="+91 98401 23456"
                      value={createCustomerPhone}
                      onChange={(e) => setCreateCustomerPhone(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="customer@gmail.com"
                      value={createCustomerEmail}
                      onChange={(e) => setCreateCustomerEmail(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Items Builder */}
              <div className="space-y-3 p-4 rounded-xl border border-border bg-surface">
                <div className="flex items-center justify-between">
                  <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Order Items</p>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-11 font-semibold text-primary hover:text-amber-600 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                <div className="space-y-2.5">
                  {createItems.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-border/70 bg-surface-muted space-y-2 relative">
                      {createItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="absolute right-2 top-2 text-text-muted hover:text-red-500 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Product Name (e.g. Ocean Coaster Set of 4)"
                          value={item.productName}
                          onChange={(e) => handleItemChange(idx, "productName", e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-[10px] text-text-muted">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="text-[10px] text-text-muted">Unit Price (₹)</label>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="col-span-1 flex flex-col justify-end">
                          <label className="text-[10px] text-text-muted">Line Total</label>
                          <span className="text-13 font-bold font-outfit text-text py-1.5">
                            ₹{((parseInt(String(item.quantity), 10) || 0) * (parseFloat(String(item.unitPrice)) || 0)).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Customizations (e.g. Gold foil, Roman numerals)"
                          value={item.productDescription}
                          onChange={(e) => handleItemChange(idx, "productDescription", e.target.value)}
                          className="w-full px-3 py-1.5 rounded-md border border-border bg-surface text-12 text-text-muted focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pricing Calculation */}
                <div className="pt-2 border-t border-border/50 space-y-1.5 text-12">
                  <div className="flex justify-between text-text-muted">
                    <span>Subtotal:</span>
                    <span>₹{createSubtotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Delivery Charge:</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={createDeliveryCharge}
                      onChange={(e) => setCreateDeliveryCharge(e.target.value)}
                      className="w-20 px-2 py-0.5 rounded border border-border bg-surface text-right text-12"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Discount Amount:</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={createDiscountAmount}
                      onChange={(e) => setCreateDiscountAmount(e.target.value)}
                      className="w-20 px-2 py-0.5 rounded border border-border bg-surface text-right text-12"
                    />
                  </div>
                  <div className="flex justify-between text-14 font-bold text-text pt-1 border-t border-border">
                    <span>Grand Total:</span>
                    <span className="text-primary font-outfit text-16">₹{createTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              {/* Delivery & Notes */}
              <div className="space-y-3 p-4 rounded-xl border border-border bg-surface-muted">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Delivery & Logistics</p>
                <div>
                  <label className="text-11 font-medium text-text">Shipping Address</label>
                  <textarea
                    rows={2}
                    placeholder="Street, Area, City, Pin Code"
                    value={createShippingAddress}
                    onChange={(e) => setCreateShippingAddress(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-11 font-medium text-text">Courier Partner</label>
                    <input
                      type="text"
                      placeholder="e.g. Shiprocket (DTDC)"
                      value={createCourier}
                      onChange={(e) => setCreateCourier(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Expected Delivery Date</label>
                    <input
                      type="date"
                      value={createExpectedDate}
                      onChange={(e) => setCreateExpectedDate(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-11 font-medium text-text">Customer Notes</label>
                  <input
                    type="text"
                    placeholder="Special requests or packaging instructions"
                    value={createCustomerNotes}
                    onChange={(e) => setCreateCustomerNotes(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createOrderMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {createOrderMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Order Detail SlideOver ───────────────────────────────────────────── */}
      {liveActiveOrder && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => {
            setActiveOrder(null);
            setIsEditingDetails(false);
            setUpdatingOrder(null);
          }}
        >
          <div
            className="w-full max-w-lg bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-6 custom-scrollbar animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-18 font-bold font-outfit text-text">
                  Order #{liveActiveOrder.orderNo}
                </h3>
                <p className="text-12 text-text-muted">Placed {formatOrderDate(liveActiveOrder.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveOrder(null);
                    setIsEditingDetails(false);
                    setUpdatingOrder(null);
                  }}
                  className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Status Lifecycle Stepper */}
            <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                  Status Lifecycle
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenStatusDialog(liveActiveOrder, liveActiveOrder.status)}
                  className="text-11 font-semibold text-primary hover:text-amber-600 cursor-pointer"
                >
                  Change Status
                </button>
              </div>
              <div className="flex items-center justify-between text-11 font-medium">
                {COLUMNS.map((c, i) => {
                  const currentIdx = COLUMNS.findIndex((x) => x.id === liveActiveOrder.status);
                  const isDone = i <= currentIdx;
                  return (
                    <div key={c.id} className="text-center flex flex-col items-center">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-10 font-bold mb-1 ${
                          isDone ? "bg-primary text-white" : "bg-border text-text-muted"
                        }`}
                      >
                        {i + 1}
                      </div>
                      <span className="text-[10px] hidden sm:inline">{c.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* In Production Follow-Up Banner */}
            {liveActiveOrder.status === "in_production" && (() => {
              const prodDays = calculateProductionDays(liveActiveOrder);
              const isOverdue = prodDays >= 45;
              const isApproaching = prodDays >= 35 && prodDays < 45;

              return (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isOverdue
                      ? "border-rose-500/50 bg-rose-500/[0.06] ring-1 ring-rose-500/30"
                      : isApproaching
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : "border-border bg-surface-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isOverdue
                            ? "bg-rose-500 text-white"
                            : isApproaching
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {isOverdue ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-13 font-bold font-outfit text-text">
                            {prodDays} Days in Production
                          </h4>
                          {isOverdue ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white shadow-2xs">
                              Overdue (≥45d)
                            </span>
                          ) : isApproaching ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                              Approaching 45d
                            </span>
                          ) : null}
                        </div>
                        <p className="text-11 text-text-muted mt-0.5 leading-relaxed">
                          {isOverdue
                            ? "This order has exceeded the 45-day Saba Art handcrafted resin curing and production timeline without moving to Ready."
                            : isApproaching
                            ? "Handmade production duration is nearing the 45-day threshold (35–44 days)."
                            : "Crafted by hand in Saba Art studio. Production timeline is within normal bounds."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {isEditingDetails ? (
              /* ── Edit Order Form (same style as Create Order) ── */
              <form onSubmit={(e) => { e.preventDefault(); handleSaveOrderEdits(); }} className="space-y-4">
                {/* Customer Information */}
                <div className="space-y-3 p-4 rounded-xl border border-border bg-surface-muted">
                  <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Customer Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-11 font-medium text-text">Customer Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Divya Subramanian"
                        value={editCustomerName}
                        onChange={(e) => setEditCustomerName(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-11 font-medium text-text">Channel</label>
                      <div className="mt-1 flex items-center gap-2 h-[34px] px-3 rounded-lg border border-border bg-surface-muted text-13 text-text-muted">
                        <ChannelIcon channel={liveActiveOrder.channel} size={13} />
                        <span className="capitalize">{liveActiveOrder.channel}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-11 font-medium text-text">Phone / Handle</label>
                      <input
                        type="text"
                        placeholder="+91 98401 23456"
                        value={editCustomerPhone}
                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-3 p-4 rounded-xl border border-border bg-surface">
                  <div className="flex items-center justify-between">
                    <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Order Items</p>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="text-11 font-semibold text-primary hover:text-amber-600 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {editItems.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-border/70 bg-surface-muted space-y-2 relative">
                        {editItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleEditRemoveItem(idx)}
                            className="absolute right-2 top-2 text-text-muted hover:text-red-500 cursor-pointer p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div>
                          <input
                            type="text"
                            required
                            placeholder="Product Name (e.g. Ocean Coaster Set of 4)"
                            value={item.productName}
                            onChange={(e) => handleEditItemChange(idx, "productName", e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <label className="text-[10px] text-text-muted">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              placeholder="1"
                              value={item.quantity}
                              onChange={(e) => handleEditItemChange(idx, "quantity", e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="text-[10px] text-text-muted">Unit Price (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              placeholder="0.00"
                              value={item.unitPrice}
                              onChange={(e) => handleEditItemChange(idx, "unitPrice", e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                          <div className="col-span-1 flex flex-col justify-end">
                            <label className="text-[10px] text-text-muted">Line Total</label>
                            <span className="text-13 font-bold font-outfit text-text py-1.5">
                              ₹{((parseInt(String(item.quantity), 10) || 0) * (parseFloat(String(item.unitPrice)) || 0)).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Customizations (e.g. Gold foil, Roman numerals)"
                            value={item.productDescription}
                            onChange={(e) => handleEditItemChange(idx, "productDescription", e.target.value)}
                            className="w-full px-3 py-1.5 rounded-md border border-border bg-surface text-12 text-text-muted focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-border/50 space-y-1.5 text-12">
                    <div className="flex justify-between text-text-muted">
                      <span>Subtotal:</span>
                      <span>₹{editSubtotal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Delivery Charge:</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={editDeliveryCharge}
                        onChange={(e) => setEditDeliveryCharge(e.target.value)}
                        className="w-20 px-2 py-0.5 rounded border border-border bg-surface text-right text-12"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-muted">Discount Amount:</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={editDiscountAmount}
                        onChange={(e) => setEditDiscountAmount(e.target.value)}
                        className="w-20 px-2 py-0.5 rounded border border-border bg-surface text-right text-12"
                      />
                    </div>
                    <div className="flex justify-between text-14 font-bold text-text pt-1 border-t border-border">
                      <span>Grand Total:</span>
                      <span className="text-primary font-outfit text-16">₹{editTotal.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>

                {/* Delivery & Logistics */}
                <div className="space-y-3 p-4 rounded-xl border border-border bg-surface-muted">
                  <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">Delivery & Logistics</p>
                  <div>
                    <label className="text-11 font-medium text-text">Shipping Address</label>
                    <textarea
                      rows={2}
                      placeholder="Street, Area, City, Pin Code"
                      value={editShippingAddress}
                      onChange={(e) => setEditShippingAddress(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-11 font-medium text-text">Courier Partner</label>
                      <input
                        type="text"
                        placeholder="e.g. Shiprocket (DTDC)"
                        value={editCourier}
                        onChange={(e) => setEditCourier(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-11 font-medium text-text">Expected Delivery Date</label>
                      <input
                        type="date"
                        value={editExpectedDate}
                        onChange={(e) => setEditExpectedDate(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Tracking ID</label>
                    <input
                      type="text"
                      placeholder="e.g. DTDC1234567890"
                      value={editTrackingId}
                      onChange={(e) => setEditTrackingId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-11 font-medium text-text">Customer Notes</label>
                    <input
                      type="text"
                      placeholder="Special requests or packaging instructions"
                      value={editCustomerNotes}
                      onChange={(e) => setEditCustomerNotes(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface text-13 text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails(false)}
                    className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateOrderMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {updateOrderMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            ) : (
              /* ── View Mode ── */
              <>
                {/* Customer & Chat Card */}
                <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-text">{liveActiveOrder.customerName}</h4>
                      <div className="flex items-center gap-1.5 text-12 text-text-muted mt-0.5">
                        <ChannelIcon channel={liveActiveOrder.channel} size={13} />
                        <span className="truncate">{liveActiveOrder.customerPhone || "Direct Customer"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/inbox`)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open chat</span>
                    </button>
                  </div>

                  <div className="text-12 text-text-muted pt-2 border-t border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text">Shipping & Logistics:</p>
                      <button
                        type="button"
                        onClick={() => handleStartEditing(liveActiveOrder)}
                        className="text-11 font-medium text-primary hover:text-amber-600 flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" /> Edit Order & Prices
                      </button>
                    </div>
                    <p className="text-text mt-0.5">
                      {liveActiveOrder.shippingAddress || "No shipping address provided"}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-mono text-11 text-teal-500">
                        Courier: {liveActiveOrder.courier || "Pending"}
                      </span>
                      {liveActiveOrder.trackingId && (
                        <button
                          type="button"
                          onClick={(e) => copyTracking(liveActiveOrder.trackingId!, e)}
                          className="font-mono text-11 text-teal-500 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {liveActiveOrder.trackingId} <Copy className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    {liveActiveOrder.expectedDeliveryDate && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <p className="text-11 text-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Due: {formatDueDate(liveActiveOrder.expectedDeliveryDate)} ({liveActiveOrder.expectedDeliveryDate})
                        </p>
                        {(() => {
                          const ms = getOrderDueMilestone(liveActiveOrder);
                          if (!ms) return null;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ms.badgeClass}`}
                              title={`Milestone: ${ms.label}`}
                            >
                              <Calendar className="w-2.5 h-2.5 shrink-0" />
                              <span>{ms.label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    )}
                    {liveActiveOrder.customerNotes && (
                      <p className="text-11 italic text-text-muted pt-1">
                        Notes: {liveActiveOrder.customerNotes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="space-y-2">
                  <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
                    Items ({liveActiveOrder.items?.length || 0})
                  </p>
                  <div className="divide-y divide-border/40 rounded-xl border border-border bg-surface p-3 space-y-2">
                    {liveActiveOrder.items?.map((it: DbOrderItem, idx: number) => (
                      <div key={it.id || idx} className="pt-2 first:pt-0 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-text text-13">{it.productName}</p>
                          <p className="text-11 text-text-muted">
                            Qty: {it.quantity} × ₹{Number(it.unitPrice).toLocaleString("en-IN")}
                          </p>
                          {it.productDescription && (
                            <p className="text-[11px] text-text-muted italic">{it.productDescription}</p>
                          )}
                        </div>
                        <p className="font-bold font-outfit text-text tabular-nums text-13">
                          ₹{(it.quantity * Number(it.unitPrice)).toLocaleString("en-IN")}
                        </p>
                      </div>
                    ))}
                    <div className="pt-2 space-y-1 text-12 text-text-muted">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹{Number(liveActiveOrder.subtotal).toLocaleString("en-IN")}</span>
                      </div>
                      {Number(liveActiveOrder.deliveryCharge) > 0 && (
                        <div className="flex justify-between">
                          <span>Delivery Charge:</span>
                          <span>₹{Number(liveActiveOrder.deliveryCharge).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {Number(liveActiveOrder.discountAmount) > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount:</span>
                          <span>-₹{Number(liveActiveOrder.discountAmount).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-3 flex items-center justify-between font-bold text-15 border-t border-border text-text">
                      <span>Grand Total</span>
                      <span className="text-primary tabular-nums">
                        ₹{Number(liveActiveOrder.totalAmount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setDeletingOrder(liveActiveOrder)}
                    className="text-12 font-medium text-red-500 hover:text-red-600 flex items-center gap-1 cursor-pointer p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Order
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenStatusDialog(liveActiveOrder, liveActiveOrder.status)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-medium text-text cursor-pointer transition-colors"
                    >
                      Change Status
                    </button>
                    <button
                      type="button"
                      onClick={() => setProgressModalOrder(liveActiveOrder)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-medium text-text flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Send WhatsApp / Instagram update to customer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Update</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartEditing(liveActiveOrder)}
                      className="px-4 py-1.5 rounded-lg bg-primary hover:bg-amber-600 text-12 font-semibold text-primary-foreground flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Order</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Payments & Invoicing Panel */}
            <div className="pt-2 border-t border-border/40">
              <PaymentsPanel
                orderId={liveActiveOrder.id}
                orderTotal={Number(liveActiveOrder.totalAmount)}
                order={liveActiveOrder}
              />
            </div>

            {/* Communication History (Instagram DM Updates) */}
            <div className="pt-2 border-t border-border/40">
              <OrderCommunicationHistory
                order={liveActiveOrder}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Status Update Dialog ─────────────────────────────────────────────── */}
      {updatingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setUpdatingOrder(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-16 font-bold font-outfit text-text">
                  Update Order Status: {targetStatus.replace("_", " ")}
                </h3>
                <p className="text-12 text-text-muted">
                  Order #{updatingOrder.orderNo} · {updatingOrder.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpdatingOrder(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Status Dropdown */}
            <div>
              <label className="text-11 font-medium text-text">Change status to:</label>
              <div className="relative mt-1">
                <select
                  disabled={updateOrderStatusMutation.isPending}
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as OrderStatus)}
                  className="w-full pl-3 pr-8 py-1.5 appearance-none rounded-lg border border-border bg-surface text-12 text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.label}
                    </option>
                  ))}
                  <option value="cancelled">Cancelled</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" aria-hidden />
              </div>
            </div>

            {/* If Dispatching, Tracking ID Input */}
            {targetStatus === "dispatched" && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-teal/30 bg-teal/5">
                <div>
                  <label className="text-11 font-medium text-text">Tracking ID</label>
                  <input
                    type="text"
                    disabled={updateOrderStatusMutation.isPending}
                    placeholder="e.g. SHP98421039IN"
                    value={statusTrackingId}
                    onChange={(e) => setStatusTrackingId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-12 text-text focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-11 font-medium text-text">Courier Partner</label>
                  <input
                    type="text"
                    disabled={updateOrderStatusMutation.isPending}
                    placeholder="e.g. Shiprocket (DTDC)"
                    value={statusCourier}
                    onChange={(e) => setStatusCourier(e.target.value)}
                    className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-12 text-text focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* Status message preview (the backend does not send this automatically) */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center justify-between text-11 font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> Status message preview
                </span>
                <span className="font-medium text-text-muted">Not sent automatically</span>
              </div>

              <div className="p-3 rounded-lg bg-surface border border-border shadow-xs text-12 text-text leading-relaxed">
                <p>
                  Hi <strong>{updatingOrder.customerName}</strong>! 🎉
                </p>
                <p className="mt-1">
                  Your order <strong>#{updatingOrder.orderNo}</strong> has been updated to{" "}
                  <strong className="text-primary capitalize">
                    {targetStatus.replace("_", " ")}
                  </strong>
                  .
                </p>
                {targetStatus === "dispatched" && (
                  <p className="mt-1 text-teal-500 font-medium">
                    Tracking ID: <strong>{statusTrackingId.trim() || "—"}</strong>
                    {statusCourier.trim() && <> (via {statusCourier.trim()})</>}
                  </p>
                )}
                <p className="mt-1 text-11 text-text-muted">
                  Thank you for supporting handcrafted resin art! — Saba Art, Coimbatore
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setUpdatingOrder(null)}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmStatusUpdate}
                disabled={updateOrderStatusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {updateOrderStatusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                <span>Confirm Update</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Screen Freeze Loader Overlay while Saving ──────────────────────── */}
      {(updateOrderStatusMutation.isPending || updateOrderMutation.isPending) && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 animate-in fade-in duration-150 select-none cursor-wait">
          <div className="p-6 rounded-2xl bg-surface border border-border shadow-2xl flex flex-col items-center gap-3 min-w-[220px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-14 font-bold text-text">
                {updateOrderStatusMutation.isPending ? "Updating Order Status..." : "Saving Order Changes..."}
              </p>
              <p className="text-11 text-text-muted mt-0.5">Please wait a moment</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ────────────────────────────────────────── */}
      {deletingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setDeletingOrder(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-500">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-15 font-bold font-outfit text-text">Delete Order?</h3>
                <p className="text-12 text-text-muted">This action will soft-delete the order.</p>
              </div>
            </div>
            <p className="text-13 text-text">
              Are you sure you want to remove order <strong>#{deletingOrder.orderNo}</strong> for{" "}
              <strong>{deletingOrder.customerName}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingOrder(null)}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-12 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={deleteOrderMutation.isPending}
                className="px-3.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-12 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleteOrderMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Production Progress Update Modal ─────────────────────────────── */}
      <SendProgressUpdateModal
        order={progressModalOrder}
        onClose={() => setProgressModalOrder(null)}
      />
    </div>
  );
}
