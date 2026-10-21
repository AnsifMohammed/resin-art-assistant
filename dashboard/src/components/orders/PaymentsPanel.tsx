import { useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Plus,
  Receipt,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMarkPaymentPaid,
  useOrderPayments,
  useRecordPayment,
  useVoidPayment,
} from "../../hooks/usePayments.ts";
import { formatDateTime } from "../../lib/format.ts";
import type { Payment, PaymentKind } from "../../types/index.ts";

export interface PaymentsPanelProps {
  orderId: string;
  orderTotal: number;
}

const PAYMENT_METHODS = ["UPI", "GPay", "PhonePe", "Bank Transfer", "Cash"] as const;

export function PaymentsPanel({ orderId, orderTotal: initialOrderTotal }: PaymentsPanelProps) {
  const { data, isLoading } = useOrderPayments(orderId);
  const recordPayment = useRecordPayment(orderId);
  const markPaymentPaid = useMarkPaymentPaid(orderId);
  const voidPayment = useVoidPayment(orderId);

  // Add Payment form state
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newKind, setNewKind] = useState<PaymentKind>("advance");
  const [newAmount, setNewAmount] = useState<string>("");
  const [newMethod, setNewMethod] = useState<string>("UPI");
  const [newReference, setNewReference] = useState<string>("");
  const [newNote, setNewNote] = useState<string>("");
  const [markPaidImmediately, setMarkPaidImmediately] = useState<boolean>(false);

  // Mark Paid dialog state
  const [markingPaidPayment, setMarkingPaidPayment] = useState<Payment | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState<string>("UPI");
  const [markPaidReference, setMarkPaidReference] = useState<string>("");

  // Void dialog state
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState<string>("");

  const summary = data?.summary;
  const paymentsList = data?.payments ?? [];

  const effectiveOrderTotal = summary?.orderTotal ?? initialOrderTotal;
  const totalPaid = summary?.totalPaid ?? 0;
  const totalPending = summary?.totalPending ?? 0;
  const balanceDue = summary ? summary.balanceDue : Math.max(0, effectiveOrderTotal - totalPaid);
  const paymentState =
    summary?.paymentState ??
    (totalPaid > 0
      ? balanceDue === 0
        ? "fully_paid"
        : "partially_paid"
      : "unpaid");

  // Open mark paid modal
  const handleOpenMarkPaid = (p: Payment) => {
    setMarkingPaidPayment(p);
    setMarkPaidMethod(p.method || "UPI");
    setMarkPaidReference(p.reference || "");
  };

  // Submit mark paid
  const handleConfirmMarkPaid = async () => {
    if (!markingPaidPayment) return;
    try {
      await markPaymentPaid.mutateAsync({
        paymentId: markingPaidPayment.id,
        data: {
          method: markPaidMethod,
          reference: markPaidReference.trim() || undefined,
        },
      });
      toast.success(
        `Payment of ₹${markingPaidPayment.amount.toLocaleString("en-IN")} marked as paid`,
      );
      setMarkingPaidPayment(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark payment as paid";
      toast.error(msg);
    }
  };

  // Submit void
  const handleConfirmVoid = async () => {
    if (!voidingPayment) return;
    if (!voidReason.trim()) {
      toast.error("Please enter a reason for voiding this payment");
      return;
    }
    try {
      await voidPayment.mutateAsync({
        paymentId: voidingPayment.id,
        reason: voidReason.trim(),
      });
      toast.success("Payment marked as voided");
      setVoidingPayment(null);
      setVoidReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to void payment";
      toast.error(msg);
    }
  };

  // Submit add payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseInt(newAmount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount in whole rupees");
      return;
    }

    try {
      await recordPayment.mutateAsync({
        kind: newKind,
        amount: parsedAmount,
        method: newMethod,
        reference: newReference.trim() || undefined,
        note: newNote.trim() || undefined,
        markPaidImmediately,
      });
      toast.success(
        markPaidImmediately
          ? `Recorded ₹${parsedAmount.toLocaleString("en-IN")} received`
          : `Payment request of ₹${parsedAmount.toLocaleString("en-IN")} recorded as pending`,
      );
      setNewAmount("");
      setNewReference("");
      setNewNote("");
      setMarkPaidImmediately(false);
      setIsAddFormOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Header & Financial Summary Cards ───────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            <span className="text-12 font-semibold uppercase tracking-wider text-text-muted">
              Payment & Invoicing
            </span>
          </div>

          {/* Status Badge Pill */}
          {paymentState === "fully_paid" ? (
            <span className="px-2.5 py-0.5 rounded-full text-11 font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-3 h-3" /> Fully Paid
            </span>
          ) : paymentState === "partially_paid" ? (
            <span className="px-2.5 py-0.5 rounded-full text-11 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1.5 shadow-xs">
              <Clock className="w-3 h-3" /> Partially Paid
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-11 font-semibold bg-surface-muted text-text-muted border border-border inline-flex items-center gap-1.5 shadow-xs">
              <AlertCircle className="w-3 h-3" /> Unpaid
            </span>
          )}
        </div>

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-3 gap-2">
          {/* Order Total */}
          <div className="p-3 rounded-xl border border-border bg-surface shadow-xs">
            <span className="text-[11px] font-medium text-text-muted block">Order Total</span>
            <span className="text-15 sm:text-17 font-bold font-outfit text-text tabular-nums block mt-0.5">
              ₹{effectiveOrderTotal.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Total Paid */}
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-xs">
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 block">
              Total Paid
            </span>
            <span className="text-15 sm:text-17 font-bold font-outfit text-emerald-700 dark:text-emerald-400 tabular-nums block mt-0.5">
              ₹{totalPaid.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Balance Due */}
          <div
            className={`p-3 rounded-xl border shadow-xs ${
              balanceDue > 0
                ? "border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10"
                : "border-border bg-surface"
            }`}
          >
            <span
              className={`text-[11px] font-medium block ${
                balanceDue > 0 ? "text-amber-700 dark:text-amber-400" : "text-text-muted"
              }`}
            >
              Balance Due
            </span>
            <span
              className={`text-15 sm:text-17 font-bold font-outfit tabular-nums block mt-0.5 ${
                balanceDue > 0 ? "text-amber-700 dark:text-amber-400" : "text-text-muted"
              }`}
            >
              ₹{balanceDue.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Payment Lines List ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-11 font-semibold uppercase tracking-wider text-text-muted">
            Payment Records {paymentsList.length > 0 && `(${paymentsList.length})`}
          </span>

          <button
            type="button"
            onClick={() => {
              if (!isAddFormOpen && balanceDue > 0 && !newAmount) {
                setNewAmount(String(balanceDue));
                setNewKind(totalPaid > 0 ? "balance" : "advance");
              }
              setIsAddFormOpen(!isAddFormOpen);
            }}
            className="inline-flex items-center gap-1 text-12 font-semibold text-primary hover:text-primary-text transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddFormOpen ? "Cancel" : "Add Payment"}</span>
          </button>
        </div>

        {/* Collapsible Add Custom Payment Form */}
        {isAddFormOpen && (
          <form
            onSubmit={handleRecordPayment}
            className="p-4 rounded-xl border border-primary/30 bg-surface shadow-xs space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-12 font-bold font-outfit text-text">Record Payment</span>
              <button
                type="button"
                onClick={() => setIsAddFormOpen(false)}
                className="text-text-muted hover:text-text p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Kind */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">Type</label>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as PaymentKind)}
                  className="w-full text-12 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="advance">Advance</option>
                  <option value="balance">Balance</option>
                  <option value="other">Other / Custom</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">
                  Amount (₹ whole rupees)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 1500"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full text-12 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                />
              </div>

              {/* Method */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">Method</label>
                <select
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  className="w-full text-12 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">
                  UTR / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Bank Txn ID"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  className="w-full text-12 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[11px] font-semibold text-text-muted block mb-1">
                Internal Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Customer promised balance on delivery"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full text-12 px-2.5 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Checkbox: Mark Paid Immediately */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="markPaidImmediately"
                checked={markPaidImmediately}
                onChange={(e) => setMarkPaidImmediately(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              <label
                htmlFor="markPaidImmediately"
                className="text-12 font-medium text-text cursor-pointer select-none"
              >
                Mark as received immediately (payment verified)
              </label>
            </div>

            {/* Submit button */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddFormOpen(false)}
                className="px-3 py-1.5 rounded-lg text-12 text-text-muted hover:text-text bg-surface-muted transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recordPayment.isPending}
                className="px-3.5 py-1.5 rounded-lg text-12 font-semibold bg-primary text-primary-foreground hover:brightness-105 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {recordPayment.isPending ? "Recording..." : "Save Payment"}
              </button>
            </div>
          </form>
        )}

        {/* Rows */}
        {isLoading ? (
          <div className="p-4 rounded-xl border border-border bg-surface text-center text-text-muted text-12 animate-pulse">
            Loading payment records...
          </div>
        ) : paymentsList.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-border bg-surface/50 text-center space-y-1.5">
            <p className="text-12 font-medium text-text-muted">No payments recorded yet</p>
            <p className="text-[11px] text-text-muted">
              Advance or balance payments recorded by an admin will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden shadow-xs">
            {paymentsList.map((p) => {
              const isPaid = p.status === "paid";
              const isVoid = p.status === "void";
              const isPending = p.status === "pending";

              return (
                <div
                  key={p.id}
                  className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                    isVoid ? "opacity-60 bg-surface-muted/30" : "hover:bg-surface-muted/20"
                  }`}
                >
                  {/* Left Side: Kind, Amount, Meta */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {/* Kind Pill */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          p.kind === "advance"
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                            : p.kind === "balance"
                              ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                              : "bg-surface-muted text-text-muted border border-border"
                        }`}
                      >
                        {p.kind}
                      </span>

                      {/* Amount */}
                      <span
                        className={`text-13 sm:text-14 font-bold font-outfit tabular-nums ${
                          isVoid ? "line-through text-text-muted" : "text-text"
                        }`}
                      >
                        ₹{p.amount.toLocaleString("en-IN")}
                      </span>

                      {/* Status Icon & Label */}
                      {isPaid && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Paid</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>Pending</span>
                        </span>
                      )}
                      {isVoid && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                          <Ban className="w-3.5 h-3.5 text-red-500" />
                          <span>Voided</span>
                        </span>
                      )}
                    </div>

                    {/* Meta info: Method, Reference, Timestamp, Void Reason */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                      {p.method && (
                        <span className="px-1.5 py-0.2 rounded bg-surface-muted text-text border border-border font-medium">
                          {p.method}
                        </span>
                      )}

                      {p.reference && (
                        <span className="font-mono text-text-muted">Ref: {p.reference}</span>
                      )}

                      {isPaid && p.paidAt && (
                        <span>Received {formatDateTime(p.paidAt)}</span>
                      )}

                      {isPending && (
                        <span>Created {formatDateTime(p.createdAt)}</span>
                      )}

                      {isVoid && p.voidedReason && (
                        <span className="text-red-600 dark:text-red-400 italic">
                          Reason: {p.voidedReason}
                        </span>
                      )}

                      {p.note && (
                        <span className="text-text-muted">· {p.note}</span>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Actions for pending row */}
                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleOpenMarkPaid(p)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-11 font-semibold inline-flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title="Confirm and mark payment as received"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Paid</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVoidingPayment(p);
                          setVoidReason("");
                        }}
                        className="px-2 py-1 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-500/10 text-11 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                        title="Void this payment line"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Void</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Mark Paid Modal ────────────────────────────────────────────────── */}
      {markingPaidPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-15 font-bold font-outfit text-text">Confirm Receipt</h3>
                <p className="text-12 text-text-muted">
                  Amount: ₹{markingPaidPayment.amount.toLocaleString("en-IN")} (
                  {markingPaidPayment.kind})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMarkingPaidPayment(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Payment Method Selector */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMarkPaidMethod(m)}
                      className={`px-2.5 py-1.5 rounded-lg text-11 font-semibold border transition-all text-left ${
                        markPaidMethod === m
                          ? "bg-primary/10 border-primary text-primary-text font-bold"
                          : "bg-surface-muted border-border text-text hover:bg-surface"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* UTR / Transaction Reference */}
              <div>
                <label className="text-[11px] font-semibold text-text-muted block mb-1">
                  UTR / Reference ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 429184029103 or UPI Ref"
                  value={markPaidReference}
                  onChange={(e) => setMarkPaidReference(e.target.value)}
                  className="w-full text-12 px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setMarkingPaidPayment(null)}
                className="px-3 py-1.5 rounded-lg text-12 font-medium text-text-muted hover:text-text bg-surface-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markPaymentPaid.isPending}
                onClick={handleConfirmMarkPaid}
                className="px-4 py-1.5 rounded-lg text-12 font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{markPaymentPaid.isPending ? "Confirming..." : "Confirm Receipt"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Void Dialog ────────────────────────────────────────────────────── */}
      {voidingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-15 font-bold font-outfit text-text text-red-600 dark:text-red-400">
                  Void Payment Line
                </h3>
                <p className="text-12 text-text-muted">
                  ₹{voidingPayment.amount.toLocaleString("en-IN")} ({voidingPayment.kind})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoidingPayment(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-text block">
                Reason for cancellation / void <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Customer cancelled order, incorrect amount entered, duplicate entry..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full text-12 p-2.5 rounded-lg bg-surface-muted border border-border text-text focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
              />
            </div>

            {/* Dialog Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setVoidingPayment(null)}
                className="px-3 py-1.5 rounded-lg text-12 font-medium text-text-muted hover:text-text bg-surface-muted cursor-pointer"
              >
                Keep Payment
              </button>
              <button
                type="button"
                disabled={voidPayment.isPending || !voidReason.trim()}
                onClick={handleConfirmVoid}
                className="px-4 py-1.5 rounded-lg text-12 font-semibold bg-red-600 hover:bg-red-500 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{voidPayment.isPending ? "Voiding..." : "Confirm Void"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
