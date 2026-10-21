import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Clock,
  Truck,
  MessageSquare,
  Search,
  X,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelIcon } from "../components/shared/ChannelIcon.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";
import { PaymentsPanel } from "../components/orders/PaymentsPanel.tsx";
import { useOrderPayments } from "../hooks/usePayments.ts";
import {
  mockOrders,
  type Order,
} from "../data/mockData.ts";

function OrderPaymentChip({ orderId, orderTotal }: { orderId: string; orderTotal: number }) {
  const { data } = useOrderPayments(orderId);
  const summary = data?.summary;

  if (!summary || summary.totalPaid === 0) {
    const bal = summary?.balanceDue ?? orderTotal;
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-500/10 text-stone-600 dark:text-stone-400 border border-stone-500/20 tabular-nums">
        Bal: ₹{bal.toLocaleString("en-IN")}
      </span>
    );
  }

  if (summary.paymentState === "fully_paid") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
        Fully Paid
      </span>
    );
  }

  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 tabular-nums">
      Advance Paid · Bal: ₹{summary.balanceDue.toLocaleString("en-IN")}
    </span>
  );
}

type OrderStatus = Order["status"];

const COLUMNS: Array<{ id: OrderStatus; label: string; color: string }> = [
  { id: "pending", label: "Pending", color: "bg-stone-500" },
  { id: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { id: "in_production", label: "In Production", color: "bg-amber-500" },
  { id: "ready", label: "Ready", color: "bg-violet-500" },
  { id: "dispatched", label: "Dispatched", color: "bg-teal" },
  { id: "delivered", label: "Delivered", color: "bg-emerald-500" },
];

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<Order | null>(null);
  const [targetStatus, setTargetStatus] = useState<OrderStatus>("in_production");
  const [sendNotification, setSendNotification] = useState(true);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedStatus !== "all" && o.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [orders, selectedStatus, searchQuery]);

  const copyTracking = (trackingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(trackingId);
    toast.success("Tracking ID copied", { description: trackingId });
  };

  const handleOpenStatusDialog = (order: Order, nextStatus: OrderStatus, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setUpdatingOrder(order);
    setTargetStatus(nextStatus);
  };

  const confirmStatusUpdate = () => {
    if (!updatingOrder) return;
    setOrders((prev) =>
      prev.map((o) => (o.id === updatingOrder.id ? { ...o, status: targetStatus } : o))
    );
    if (sendNotification) {
      toast.success("Status updated & WhatsApp notification sent!", {
        description: `${updatingOrder.orderNumber} moved to ${targetStatus.replace("_", " ")}`,
      });
    } else {
      toast.success("Order status updated", {
        description: `${updatingOrder.orderNumber} moved to ${targetStatus.replace("_", " ")}`,
      });
    }
    setUpdatingOrder(null);
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ─── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-24 md:text-28 font-bold font-outfit text-text tracking-tight flex items-center gap-2">
            <span>Orders & Production</span>
            <span className="px-2 py-0.5 rounded-full text-12 font-bold bg-primary/10 text-primary-text">
              {orders.length} total
            </span>
            <SampleDataBadge title="Production pipeline using static demo orders" />
          </h1>
          <p className="text-13 text-text-muted mt-0.5">
            Handmade resin art production pipeline, tracking, and delivery updates
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === "board" ? "bg-surface-muted text-text font-bold" : "text-text-muted hover:text-text"
              }`}
              title="Kanban Board view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
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

      {/* ─── Search & Status Tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-12 font-medium">
          <button
            onClick={() => setSelectedStatus("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
              selectedStatus === "all"
                ? "bg-primary text-primary-foreground font-semibold"
                : "bg-surface-muted text-text-muted hover:text-text"
            }`}
          >
            All ({orders.length})
          </button>
          {COLUMNS.map((col) => {
            const count = orders.filter((o) => o.status === col.id).length;
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

        <div className="relative min-w-[240px]">
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

      {/* ─── Board View (Kanban 6 Columns) ────────────────────────────────────── */}
      {viewMode === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start overflow-x-auto custom-scrollbar pb-4">
          {COLUMNS.map((col) => {
            const columnOrders = filteredOrders.filter((o) => o.status === col.id);
            return (
              <div
                key={col.id}
                className="rounded-xl border border-border bg-surface/60 p-3 space-y-3 min-w-[220px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${col.color}`} />
                    <span className="text-13 font-bold font-outfit text-text">{col.label}</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-11 font-bold bg-surface-muted text-text-muted">
                    {columnOrders.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-border/60 text-center text-11 text-text-muted">
                      No orders
                    </div>
                  ) : (
                    columnOrders.map((o) => (
                      <div
                        key={o.id}
                        onClick={() => setActiveOrder(o)}
                        className="p-3.5 rounded-xl border border-border bg-surface hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-2.5 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-12 font-bold font-outfit text-text">
                            {o.orderNumber}
                          </span>
                          <span className="text-11 font-medium text-text-muted">{o.createdAt}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-12 text-text-muted">
                          <ChannelIcon channel={o.channel} size={13} />
                          <span className="font-semibold text-text truncate">{o.customerName}</span>
                        </div>

                        <div className="space-y-1">
                          {o.items.map((item, idx) => (
                            <p key={idx} className="text-11 text-text-muted line-clamp-1">
                              • {item.name}
                            </p>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-13 font-bold font-outfit text-text tabular-nums">
                              ₹{o.total.toLocaleString("en-IN")}
                            </span>
                            <OrderPaymentChip orderId={o.id} orderTotal={o.total} />
                          </div>

                          {o.trackingId ? (
                            <button
                              onClick={(e) => copyTracking(o.trackingId!, e)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-muted text-10 font-mono text-text hover:bg-border transition-colors"
                              title="Click to copy tracking ID"
                            >
                              <Truck className="w-3 h-3 text-teal" />
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {o.dueDate}
                            </span>
                          )}
                        </div>

                        <div className="pt-1">
                          <select
                            onClick={(e) => e.stopPropagation()}
                            value={o.status}
                            onChange={(e) =>
                              handleOpenStatusDialog(o, e.target.value as OrderStatus)
                            }
                            className="w-full text-10 font-semibold px-2 py-1 rounded bg-surface-muted border border-border text-text focus:outline-none cursor-pointer"
                          >
                            {COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                Move to: {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
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
            <tbody className="divide-y divide-border/40">
              {filteredOrders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setActiveOrder(o)}
                  className="hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <td className="p-3.5 font-bold font-outfit text-text">{o.orderNumber}</td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5">
                      <ChannelIcon channel={o.channel} size={13} />
                      <span className="font-medium text-text">{o.customerName}</span>
                    </div>
                  </td>
                  <td className="p-3.5 text-text-muted max-w-xs truncate">
                    {o.items.map((i) => i.name).join(", ")}
                  </td>
                  <td className="p-3.5 font-bold font-outfit text-text tabular-nums">
                    ₹{o.total.toLocaleString("en-IN")}
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-11 font-semibold capitalize bg-surface-muted border border-border">
                      {o.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3.5 text-text-muted">{o.createdAt}</td>
                  <td className="p-3.5">
                    {o.trackingId ? (
                      <span className="font-mono text-11 text-teal flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" /> {o.trackingId}
                      </span>
                    ) : (
                      <span className="text-12 text-text-muted">{o.dueDate}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Order Detail SlideOver ───────────────────────────────────────────── */}
      {activeOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-surface border-l border-border h-full shadow-2xl p-6 overflow-y-auto space-y-6 custom-scrollbar animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-18 font-bold font-outfit text-text">
                  Order {activeOrder.orderNumber}
                </h3>
                <p className="text-12 text-text-muted">Placed {activeOrder.createdAt}</p>
              </div>
              <button
                onClick={() => setActiveOrder(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-border bg-surface-muted space-y-3">
              <p className="text-11 font-semibold uppercase tracking-wider text-text-muted">
                Status Lifecycle
              </p>
              <div className="flex items-center justify-between text-11 font-medium">
                {COLUMNS.map((c, i) => {
                  const currentIdx = COLUMNS.findIndex((x) => x.id === activeOrder.status);
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

            <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-text">{activeOrder.customerName}</h4>
                  <div className="flex items-center gap-1.5 text-12 text-text-muted mt-0.5">
                    <ChannelIcon channel={activeOrder.channel} size={13} />
                    <span>WhatsApp customer</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/inbox`)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-12 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Open chat</span>
                </button>
              </div>

              <div className="text-12 text-text-muted pt-2 border-t border-border/40">
                <p className="font-medium text-text">Delivery Address:</p>
                <p className="mt-0.5">
                  {activeOrder.shippingAddress || "142 Race Course Road, Coimbatore, TN 641018"}
                </p>
                <p className="mt-1 font-mono text-11 text-teal">
                  Courier: {activeOrder.courier || "DTDC Express"} (Tracking:{" "}
                  {activeOrder.trackingId || "Assigned on dispatch"})
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-12 font-semibold uppercase tracking-wider text-text-muted">
                Items ({activeOrder.items.length})
              </p>
              <div className="divide-y divide-border/40 rounded-xl border border-border bg-surface p-3 space-y-2">
                {activeOrder.items.map((it, idx) => (
                  <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text text-13">{it.name}</p>
                      <p className="text-11 text-text-muted">Qty: {it.quantity}</p>
                    </div>
                    <p className="font-bold font-outfit text-text tabular-nums text-13">
                      ₹{(it.price * it.quantity).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}
                <div className="pt-3 flex items-center justify-between font-bold text-15 border-t border-border text-text">
                  <span>Grand Total</span>
                  <span className="text-primary tabular-nums">
                    ₹{activeOrder.total.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            {/* Payments & Invoicing Panel */}
            <div className="pt-2 border-t border-border/40">
              <PaymentsPanel orderId={activeOrder.id} orderTotal={activeOrder.total} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Status Update & WhatsApp PhonePreview Dialog ─────────────────────── */}
      {updatingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-16 font-bold font-outfit text-text">
                  Update Order Status: {targetStatus.replace("_", " ")}
                </h3>
                <p className="text-12 text-text-muted">
                  Order {updatingOrder.orderNumber} · {updatingOrder.customerName}
                </p>
              </div>
              <button
                onClick={() => setUpdatingOrder(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
              <div className="flex items-center justify-between text-11 font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> WhatsApp Notification Preview
                </span>
                <span>Template: {targetStatus.toUpperCase()}</span>
              </div>

              <div className="p-3 rounded-lg bg-surface border border-border shadow-xs text-12 text-text leading-relaxed">
                <p>
                  Hi <strong>{updatingOrder.customerName}</strong>! 🎉
                </p>
                <p className="mt-1">
                  Your order <strong>{updatingOrder.orderNumber}</strong> has been updated to{" "}
                  <strong className="text-primary capitalize">
                    {targetStatus.replace("_", " ")}
                  </strong>
                  .
                </p>
                {targetStatus === "dispatched" && (
                  <p className="mt-1 text-teal font-medium">
                    Tracking ID: <strong>DTDC-COIM-9821</strong>
                  </p>
                )}
                <p className="mt-1 text-11 text-text-muted">
                  Thank you for supporting handcrafted resin art! — Saba Art, Coimbatore
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-13 font-medium text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <span>Send automated WhatsApp notification to customer</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setUpdatingOrder(null)}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-13 font-medium text-text cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusUpdate}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-amber-600 text-primary-foreground text-13 font-semibold cursor-pointer shadow-xs"
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
