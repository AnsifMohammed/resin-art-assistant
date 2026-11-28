"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Package,
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { formatINR } from "@/lib/pricing";
import { type StoredOrder } from "@/lib/ordersStore";

export default function OrdersLookupPage() {
  const router = useRouter();
  const [orderNo, setOrderNo] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [recentOrders, setRecentOrders] = useState<StoredOrder[]>([]);

  useEffect(() => {
    // Check saved checkout details or localStorage orders
    const saved = localStorage.getItem("saba-checkout-details");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.phone) setPhone(data.phone);
      } catch {}
    }

    // Load demo order SA-101 so guest visitors can test right away
    fetch("/api/orders/SA-101")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.order) {
          setRecentOrders([data.order]);
        }
      })
      .catch(() => {});
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!orderNo.trim()) {
      setErrorMsg("Please enter your Order Reference (e.g. SA-101).");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setErrorMsg("Please enter the 10-digit phone number provided during checkout.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo: orderNo.trim(),
          phone: cleanPhone,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.order) {
        router.push(`/orders/${encodeURIComponent(data.order.orderNo)}`);
      } else {
        setErrorMsg(data.error || "Order not found. Please check your details.");
        setLoading(false);
      }
    } catch {
      setErrorMsg("Unable to connect to order server. Please try again.");
      setLoading(false);
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case "confirmed":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600">Confirmed</span>;
      case "in_production":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 animate-pulse">In Production</span>;
      case "ready":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600">Ready</span>;
      case "dispatched":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600">Dispatched</span>;
      case "delivered":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600">Delivered</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600">Pending</span>;
    }
  };

  return (
    <div className="mx-auto max-w-[960px] px-6 py-16 md:py-24">
      {/* Title Header */}
      <div className="text-center space-y-3 mb-12">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Live Studio Dispatch
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Track Your Commission
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          No login or password needed. Enter your Order Number and phone number to view live curing stages and photos.
        </p>
      </div>

      {/* Lookup Form Card */}
      <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8 shadow-sm">
        {errorMsg && (
          <div className="mb-6 rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-3.5 text-xs text-[var(--danger)] flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLookup} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text)]">Order Reference *</label>
            <input
              type="text"
              placeholder="e.g. SA-101"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              className="input-field uppercase font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text)]">10-Digit Phone Number *</label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center h-12 text-sm mt-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Locating Order...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Find Order & Production Status
              </span>
            )}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-center text-[var(--text-muted)]">
          Protected by server-side rate limits (max 10 lookups per hour).
        </p>
      </div>

      {/* Recent / Sample Orders Preview */}
      {recentOrders.length > 0 && (
        <div className="mt-16 space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
              <Package className="h-4 w-4 text-[var(--primary)]" />
              <span>Available Demonstrations & Saved Orders</span>
            </h2>
            <span className="text-xs text-[var(--text-muted)] font-mono">{recentOrders.length} Found</span>
          </div>

          <div className="space-y-4">
            {recentOrders.map((ord) => (
              <Link
                key={ord.orderNo}
                href={`/orders/${ord.orderNo}`}
                className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all hover:border-[var(--primary)] hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-base text-[var(--text)]">#{ord.orderNo}</span>
                      {getStatusChip(ord.status)}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                      {ord.items.map((i) => `${i.name} (${i.sizeName})`).join(", ")}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 pt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Dispatch Target: {ord.dispatchByDate}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-0 border-[var(--border)]">
                    <span className="font-semibold text-sm tabular-nums text-[var(--text)]">
                      {formatINR(ord.total)}
                    </span>
                    <span className="btn-tertiary text-xs group-hover:text-[var(--primary)]">
                      View Journal <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trust Notice */}
      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-8">
        <div className="flex items-start gap-3">
          <Clock className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <p>
            <strong>Curing Cycles:</strong> Every resin piece requires 72 hours of dust-free room-temperature chemical curing to reach full Shore D hardness before shipping.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
          <p>
            <strong>Insured Transit:</strong> All parcels are double-boxed in high-density foam and dispatched via Shiprocket air priority with zero transit breakage warranty.
          </p>
        </div>
      </div>
    </div>
  );
}
