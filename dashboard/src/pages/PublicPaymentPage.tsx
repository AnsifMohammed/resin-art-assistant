import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { usePublicPayment, useSubmitPaymentUtr } from "../hooks/usePayments.ts";
import { formatDateTime } from "../lib/format.ts";

export default function PublicPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePublicPayment(id);
  const submitUtr = useSubmitPaymentUtr(id || "");

  const [utrInput, setUtrInput] = useState<string>("");
  const [hasSubmittedUtr, setHasSubmittedUtr] = useState<boolean>(false);
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);

  const copyUpiId = async (upiId: string) => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      toast.success("UPI ID copied to clipboard");
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      toast.error("Failed to copy UPI ID");
    }
  };

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrInput.trim()) {
      toast.error("Please enter a valid reference or UTR number");
      return;
    }

    try {
      await submitUtr.mutateAsync(utrInput.trim());
      setHasSubmittedUtr(true);
      toast.success("Payment reference submitted for verification!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit reference";
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-13 text-text-muted">Loading payment request...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 rounded-2xl border border-border bg-surface text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto text-18 font-bold">
            !
          </div>
          <h2 className="text-17 font-bold font-outfit text-text">Payment Request Not Found</h2>
          <p className="text-12 text-text-muted">
            This payment request link may have expired or is invalid. Please contact the seller for
            an updated payment link.
          </p>
        </div>
      </div>
    );
  }

  const { payment, order, business, upiLink } = data;
  const isPaid = payment.status === "paid";
  const isVoid = payment.status === "void";
  const isPending = payment.status === "pending";

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
    upiLink,
  )}`;

  const kindLabel =
    payment.kind === "advance"
      ? "Advance Payment"
      : payment.kind === "balance"
        ? "Balance Payment"
        : "Order Payment";

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-between p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Business Branding Header */}
        <div className="text-center space-y-1 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-11 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Payment Request</span>
          </div>
          <h1 className="text-20 sm:text-22 font-extrabold font-outfit text-text mt-2">
            {business.name}
          </h1>
          <p className="text-12 text-text-muted">Custom Resin Art & Handcrafted Pieces</p>
        </div>

        {/* Main Payment Card */}
        <div className="rounded-2xl border border-border bg-surface shadow-md overflow-hidden divide-y divide-border/60">
          {/* Order & Purpose Header */}
          <div className="p-5 bg-surface-muted/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
                {kindLabel}
              </span>
              <span className="text-14 font-bold font-outfit text-text block">
                Order #{order?.orderNo || "Custom Order"}
              </span>
              {order?.customerName && (
                <span className="text-11 text-text-muted block">For {order.customerName}</span>
              )}
            </div>

            {/* Status Badge */}
            {isPaid ? (
              <span className="px-2.5 py-1 rounded-full text-11 font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Paid</span>
              </span>
            ) : isVoid ? (
              <span className="px-2.5 py-1 rounded-full text-11 font-bold bg-surface-muted text-text-muted border border-border">
                Cancelled
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-11 font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Pending</span>
              </span>
            )}
          </div>

          {/* Amount Callout */}
          <div className="p-5 text-center bg-gradient-to-b from-surface via-surface to-surface-muted/20 space-y-1">
            <span className="text-11 font-semibold text-text-muted uppercase tracking-wider">
              Amount Due
            </span>
            <div className="text-32 sm:text-36 font-black font-outfit text-text tabular-nums tracking-tight">
              ₹{payment.amount.toLocaleString("en-IN")}
            </div>
            {order?.totalAmount && Number(order.totalAmount) > payment.amount && (
              <span className="text-11 text-text-muted block">
                Order total: ₹{Number(order.totalAmount).toLocaleString("en-IN")}
              </span>
            )}
          </div>

          {/* Pending Payment Actions */}
          {isPending && (
            <div className="p-5 space-y-5">
              {/* Primary Mobile CTA: Pay via UPI */}
              <div className="space-y-2">
                <a
                  href={upiLink}
                  className="w-full py-3 px-4 rounded-xl text-14 font-bold bg-primary text-primary-foreground hover:brightness-105 transition shadow-sm inline-flex items-center justify-center gap-2 text-center"
                >
                  <span>Pay via Any UPI App</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <p className="text-[11px] text-center text-text-muted">
                  Tap to launch Google Pay, PhonePe, Paytm or BHIM
                </p>
              </div>

              {/* QR Code Section */}
              <div className="p-4 rounded-xl border border-border bg-surface-muted/30 flex flex-col items-center text-center space-y-3">
                <div className="flex items-center gap-1.5 text-12 font-bold text-text">
                  <QrCode className="w-4 h-4 text-primary" />
                  <span>Scan to Pay via UPI</span>
                </div>
                <div className="w-44 h-44 bg-white p-2.5 rounded-xl border border-border shadow-xs flex items-center justify-center">
                  <img
                    src={qrImageUrl}
                    alt="UPI Payment QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-text-muted block">Or send to UPI ID:</span>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-border text-12 font-mono font-medium text-text">
                    <span>{business.upiId}</span>
                    <button
                      type="button"
                      onClick={() => copyUpiId(business.upiId)}
                      className="text-text-muted hover:text-text p-0.5 cursor-pointer"
                      title="Copy UPI ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {copiedUpi && (
                    <span className="text-[10px] text-emerald-600 block">Copied to clipboard!</span>
                  )}
                </div>
              </div>

              {/* Submit UTR / Reference ID */}
              <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                <div className="flex items-center gap-1.5 text-12 font-bold text-text">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Already Paid? Confirm Transaction</span>
                </div>

                {hasSubmittedUtr || payment.reference ? (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-12 text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Payment Reference Submitted</span>
                      <span className="text-11 font-mono block mt-0.5">
                        Ref: {payment.reference || utrInput}
                      </span>
                      <span className="text-11 text-text-muted block mt-1">
                        We have recorded your payment proof and will verify it shortly. Thank you!
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitUtr} className="space-y-2.5">
                    <p className="text-11 text-text-muted">
                      Enter the 12-digit UPI reference number or transaction ID from your payment app
                      receipt:
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        placeholder="e.g. 429184029103 or UPI Ref"
                        value={utrInput}
                        onChange={(e) => setUtrInput(e.target.value)}
                        className="flex-1 text-12 px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="submit"
                        disabled={submitUtr.isPending || !utrInput.trim()}
                        className="px-3.5 py-2 rounded-xl text-12 font-semibold bg-primary text-primary-foreground hover:brightness-105 transition cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {submitUtr.isPending ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Paid State Receipt Details */}
          {isPaid && (
            <div className="p-5 text-center space-y-3 bg-emerald-500/5">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-16 font-bold font-outfit text-text">
                Payment Received & Verified
              </h3>
              <p className="text-12 text-text-muted leading-relaxed max-w-xs mx-auto">
                Thank you! Your payment of ₹{payment.amount.toLocaleString("en-IN")} was received{" "}
                {payment.paidAt ? `on ${formatDateTime(payment.paidAt)}` : "successfully"}.
              </p>
              {payment.reference && (
                <div className="inline-block px-3 py-1 rounded-lg bg-surface border border-border text-11 font-mono text-text-muted">
                  Reference: {payment.reference}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center space-y-1">
          <p className="text-[11px] text-text-muted">
            Questions regarding this payment? Contact {business.name} directly on WhatsApp or
            Instagram.
          </p>
        </div>
      </div>
    </div>
  );
}
