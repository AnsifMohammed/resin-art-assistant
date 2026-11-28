"use client";

import { useState, useMemo } from "react";
import { PRODUCTS, COLLECTIONS } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { ResinSwirl } from "@/components/textures/ResinSwirl";

export default function ShopPage() {
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [onlyCustomizable, setOnlyCustomizable] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc">("featured");

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) => {
      if (selectedCollection !== "all" && p.collection !== selectedCollection) {
        return false;
      }
      if (onlyCustomizable && !p.customizable) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      const minA = Math.min(...a.sizes.map((s) => s.price));
      const minB = Math.min(...b.sizes.map((s) => s.price));
      if (sortBy === "price-asc") return minA - minB;
      if (sortBy === "price-desc") return minB - minA;
      return a.sortOrder - b.sortOrder;
    });
  }, [selectedCollection, onlyCustomizable, sortBy]);

  return (
    <div className="relative min-h-screen py-16">
      <ResinSwirl opacity={0.04} />

      <div className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24">
        {/* Header */}
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Studio Catalogue
          </span>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl mt-2">
            Poured to order.
          </h1>
          <p className="mt-3 text-base text-[var(--text-muted)] leading-relaxed">
            Every piece is handmade from raw teak and crystal epoxy resin in Coimbatore. We don&apos;t hold stock — each order is poured specifically for your home.
          </p>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--border)] py-4 mb-12">
          {/* Collection Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCollection("all")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                selectedCollection === "all"
                  ? "bg-[var(--primary)] text-[#1A1620] font-semibold"
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              All Pieces ({PRODUCTS.length})
            </button>
            {COLLECTIONS.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setSelectedCollection(c.name)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  selectedCollection === c.name
                    ? "bg-[var(--primary)] text-[#1A1620] font-semibold"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Sort & Toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyCustomizable}
                onChange={(e) => setOnlyCustomizable(e.target.checked)}
                className="rounded border-[var(--border)] accent-[var(--primary)]"
              />
              <span>Customisable only</span>
            </label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "featured" | "price-asc" | "price-desc")}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text)] outline-none"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 sm:gap-8">
          {filteredProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}
