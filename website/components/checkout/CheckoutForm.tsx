"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Truck,
  Gift,
  Lock,
  AlertCircle,
} from "lucide-react";
import { useCartStore } from "@/lib/cartStore";
import { formatINR, resolveDeliveryZone } from "@/lib/pricing";
import { BRAND, POLICIES } from "@/lib/copy";

interface RazorpayResponse {
  razorpay_order_id?: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  theme: {
    color: string;
  };
  handler: (response: RazorpayResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

export function CheckoutForm() {
  const router = useRouter();
  const { items, getPricing, clearCart } = useCartStore();
  const pricing = getPricing();

  // Contact details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saveDetails] = useState(true);

  // Shipping address
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("Coimbatore");
  const [stateName, setStateName] = useState("Tamil Nadu");
  const [pincode, setPincode] = useState("641001");

  // Gift options (P1 feature B)
  const [isGift, setIsGift] = useState(false);
  const [giftWrapping, setGiftWrapping] = useState(false);
  const [giftNote, setGiftNote] = useState("");
  const [hidePrice, setHidePrice] = useState(true);

  // Policy agreement (Required)
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const isPaidRef = useRef(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Redirect to /cart if empty (only after mount and when not transitioning after payment)
  useEffect(() => {
    if (hasMounted && !isPaidRef.current && items.length === 0) {
      router.replace("/cart");
    }
  }, [hasMounted, items.length, router]);

  // Load saved details from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("saba-checkout-details");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.phone) setPhone(data.phone);
        if (data.email) setEmail(data.email);
        if (data.addressLine) setAddressLine(data.addressLine);
        if (data.city) setCity(data.city);
        if (data.stateName) setStateName(data.stateName);
        if (data.pincode) setPincode(data.pincode);
      } catch {}
    }
  }, []);

  const deliveryZone = resolveDeliveryZone(pincode, stateName);
  const giftWrapCost = giftWrapping ? 150 : 0;
  const grandTotal = pricing.total + giftWrapCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Please enter your full name.");
      return;
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setErrorMsg("Please enter a valid 10-digit Indian phone number.");
      return;
    }

    if (!pincode || pincode.length !== 6) {
      setErrorMsg("Please enter a valid 6-digit Indian delivery pincode.");
      return;
    }

    if (!agreedToPolicy) {
      setErrorMsg("Please acknowledge the 12-hour custom order cancellation policy.");
      return;
    }

    setLoading(true);

    if (saveDetails) {
      localStorage.setItem(
        "saba-checkout-details",
        JSON.stringify({ name, phone, email, addressLine, city, stateName, pincode })
      );
    }

    try {
      // 1. Create order on server (authoritative price calculation)
      const res = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer: { name, phone: cleanPhone, email },
          shippingAddress: { addressLine, city, state: stateName, pincode },
          giftOptions: { isGift, giftWrapping, giftNote, hidePrice },
        }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.error || "Order creation failed");
      }

      const { orderNo, razorpayOrderId, amount, keyId } = orderData;

      // 2. Open Razorpay Checkout or test verification
      if (typeof window !== "undefined" && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: keyId,
          amount,
          currency: "INR",
          name: BRAND.name,
          description: `Custom Resin Art Order #${orderNo}`,
          order_id: razorpayOrderId,
          prefill: {
            name,
            email,
            contact: cleanPhone,
          },
          theme: {
            color: "#E8912B", // Brand amber
          },
          handler: async function (response: RazorpayResponse) {
            // 3. Verify HMAC signature on server
            const verifyRes = await fetch("/api/checkout/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id || razorpayOrderId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderDetails: {
                  orderNo,
                  customer: { name, phone: cleanPhone, email },
                  shippingAddress: { addressLine, city, state: stateName, pincode },
                  giftOptions: { isGift, giftWrapping, giftNote, hidePrice },
                  items,
                  pricing,
                  amountInRupees: grandTotal,
                },
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              isPaidRef.current = true;
              clearCart();
              router.push(`/checkout/success?orderNo=${orderNo}`);
            } else {
              setErrorMsg(verifyData.error || "Payment signature verification failed.");
              setLoading(false);
            }
          },
          modal: {
            ondismiss: function () {
              setLoading(false);
              setErrorMsg("Payment was cancelled. Your cart remains saved.");
            },
          },
        });

        rzp.open();
      } else if (process.env.NEXT_PUBLIC_PAYMENTS_DEMO_MODE === "true") {
        // Explicit non-production demo simulation gated by environment variable
        const verifyRes = await fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderDetails: {
              orderNo,
              customer: { name, phone: cleanPhone, email },
              shippingAddress: { addressLine, city, state: stateName, pincode },
              giftOptions: { isGift, giftWrapping, giftNote, hidePrice },
              items,
              pricing,
              amountInRupees: grandTotal,
            },
            demoMode: true,
          }),
        });

        const verifyData = await verifyRes.json();
        if (verifyData.success) {
          isPaidRef.current = true;
          clearCart();
          router.push(`/checkout/success?orderNo=${orderNo}`);
        } else {
          setErrorMsg(verifyData.error || "Order verification failed.");
          setLoading(false);
        }
      } else {
        // Razorpay SDK missing and demo mode is disabled: fail closed, never fabricate payment
        setErrorMsg(
          "Payment gateway could not be loaded. Please ensure you have internet access and ad-blockers are disabled, or contact our Coimbatore studio on WhatsApp."
        );
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrorMsg(message);
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <h1 className="font-serif text-2xl font-bold text-[var(--text)]">Your Cart is Empty</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You don&apos;t have any pieces queued for checkout.
        </p>
        <div className="mt-6">
          <Link href="/shop" className="btn-primary">
            Explore Collection
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-12 md:px-8">
      {/* Load Razorpay SDK script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />

      <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-8">
        Single-Page Checkout
      </h1>

      {errorMsg && (
        <div className="mb-6 rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)] flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: 3 Collapsible Form Sections */}
        <div className="lg:col-span-7 space-y-8">
          {/* Section 1: Contact Details */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <h2 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-[#1A1620]">
                1
              </span>
              <span>Contact Information</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-[var(--text-muted)]">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Raman"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Phone (10-digit Indian) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  We&apos;ll send order dispatch updates on WhatsApp.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">Email Address</label>
                <input
                  type="email"
                  placeholder="priya@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Delivery Address & Zone */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <h2 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-[#1A1620]">
                2
              </span>
              <span>Delivery Address</span>
            </h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Street Address & House / Flat No. *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flat 402, Green Meadows, Race Course"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-muted)]">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-muted)]">State *</label>
                  <input
                    type="text"
                    required
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-muted)]">6-digit Pincode *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="input-field font-semibold"
                  />
                </div>
              </div>

              {/* Delivery Zone Resolution Badge */}
              <div className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-muted)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[var(--accent)]" />
                  <span>
                    Zone: <strong className="text-[var(--text)]">{deliveryZone.label}</strong>
                  </span>
                </div>
                <span className="font-semibold text-[var(--text)]">
                  {deliveryZone.charge === 0 ? "FREE" : formatINR(deliveryZone.charge)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2.5: Gift Options (P1 Feature B) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
                <Gift className="h-4 w-4 text-[var(--primary)]" />
                <span>Gift Options</span>
              </h2>
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="rounded border-[var(--border)] accent-[var(--primary)]"
                />
                <span>This order is a gift</span>
              </label>
            </div>

            {isGift && (
              <div className="space-y-4 pt-3 border-t border-[var(--border)]">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="text-xs">
                    <span className="font-medium text-[var(--text)]">
                      Artisan Gift Wrapping (+₹150)
                    </span>
                    <p className="text-[var(--text-muted)]">
                      Wrapped in organic seeded paper with a dried lavender wax seal.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={giftWrapping}
                    onChange={(e) => setGiftWrapping(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-medium text-[var(--text)]">Handwritten Gift Note</label>
                    <span className="text-[var(--text-muted)]">{giftNote.length}/200</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={200}
                    value={giftNote}
                    onChange={(e) => setGiftNote(e.target.value)}
                    placeholder="Write a personal message to be handwritten on studio handmade card..."
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)] font-serif italic"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hidePrice}
                    onChange={(e) => setHidePrice(e.target.checked)}
                    className="rounded border-[var(--border)] accent-[var(--primary)]"
                  />
                  <span>Hide price on parcel receipt (gift receipt)</span>
                </label>
              </div>
            )}
          </div>

          {/* Section 3: Review and Mandatory Cancellation Policy Agreement */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <h2 className="font-serif text-lg font-semibold text-[var(--text)] flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-[#1A1620]">
                3
              </span>
              <span>Review Policy & Booking Terms</span>
            </h2>

            <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-4 text-xs text-[var(--text)] space-y-2">
              <p className="font-semibold text-[var(--primary)]">12-Hour Cancellation Window:</p>
              <p className="leading-relaxed">
                {POLICIES.cancellation.summary}
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                required
                checked={agreedToPolicy}
                onChange={(e) => setAgreedToPolicy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)] shrink-0"
              />
              <span className="text-xs text-[var(--text)] leading-relaxed">
                {POLICIES.cancellation.warning}
              </span>
            </label>
          </div>
        </div>

        {/* Right: Order Summary Sidebar */}
        <div className="lg:col-span-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5 sticky top-28 shadow-xl">
          <h2 className="font-serif text-xl font-bold text-[var(--text)]">Order Summary</h2>

          {/* Line items list */}
          <div className="divide-y divide-[var(--border)] max-h-60 overflow-y-auto">
            {items.map((it) => (
              <div key={it.id} className="py-3 flex justify-between items-start text-xs">
                <div>
                  <span className="font-semibold text-[var(--text)]">
                    {it.name} × {it.quantity}
                  </span>
                  <p className="text-[var(--text-muted)] mt-0.5">
                    {it.sizeName}
                    {it.isCustomized && " · Customised"}
                  </p>
                </div>
                <span className="tabular-nums font-semibold text-[var(--text)]">
                  {formatINR(it.unitPrice * it.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Figures */}
          <div className="space-y-2 text-xs text-[var(--text-muted)] pt-3 border-t border-[var(--border)]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatINR(pricing.subtotal)}</span>
            </div>

            {pricing.discountTotal > 0 && (
              <div className="flex justify-between text-[var(--primary)] font-semibold">
                <span>Bulk Discount (10%)</span>
                <span className="tabular-nums">- {formatINR(pricing.discountTotal)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>Delivery ({deliveryZone.label.split(" ")[0]})</span>
              <span className="tabular-nums">
                {deliveryZone.charge === 0 ? "FREE" : formatINR(deliveryZone.charge)}
              </span>
            </div>

            {giftWrapping && (
              <div className="flex justify-between">
                <span>Artisan Gift Wrapping</span>
                <span className="tabular-nums">{formatINR(150)}</span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex justify-between items-baseline font-serif text-xl font-bold text-[var(--text)]">
            <span>Amount to Pay</span>
            <span className="tabular-nums text-2xl text-[var(--primary)]">
              {formatINR(grandTotal)}
            </span>
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Dispatch by{" "}
            <strong className="text-[var(--text)]">
              {new Date(pricing.dispatchByDate).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </strong>.
          </p>

          {/* Submit Button (Only one amber button in view) */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full text-base h-12 shadow-xl flex items-center justify-center gap-2"
          >
            <Lock className="h-4 w-4" />
            <span>{loading ? "Preparing Checkout..." : `Pay ${formatINR(grandTotal)}`}</span>
          </button>

          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
            <span>100% Encrypted Payment via Razorpay</span>
          </div>
        </div>
      </form>
    </div>
  );
}
