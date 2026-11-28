"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Trash2, RotateCcw, Plus, Minus, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/lib/cartStore";
import { formatINR } from "@/lib/pricing";
import { getProductBySlug } from "@/lib/products";
import { GoldLeafFlecks } from "@/components/textures/GoldLeafFlecks";

export function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    undoRemove,
    updateQuantity,
    recentlyRemoved,
    pincode,
    setPincode,
    getPricing,
  } = useCartStore();

  const [inputPin, setInputPin] = useState(pincode);
  const pricing = getPricing();

  useEffect(() => {
    setInputPin(pincode);
  }, [pincode]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closeCart();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeCart]);

  const handlePincodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPincode(inputPin);
  };

  const hasBulkDiscount = pricing.discountTotal > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Shopping Cart">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black backdrop-blur-xs"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="glass-surface flex w-screen max-w-md flex-col border-l border-[var(--border)] shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-xl font-semibold text-[var(--text)]">Your Cart</h2>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                    {items.reduce((sum, it) => sum + it.quantity, 0)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeCart}
                  aria-label="Close cart"
                  className="rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Undo Toast Notification */}
              {recentlyRemoved && (
                <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-2.5 text-sm text-[var(--text)]">
                  <span className="truncate">Removed {recentlyRemoved.item.name}</span>
                  <button
                    type="button"
                    onClick={undoRemove}
                    className="flex items-center gap-1 font-medium text-[var(--primary)] underline hover:opacity-80"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Undo
                  </button>
                </div>
              )}

              {/* Gold flourish on bulk discount */}
              {hasBulkDiscount && (
                <div className="relative overflow-hidden bg-[var(--surface-muted)] px-6 py-2.5 text-xs text-[var(--primary)] font-medium flex items-center gap-1.5">
                  <GoldLeafFlecks count={6} />
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--gold-leaf)]" />
                  <span>10% bulk discount applied to your order!</span>
                </div>
              )}

              {/* Content list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {items.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M10 14c.5 1 2.5 1 4 0" />
                        <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" strokeLinecap="round" />
                        <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="font-serif text-lg font-medium text-[var(--text)]">Your cart is empty.</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Every piece is poured to order. Let&apos;s find something for you.
                    </p>
                    <Link
                      href="/shop"
                      onClick={closeCart}
                      className="btn-secondary mt-6 text-sm"
                    >
                      Browse the collection
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {items.map((item) => (
                      <li key={item.id} className="py-4">
                        <div className="flex gap-4">
                          {/* Image Thumbnail */}
                          <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-muted)] border border-[var(--border)]">
                            <Image
                              src={getProductBySlug(item.slug)?.images?.[0] || `/brand/product-${item.slug}.svg`}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          </div>

                          <div className="flex flex-1 flex-col justify-between">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-serif text-sm font-semibold text-[var(--text)]">
                                  {item.name}
                                </h3>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                  {item.sizeName}
                                  {item.isCustomized && " · Customised (+2 days)"}
                                </p>
                              </div>
                              <span className="tabular-nums text-sm font-semibold text-[var(--text)]">
                                {formatINR(item.unitPrice * item.quantity)}
                              </span>
                            </div>

                            {/* Quantity Stepper & Remove */}
                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, -1)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="tabular-nums px-2.5 text-xs font-semibold text-[var(--text)]">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1 transition-colors"
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Bulk Nudge */}
                        {pricing.lineDiscounts[`${item.slug}-${item.sizeName}`]?.nudge && (
                          <p className="mt-2 text-xs text-[var(--primary)] font-medium">
                            {pricing.lineDiscounts[`${item.slug}-${item.sizeName}`]?.nudge}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer Summary & Checkout */}
              {items.length > 0 && (
                <div className="border-t border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
                  {/* Pincode Estimator */}
                  <form onSubmit={handlePincodeSubmit} className="space-y-1.5">
                    <label htmlFor="drawer-pincode" className="text-xs font-medium text-[var(--text-muted)]">
                      Delivery Pincode (Check rate & ETA)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="drawer-pincode"
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 641001"
                        value={inputPin}
                        onChange={(e) => setInputPin(e.target.value)}
                        className="input-field text-sm h-9"
                      />
                      <button type="submit" className="btn-secondary h-9 text-xs px-3">
                        Check
                      </button>
                    </div>
                    {pricing.deliveryDetails && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {pricing.deliveryDetails.label} —{" "}
                        <span className="font-semibold text-[var(--text)]">
                          {pricing.deliveryDetails.charge === 0 ? "FREE" : formatINR(pricing.deliveryDetails.charge)}
                        </span>
                      </p>
                    )}
                  </form>

                  {/* Pricing Breakdown */}
                  <div className="space-y-1.5 text-sm pt-2 border-t border-[var(--border)]">
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatINR(pricing.subtotal)}</span>
                    </div>

                    {hasBulkDiscount && (
                      <div className="flex justify-between text-[var(--primary)] font-medium">
                        <span>Bulk Discount (10%)</span>
                        <span className="tabular-nums">- {formatINR(pricing.discountTotal)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Delivery</span>
                      <span className="tabular-nums">
                        {pricing.deliveryCharge === 0 ? "FREE" : formatINR(pricing.deliveryCharge)}
                      </span>
                    </div>

                    <div className="flex justify-between font-serif text-base font-semibold text-[var(--text)] pt-2 border-t border-[var(--border)]">
                      <span>Total</span>
                      <span className="tabular-nums text-lg text-[var(--primary)]">{formatINR(pricing.total)}</span>
                    </div>

                    <p className="text-xs text-[var(--text-muted)] pt-1">
                      Estimated dispatch by{" "}
                      <strong className="text-[var(--text)]">
                        {new Date(pricing.dispatchByDate).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </strong>{" "}
                      (skipping Sundays).
                    </p>
                  </div>

                  {/* Primary Checkout Call To Action (Only one amber button in view!) */}
                  <Link
                    href="/checkout"
                    onClick={closeCart}
                    className="btn-primary w-full text-center"
                  >
                    Proceed to Checkout <ArrowRight className="h-4 w-4" />
                  </Link>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>Safe & encrypted payments via Razorpay</span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
