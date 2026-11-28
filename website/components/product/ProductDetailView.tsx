"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Plus,
  Minus,
  Sparkles,
  Truck,
  Clock,
  ChevronDown,
} from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { type Product } from "@/lib/products";
import { formatINR, resolveDeliveryZone } from "@/lib/pricing";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { POLICIES } from "@/lib/copy";
import { GlassRefraction } from "@/components/textures/GlassRefraction";
import { recordProductView, RecentlyViewed } from "@/components/product/RecentlyViewed";

interface ProductDetailViewProps {
  product: Product;
  relatedProducts: Product[];
}

export function ProductDetailView({ product, relatedProducts }: ProductDetailViewProps) {
  const [selectedSizeIndex, setSelectedSizeIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customOptions, setCustomOptions] = useState<Record<string, string | boolean>>({});
  const [pincode, setPincode] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState<ReturnType<typeof resolveDeliveryZone> | null>(null);

  const images = product.images && product.images.length > 0 ? product.images : [`/brand/product-${product.slug}.svg`];
  const activeImage = images[activeImageIndex] || images[0];

  const addItem = useCartStore((s) => s.addItem);
  const { toggleWishlist, isInWishlist } = useWishlistStore();
  const isWishlisted = isInWishlist(product.slug);

  const currentSize = product.sizes[selectedSizeIndex] || product.sizes[0]!;

  // Customization surcharge calculation
  const surchargeTotal = Object.entries(customOptions).reduce((acc, [optId, val]) => {
    if (!val) return acc;
    const optDef = product.customOptions.find((o) => o.id === optId);
    return acc + (optDef?.surcharge || 0);
  }, 0);

  const unitPrice = currentSize.price + surchargeTotal;
  const totalPrice = unitPrice * quantity;

  // Record product view for Recently Viewed feature
  useEffect(() => {
    recordProductView(product.slug);
  }, [product.slug]);

  // Restore remembered pincode
  useEffect(() => {
    const savedPin = localStorage.getItem("saba-delivery-pin") || "";
    if (savedPin) {
      setPincode(savedPin);
      setDeliveryEstimate(resolveDeliveryZone(savedPin));
    }
  }, []);

  const handlePincodeCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length >= 6) {
      localStorage.setItem("saba-delivery-pin", pincode);
      setDeliveryEstimate(resolveDeliveryZone(pincode));
    }
  };

  const handleAddToCart = () => {
    addItem({
      slug: product.slug,
      name: product.name,
      sizeName: currentSize.name,
      unitPrice,
      quantity,
      leadTimeDays: product.leadTimeDays,
      isCustomized: isCustomizing,
      customDetails: isCustomizing ? customOptions : undefined,
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-12 md:py-20">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span>/</span>
        <Link href="/shop" className="hover:text-[var(--text)]">Shop</Link>
        <span>/</span>
        <Link
          href={`/shop/${product.collection.toLowerCase().replace(/ & /g, "-").replace(/\s+/g, "-")}`}
          className="hover:text-[var(--text)]"
        >
          {product.collection}
        </Link>
        <span>/</span>
        <span className="text-[var(--text)] font-medium truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Product Showcase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* Left: Gallery View */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-4/5 w-full overflow-hidden rounded-3xl border border-[var(--border)] shadow-xl flex flex-col justify-end p-8 bg-[var(--surface-muted)]">
            <Image
              src={activeImage}
              alt={product.name}
              fill
              className="object-cover transition-opacity duration-300"
              sizes="(max-width: 1024px) 100vw, 58vw"
              priority
            />
            <GlassRefraction />

            {/* Wishlist Button */}
            <button
              type="button"
              onClick={() => toggleWishlist(product.slug)}
              className="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-xs text-white hover:bg-black/60 transition-colors z-10"
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart
                className={`h-5 w-5 ${isWishlisted ? "fill-[var(--primary)] text-[var(--primary)]" : "text-white"}`}
              />
            </button>

            <div className="glass-surface relative z-10 p-6 rounded-2xl border border-white/20 text-white max-w-md">
              <span className="text-xs uppercase tracking-widest text-white/80 font-medium">
                {product.collection}
              </span>
              <h1 className="font-serif text-3xl font-bold mt-1 text-white">{product.name}</h1>
              <p className="text-xs text-white/90 mt-1">{product.tagline}</p>
            </div>
          </div>

          {/* Multiple Image Thumbnail Selector */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
              {images.map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all ${
                    idx === activeImageIndex
                      ? "border-[var(--primary)] shadow-md scale-105"
                      : "border-[var(--border)] opacity-60 hover:opacity-100"
                  }`}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <Image
                    src={imgUrl}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Buy Controls */}
        <div className="lg:col-span-5 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)] border border-[var(--primary)]/20">
                Made to order
              </span>
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Clock className="h-3.5 w-3.5" /> {product.leadTimeDays} days pour & cure
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--text)]">
              {product.name}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
              {product.description}
            </p>

            {/* Live Price Display with Indian grouping */}
            <div className="mt-4 flex items-baseline gap-3">
              <span className="tabular-nums font-serif text-3xl font-bold text-[var(--primary)]">
                {formatINR(totalPrice)}
              </span>
              {quantity > 1 && (
                <span className="text-xs text-[var(--text-muted)] tabular-nums">
                  ({formatINR(unitPrice)} each)
                </span>
              )}
            </div>
          </div>

          {/* Size Selector */}
          <div className="space-y-3 pt-4 border-t border-[var(--border)]">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
              Dimensions & Sizing
            </label>
            <div className="grid grid-cols-2 gap-3">
              {product.sizes.map((s, idx) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSelectedSizeIndex(idx)}
                  className={`flex flex-col rounded-xl p-3 text-left border transition-all ${
                    selectedSizeIndex === idx
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-xs"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span className="text-xs font-semibold text-[var(--text)]">{s.name}</span>
                  <span className="tabular-nums text-xs text-[var(--text-muted)] mt-0.5">
                    {formatINR(s.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Inline Customizer Toggle */}
          {product.customizable && (
            <div className="space-y-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-base font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-[var(--primary)]" /> Customise this piece
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Adds 2 days to studio curing time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomizing(!isCustomizing)}
                  className="btn-secondary h-8 px-3 text-xs"
                >
                  {isCustomizing ? "Remove options" : "Customise"}
                </button>
              </div>

              {isCustomizing && (
                <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-5 animate-in fade-in duration-300">
                  {product.customOptions.map((opt) => (
                    <div key={opt.id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-medium text-[var(--text)]">{opt.label}</label>
                        {opt.surcharge && (
                          <span className="text-[var(--text-muted)] tabular-nums">
                            +{formatINR(opt.surcharge)}
                          </span>
                        )}
                      </div>

                      {opt.type === "select" && (
                        <select
                          value={typeof customOptions[opt.id] === "string" ? (customOptions[opt.id] as string) : opt.options?.[0] || ""}
                          onChange={(e) =>
                            setCustomOptions({ ...customOptions, [opt.id]: e.target.value })
                          }
                          className="input-field text-xs h-9"
                        >
                          {opt.options?.map((choice) => (
                            <option key={choice} value={choice}>
                              {choice}
                            </option>
                          ))}
                        </select>
                      )}

                      {opt.type === "text" && (
                        <input
                          type="text"
                          placeholder="e.g. S & A or Est. 2024"
                          value={typeof customOptions[opt.id] === "string" ? (customOptions[opt.id] as string) : ""}
                          onChange={(e) =>
                            setCustomOptions({ ...customOptions, [opt.id]: e.target.value })
                          }
                          className="input-field text-xs h-9"
                        />
                      )}

                      {opt.type === "toggle" && (
                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={!!customOptions[opt.id]}
                            onChange={(e) =>
                              setCustomOptions({ ...customOptions, [opt.id]: e.target.checked })
                            }
                            className="rounded border-[var(--border)] accent-[var(--primary)]"
                          />
                          <span className="text-xs text-[var(--text-muted)]">Include on piece</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quantity Stepper & Add to Cart */}
          <div className="space-y-4 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-4">
              {/* Stepper */}
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] h-[46px] px-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="tabular-nums px-4 text-sm font-semibold text-[var(--text)]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Primary Add to Cart Button (Only one amber button in view) */}
              <button
                type="button"
                onClick={handleAddToCart}
                className="btn-primary flex-1 h-[46px]"
              >
                Add to Cart · {formatINR(totalPrice)}
              </button>
            </div>

            {/* Bulk discount nudge */}
            {quantity >= 8 && quantity < 10 && (
              <p className="text-xs text-[var(--primary)] font-medium">
                Add {10 - quantity} more for 10% bulk discount.
              </p>
            )}
            {quantity >= 10 && (
              <p className="text-xs text-[var(--primary)] font-semibold">
                10% bulk discount applied at checkout!
              </p>
            )}
          </div>

          {/* Delivery Pincode Estimator (Section 10) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
              <Truck className="h-4 w-4 text-[var(--accent)]" />
              <span>Delivery Estimator</span>
            </div>
            <form onSubmit={handlePincodeCheck} className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit Pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="input-field text-xs h-9"
              />
              <button type="submit" className="btn-secondary h-9 text-xs px-3">
                Estimate
              </button>
            </form>

            {deliveryEstimate && (
              <div className="text-xs space-y-1 pt-1 text-[var(--text-muted)]">
                <p>
                  Destination: <strong className="text-[var(--text)]">{deliveryEstimate.label}</strong>
                </p>
                <p>
                  Courier rate:{" "}
                  <strong className="text-[var(--text)]">
                    {deliveryEstimate.charge === 0 ? "FREE" : formatINR(deliveryEstimate.charge)}
                  </strong>
                </p>
                <p>
                  Estimated transit: <strong>{deliveryEstimate.transitDaysMin}–{deliveryEstimate.transitDaysMax} days</strong> after studio dispatch.
                </p>
              </div>
            )}
          </div>

          {/* Accordion Specification Details */}
          <Accordion.Root type="single" collapsible className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            <Accordion.Item value="materials" className="py-3">
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)]">
                  <span>Materials & Origins</span>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                <ul className="list-disc pl-4 space-y-1">
                  {product.materials.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item value="care" className="py-3">
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)]">
                  <span>Care & Maintenance</span>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                {POLICIES.care.summary}
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item value="delivery" className="py-3">
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)]">
                  <span>Delivery & Lead Times</span>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                {POLICIES.delivery.summary}
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item value="returns" className="py-3">
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-center justify-between text-sm font-semibold text-[var(--text)] hover:text-[var(--primary)]">
                  <span>Returns & Warranty</span>
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] transition-transform duration-200" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="pt-2 text-xs text-[var(--text-muted)] leading-relaxed">
                {POLICIES.returns.summary} {POLICIES.warranty.summary}
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </div>
      </div>

      {/* Pairs Well With Section */}
      {relatedProducts.length > 0 && (
        <section className="mt-24 pt-16 border-t border-[var(--border)]">
          <h2 className="font-serif text-2xl font-semibold text-[var(--text)] mb-8">
            Pairs well with
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {relatedProducts.slice(0, 3).map((rp) => (
              <Link
                key={rp.slug}
                href={`/product/${rp.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex gap-4 hover:shadow-md transition-all"
              >
                <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-muted)]">
                  <Image
                    src={`/brand/product-${rp.slug}.svg`}
                    alt={rp.name}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>
                <div>
                  <h3 className="font-serif text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                    {rp.name}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{rp.collection}</p>
                  <p className="tabular-nums text-xs font-semibold text-[var(--text)] mt-2">
                    {formatINR(rp.sizes[0]?.price || 0)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recently Viewed Strip (Section 5 / 13A-E) */}
      <RecentlyViewed currentSlug={product.slug} />

      {/* Sticky Mobile Add To Cart Bar below 768px (Section 7) */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] p-4 shadow-xl md:hidden flex items-center justify-between">
        <div>
          <span className="tabular-nums text-lg font-bold text-[var(--primary)]">
            {formatINR(totalPrice)}
          </span>
          <span className="block text-[10px] text-[var(--text-muted)]">
            {product.leadTimeDays} days lead time
          </span>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          className="btn-primary text-sm h-11 px-6"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
