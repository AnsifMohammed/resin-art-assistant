"use client";

import Link from "next/link";
import Image from "next/image";
import { Plus, Minus, Trash2, ArrowRight } from "lucide-react";
import { useCartStore } from "@/lib/cartStore";
import { formatINR } from "@/lib/pricing";
import { getProductBySlug } from "@/lib/products";

export default function CartPage() {
  const { items, updateQuantity, removeItem, getPricing } = useCartStore();
  const pricing = getPricing();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[1320px] px-6 py-24 text-center">
        <h1 className="font-serif text-3xl font-bold text-[var(--text)]">Your Cart is Empty</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Every piece is poured to order. Let&apos;s find something for your home.
        </p>
        <div className="mt-6">
          <Link href="/shop" className="btn-primary">
            Browse Catalogue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-16 md:py-24">
      <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-8">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Line Items */}
        <div className="lg:col-span-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {items.map((it) => (
            <div key={it.id} className="py-6 flex gap-6 items-center">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-muted)] border border-[var(--border)]">
                <Image
                  src={getProductBySlug(it.slug)?.images?.[0] || `/brand/product-${it.slug}.svg`}
                  alt={it.name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-[var(--text)]">{it.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {it.sizeName}
                  {it.isCustomized && " · Customised (+2 days)"}
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <button
                      type="button"
                      onClick={() => updateQuantity(it.id, -1)}
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="tabular-nums px-3 text-xs font-semibold">{it.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(it.id, 1)}
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="text-xs text-[var(--danger)] hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
              <div className="text-right">
                <span className="tabular-nums font-serif text-lg font-semibold text-[var(--text)]">
                  {formatINR(it.unitPrice * it.quantity)}
                </span>
                {it.quantity > 1 && (
                  <span className="block text-xs text-[var(--text-muted)] tabular-nums">
                    {formatINR(it.unitPrice)} each
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary Card */}
        <div className="lg:col-span-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
          <h2 className="font-serif text-xl font-semibold text-[var(--text)]">Order Summary</h2>

          <div className="space-y-2 text-sm text-[var(--text-muted)] border-b border-[var(--border)] pb-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatINR(pricing.subtotal)}</span>
            </div>
            {pricing.discountTotal > 0 && (
              <div className="flex justify-between text-[var(--primary)] font-medium">
                <span>Bulk Discount (10%)</span>
                <span className="tabular-nums">- {formatINR(pricing.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="tabular-nums">
                {pricing.deliveryCharge === 0 ? "FREE" : formatINR(pricing.deliveryCharge)}
              </span>
            </div>
          </div>

          <div className="flex justify-between font-serif text-xl font-bold text-[var(--text)]">
            <span>Total</span>
            <span className="tabular-nums text-[var(--primary)]">{formatINR(pricing.total)}</span>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Estimated studio dispatch by{" "}
            <strong>
              {new Date(pricing.dispatchByDate).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </strong>.
          </p>

          <Link href="/checkout" className="btn-primary w-full text-center">
            Proceed to Checkout <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
