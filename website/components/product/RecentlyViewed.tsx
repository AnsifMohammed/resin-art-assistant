"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PRODUCTS, type Product } from "@/lib/products";
import { formatINR } from "@/lib/pricing";

const STORAGE_KEY = "saba-recently-viewed";

export function recordProductView(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const updated = [slug, ...existing.filter((s) => s !== slug)].slice(0, 6);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export function RecentlyViewed({ currentSlug }: { currentSlug?: string }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const slugs: string[] = JSON.parse(raw);
      // Filter out current product if on product page
      const filteredSlugs = currentSlug ? slugs.filter((s) => s !== currentSlug) : slugs;
      const matched = filteredSlugs
        .map((slug) => PRODUCTS.find((p) => p.slug === slug))
        .filter((p): p is Product => Boolean(p))
        .slice(0, 4);

      setItems(matched);
    } catch {}
  }, [currentSlug]);

  // Section 13A-E: Hidden below 3 items
  if (items.length < 3) {
    return null;
  }

  return (
    <section className="mt-20 border-t border-[var(--border)] pt-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-[var(--accent)] font-semibold">
            Your Studio Browse
          </span>
          <h3 className="font-serif text-xl font-semibold text-[var(--text)] mt-1">
            Recently Viewed Pieces
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((prod) => (
          <Link
            key={prod.slug}
            href={`/product/${prod.slug}`}
            className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-all hover:border-[var(--primary)]"
          >
            <div className="relative aspect-4/5 w-full overflow-hidden rounded-lg bg-[var(--surface-muted)]">
              <Image
                src={prod.images && prod.images.length > 0 ? prod.images[0] : `/brand/product-${prod.slug}.svg`}
                alt={prod.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, 25vw"
              />
            </div>
            <div className="mt-2.5">
              <h4 className="font-serif text-sm font-semibold text-[var(--text)] line-clamp-1">
                {prod.name}
              </h4>
              <p className="text-xs text-[var(--primary)] font-semibold mt-0.5 tabular-nums">
                {formatINR(prod.sizes[0]?.price || 0)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
