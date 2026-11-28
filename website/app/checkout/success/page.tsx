"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  CheckCircle2,
  Calendar,
  Truck,
  MessageCircle,
  ArrowRight,
  ShieldCheck,
  Gift,
  HelpCircle,
} from "lucide-react";
import { type StoredOrder } from "@/lib/ordersStore";
import { formatINR } from "@/lib/pricing";
import { BRAND } from "@/lib/copy";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("orderNo");
  const [order, setOrder] = useState<StoredOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderNo) {
      setLoading(false);
      return;
    }

    // Trigger celebratory one-shot amber + gold-leaf confetti unless prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion) {
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#E8912B", "#C9A227", "#F4F1EC", "#0E7C7B"],
      });
    }

    // Fetch order details
    fetch(`/api/orders/${encodeURIComponent(orderNo)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.order) {
          setOrder(data.order);
        }
      })
      .catch((err) => console.error("Error loading order:", err))
      .finally(() => setLoading(false));
  }, [orderNo]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  // Graceful "nothing to show" state if visited directly with no orderNo or invalid order
  if (!orderNo || !order) {
    return (
      <div className="mx-auto max-w-xl px-6 py-28 text-center">
        <HelpCircle className="mx-auto h-12 w-12 text-[var(--text-muted)] opacity-40 mb-4" />
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)]">No Active Order Found</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">
          It looks like you navigated to this page directly without an order reference. If you recently placed an order, you can look it up using your phone number.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/orders" className="btn-secondary text-sm">
            Find Your Order
          </Link>
          <Link href="/shop" className="btn-primary text-sm">
            Return to Studio Gallery
          </Link>
        </div>
      </div>
    );
  }

  const whatsappMessage = encodeURIComponent(
    `Hello Saba Art studio! I just placed order #${order.orderNo} for custom resin pieces. Looking forward to the updates!`
  );

  return (
    <div className="mx-auto max-w-[960px] px-6 py-16 md:py-24">
      {/* Hero Badge */}
      <div className="text-center space-y-4 mb-12">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          Commission Confirmed
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          We&apos;re getting your resin ready to pour.
        </h1>
        <p className="text-base text-[var(--text-muted)] max-w-lg mx-auto">
          Thank you, <strong className="text-[var(--text)]">{order.customerName}</strong>. Your payment was received and your piece has entered the studio production queue.
        </p>
      </div>

      {/* Main Order Card */}
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-10 shadow-sm space-y-8">
        {/* Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
          <div>
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">Order Reference</span>
            <p className="font-mono text-xl font-bold text-[var(--text)] mt-0.5">#{order.orderNo}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">Estimated Studio Dispatch</span>
            <p className="font-serif text-lg font-semibold text-[var(--accent)] flex items-center gap-1.5 mt-0.5">
              <Calendar className="h-4 w-4" />
              <span>{order.dispatchByDate}</span>
            </p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">Status</span>
            <span className="block mt-1 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600">
              Confirmed & Paid
            </span>
          </div>
        </div>

        {/* Ordered Pieces */}
        <div className="space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[var(--text)]">Pieces in Production</h2>
          <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4">
            {order.items.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-[var(--text)]">{item.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Size: {item.sizeName} · Qty: {item.quantity}
                    {item.isCustomized && " · Custom Art Piece (+2 days curing)"}
                  </p>
                </div>
                <span className="font-medium tabular-nums text-[var(--text)]">
                  {formatINR(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Gift Options if any */}
        {order.isGift && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-5 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--primary)] font-semibold">
              <Gift className="h-4 w-4" />
              <span>Artisan Gift Order</span>
            </div>
            {order.giftWrapping && <p className="text-[var(--text-muted)]">✓ Seeded paper wrapping with dried lavender seal</p>}
            {order.hidePrice && <p className="text-[var(--text-muted)]">✓ Price hidden on shipment receipt</p>}
            {order.giftNote && (
              <div className="mt-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] font-serif italic text-sm text-[var(--text)]">
                &ldquo;{order.giftNote}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* Financial & Shipping Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          <div>
            <span className="uppercase tracking-wider font-semibold text-[var(--text)]">Delivery Destination</span>
            <p className="mt-1 leading-relaxed text-[var(--text)]">
              {order.shippingAddress.addressLine}<br />
              {order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.pincode}
            </p>
            <p className="mt-2 text-[var(--text-muted)] flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Carrier: {order.courierName || "Shiprocket Air Express"}</span>
            </p>
          </div>

          <div className="space-y-1.5 md:text-right">
            <div className="flex justify-between md:justify-end md:gap-8">
              <span>Subtotal:</span>
              <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(order.subtotal)}</span>
            </div>
            {order.discountTotal > 0 && (
              <div className="flex justify-between md:justify-end md:gap-8 text-emerald-600">
                <span>Bulk Savings:</span>
                <span className="tabular-nums font-medium">-{formatINR(order.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between md:justify-end md:gap-8">
              <span>Delivery:</span>
              <span className="tabular-nums font-medium text-[var(--text)]">
                {order.deliveryCharge === 0 ? "FREE" : formatINR(order.deliveryCharge)}
              </span>
            </div>
            <div className="flex justify-between md:justify-end md:gap-8 pt-2 border-t border-[var(--border)] text-sm font-bold text-[var(--text)]">
              <span>Total Paid:</span>
              <span className="tabular-nums text-base">{formatINR(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[var(--border)]">
          <Link
            href={`/orders/${order.orderNo}`}
            className="btn-primary w-full sm:w-auto text-sm justify-center"
          >
            <span>Track Order & Production Journal</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <a
            href={`https://wa.me/${BRAND.whatsapp.replace(/\D/g, "")}?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary w-full sm:w-auto text-sm justify-center"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <span>Chat with Studio on WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Care Instructions Primer */}
      <div className="mt-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 space-y-3">
        <h3 className="font-serif text-base font-semibold text-[var(--text)] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
          <span>Quick Care Primer While You Wait</span>
        </h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          All Saba Art pieces are cured for a minimum of 72 hours before dispatch. Once delivered, display away from direct harsh all-day sunlight, wipe gently with a soft damp microfibre cloth, and never place in a microwave or dishwasher. Full instructions are available on our policies page.
        </p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          </div>
        }
      >
        <SuccessContent />
      </Suspense>
    </main>
  );
}
