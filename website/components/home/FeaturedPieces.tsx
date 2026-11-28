"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { PRODUCTS, type Product } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { formatINR } from "@/lib/pricing";
import { useCartStore } from "@/lib/cartStore";

export function FeaturedPieces() {
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState(0);
  const addItem = useCartStore((s) => s.addItem);

  const handleAddFromModal = () => {
    if (!quickViewProduct) return;
    const size = quickViewProduct.sizes[selectedSizeIndex] || quickViewProduct.sizes[0]!;
    addItem({
      slug: quickViewProduct.slug,
      name: quickViewProduct.name,
      sizeName: size.name,
      unitPrice: size.price,
      quantity: 1,
      leadTimeDays: quickViewProduct.leadTimeDays,
      isCustomized: false,
    });
    setQuickViewProduct(null);
  };

  return (
    <section className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Fresh Pours
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl mt-2">
            Signature studio pieces.
          </h2>
        </div>
        <Link href="/shop" className="btn-tertiary text-sm mt-4 md:mt-0">
          <span>Explore entire catalogue ({PRODUCTS.length} pieces)</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Featured Card Grid — expanded for wide screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
        {PRODUCTS.slice(0, 8).map((product) => (
          <ProductCard
            key={product.slug}
            product={product}
            onQuickView={(p) => {
              setQuickViewProduct(p);
              setSelectedSizeIndex(0);
            }}
          />
        ))}
      </div>

      {/* Quick View Radix Dialog */}
      <Dialog.Root open={!!quickViewProduct} onOpenChange={(open) => !open && setQuickViewProduct(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
          <Dialog.Content className="glass-surface fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] p-6 sm:p-8 shadow-2xl focus:outline-none">
            {quickViewProduct && (
              <div>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                      {quickViewProduct.collection}
                    </span>
                    <Dialog.Title className="font-serif text-2xl font-bold text-[var(--text)] mt-1">
                      {quickViewProduct.name}
                    </Dialog.Title>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close"
                      className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="relative aspect-4/5 rounded-xl overflow-hidden bg-[var(--surface-muted)]">
                    <Image
                      src={quickViewProduct.images && quickViewProduct.images.length > 0 ? quickViewProduct.images[0] : `/brand/product-${quickViewProduct.slug}.svg`}
                      alt={quickViewProduct.name}
                      fill
                      className="object-cover"
                      sizes="320px"
                    />
                  </div>

                  <div className="flex flex-col justify-between space-y-4">
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      {quickViewProduct.description}
                    </p>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)] block mb-2">
                        Select Dimensions / Size
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {quickViewProduct.sizes.map((s, idx) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() => setSelectedSizeIndex(idx)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                              selectedSizeIndex === idx
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
                                : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                            }`}
                          >
                            {s.name} ({formatINR(s.price)})
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                      <span className="tabular-nums text-2xl font-semibold text-[var(--text)]">
                        {formatINR(quickViewProduct.sizes[selectedSizeIndex]?.price || 0)}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddFromModal}
                        className="btn-primary text-sm"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
