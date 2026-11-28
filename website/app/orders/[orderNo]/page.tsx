import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  Truck,
  MessageCircle,
  ShieldCheck,
  Gift,
  ExternalLink,
  Camera,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { getOrderByNumber, type OrderStatus } from "@/lib/ordersStore";
import { formatINR } from "@/lib/pricing";
import { BRAND } from "@/lib/copy";

interface OrderDetailProps {
  params: Promise<{ orderNo: string }>;
}

export async function generateMetadata({ params }: OrderDetailProps): Promise<Metadata> {
  const { orderNo } = await params;
  return {
    title: `Order #${orderNo} Tracking & Production Journal — Saba Art`,
    description: `Track live workshop production, curing stages, and courier dispatch for Saba Art order #${orderNo}.`,
  };
}

const TIMELINE_STAGES: { status: OrderStatus; label: string; desc: string; color: string }[] = [
  { status: "pending", label: "Order Placed", desc: "Order details received in studio system.", color: "#E8912B" },
  { status: "confirmed", label: "Payment Confirmed", desc: "Advance/payment confirmed and teak wood allocated.", color: "#2563EB" },
  { status: "in_production", label: "In Production", desc: "Layered resin pouring, botanical embedding, and curing.", color: "#7C5BD9" },
  { status: "ready", label: "Ready & Inspected", desc: "UV scratch inspection passed and edge-polish complete.", color: "#0E7C7B" },
  { status: "dispatched", label: "Dispatched", desc: "Sealed in protective crating and handed to courier.", color: "#0284C7" },
  { status: "delivered", label: "Delivered", desc: "Safely received at customer address.", color: "#0F766E" },
];

export default async function OrderDetailPage({ params }: OrderDetailProps) {
  const { orderNo } = await params;
  const normalized = orderNo.trim().toUpperCase();
  const order = getOrderByNumber(normalized);

  if (!order) {
    notFound();
  }

  const currentStageIndex = TIMELINE_STAGES.findIndex((s) => s.status === order.status);
  const activeIndex = currentStageIndex === -1 ? 0 : currentStageIndex;

  const whatsappMessage = encodeURIComponent(
    `Hello Saba Art studio! I have a question regarding my order #${order.orderNo}.`
  );

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-12 md:py-20">
      {/* Back button */}
      <div className="mb-8">
        <Link href="/orders" className="btn-tertiary text-xs inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Order Lookup</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[var(--border)]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Handcrafted Commission
          </span>
          <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-4xl mt-1">
            Order #{order.orderNo}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Customer: <strong className="text-[var(--text)]">{order.customerName}</strong> · Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>

        <a
          href={`https://wa.me/${BRAND.whatsapp.replace(/\D/g, "")}?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs h-10 px-4 self-start md:self-auto"
        >
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          <span>Message Studio About Order</span>
        </a>
      </div>

      {/* Prominent Dispatch Target Box */}
      <div className="mt-8 rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-[var(--primary)] flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>Target Studio Dispatch</span>
          </span>
          <p className="font-serif text-xl md:text-2xl font-semibold text-[var(--text)]">
            {order.status === "delivered" ? (
              "Piece delivered to your address"
            ) : order.status === "dispatched" ? (
              "In transit with carrier"
            ) : (
              `We're pouring your piece now. It should leave the studio by ${order.dispatchByDate}.`
            )}
          </p>
        </div>

        {order.trackingId && (
          <a
            href={`https://shiprocket.co/tracking/${order.trackingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs shrink-0 self-start md:self-auto"
          >
            <span>Track on Shiprocket</span>
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-12">
        {/* Left Col (7 cols): Vertical Status Timeline & Production Journal */}
        <div className="lg:col-span-7 space-y-12">
          {/* 7-Status Vertical Timeline */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-sm">
            <h2 className="font-serif text-xl font-semibold text-[var(--text)] mb-6">
              Status Timeline
            </h2>

            <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-[var(--border)]">
              {TIMELINE_STAGES.map((stage, idx) => {
                const isPassed = idx < activeIndex;
                const isCurrent = idx === activeIndex;

                return (
                  <div key={stage.status} className="relative group">
                    {/* Timeline Node dot */}
                    <div
                      className={`absolute -left-[31px] top-1 h-5 w-5 rounded-full border-2 transition-all ${
                        isCurrent
                          ? "border-[var(--primary)] bg-[var(--primary)] animate-[pulse_2.4s_infinite]"
                          : isPassed
                          ? "border-[var(--primary)] bg-[var(--surface)]"
                          : "border-[var(--border)] bg-[var(--surface)]"
                      }`}
                      style={{
                        borderColor: isPassed || isCurrent ? stage.color : undefined,
                        backgroundColor: isCurrent ? stage.color : undefined,
                      }}
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isCurrent
                              ? "text-[var(--text)]"
                              : isPassed
                              ? "text-[var(--text)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {stage.label}
                        </span>
                        {isCurrent && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider"
                            style={{ backgroundColor: stage.color }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                        {stage.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Production Progress Journal (P1 Feature A) */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <h2 className="font-serif text-xl font-semibold text-[var(--text)] flex items-center gap-2">
                <Camera className="h-5 w-5 text-[var(--primary)]" />
                <span>Production Progress Journal</span>
              </h2>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {order.journal?.length || 0} Updates
              </span>
            </div>

            {(!order.journal || order.journal.length === 0) ? (
              <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                We&apos;ll post photos here as your piece comes together.
              </div>
            ) : (
              <div className="space-y-6">
                {order.journal.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text)]">{entry.title}</span>
                      <span className="text-[var(--text-muted)]">
                        {new Date(entry.timestamp).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {entry.imageUrl && (
                      <div className="relative aspect-[4/5] max-h-72 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-black/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={entry.imageUrl}
                          alt={entry.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <p className="text-xs text-[var(--text-muted)] leading-relaxed font-serif italic">
                      &ldquo;{entry.caption}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col (5 cols): Order Summary, Customisations, and Delivery */}
        <div className="lg:col-span-5 space-y-6">
          {/* Items & Customisation Details */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-sm space-y-5">
            <h3 className="font-serif text-lg font-semibold text-[var(--text)]">Commission Pieces</h3>

            <div className="divide-y divide-[var(--border)]">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm text-[var(--text)]">{item.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Size: {item.sizeName} · Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                      {formatINR(item.unitPrice * item.quantity)}
                    </span>
                  </div>

                  {item.isCustomized && (
                    <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-xs space-y-1">
                      <p className="font-semibold text-[var(--primary)] flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Custom Studio Specifications:</span>
                      </p>
                      {item.customDetails && Object.entries(item.customDetails).map(([k, v]) => (
                        <p key={k} className="text-[var(--text-muted)]">
                          <strong className="text-[var(--text)] capitalize">{k}:</strong> {String(v)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Gift Information */}
            {order.isGift && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs space-y-1.5">
                <span className="font-semibold text-[var(--primary)] flex items-center gap-1.5">
                  <Gift className="h-4 w-4" />
                  <span>Artisan Gift Order</span>
                </span>
                {order.giftWrapping && <p className="text-[var(--text-muted)]">✓ Seeded paper & lavender wax seal</p>}
                {order.giftNote && (
                  <p className="font-serif italic text-[var(--text)] mt-1">
                    &ldquo;{order.giftNote}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Financial Summary */}
            <div className="pt-4 border-t border-[var(--border)] space-y-2 text-xs">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Subtotal:</span>
                <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(order.subtotal)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Bulk Discount:</span>
                  <span className="tabular-nums font-medium">-{formatINR(order.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Courier Delivery:</span>
                <span className="tabular-nums font-medium text-[var(--text)]">
                  {order.deliveryCharge === 0 ? "FREE" : formatINR(order.deliveryCharge)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border)] text-sm font-bold text-[var(--text)]">
                <span>Total Paid:</span>
                <span className="tabular-nums text-base">{formatINR(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Delivery Address & Courier */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-sm space-y-4 text-xs">
            <h3 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
              <Truck className="h-4 w-4 text-[var(--accent)]" />
              <span>Delivery Details</span>
            </h3>

            <div className="text-[var(--text)] leading-relaxed">
              <p className="font-semibold">{order.customerName}</p>
              <p>{order.shippingAddress.addressLine}</p>
              <p>{order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.pincode}</p>
              <p className="mt-2 text-[var(--text-muted)]">Phone: +91 {order.customerPhone}</p>
            </div>

            <div className="pt-3 border-t border-[var(--border)] text-[var(--text-muted)]">
              <span>Carrier: </span>
              <strong className="text-[var(--text)]">{order.courierName || "Shiprocket Air Express"}</strong>
              {order.trackingId && (
                <p className="mt-1 font-mono text-[var(--text)]">
                  AWB: {order.trackingId}
                </p>
              )}
            </div>
          </div>

          {/* Post-Delivery Care Notice (prominent if status is delivered) */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 space-y-2 text-xs">
            <h4 className="font-serif text-base font-semibold text-[var(--text)] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
              <span>Studio Care Guide</span>
            </h4>
            <p className="text-[var(--text-muted)] leading-relaxed">
              Keep your handcrafted resin piece looking pristine by wiping with soft water-damped cotton. Avoid direct heat over 50°C and abrasives.
            </p>
            <Link href="/policies#care" className="btn-tertiary text-xs block pt-1">
              Read complete care & warranty policy →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
