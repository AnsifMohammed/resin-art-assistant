"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { PRODUCTS, COLLECTIONS } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";

const STATIC_PAGES = [
  { title: "Custom Piece Builder", href: "/custom", desc: "Design bespoke shapes, teak bases, dried flowers, and engraving in real time." },
  { title: "The Seven-Day Studio Process", href: "/process", desc: "Walk through our multi-layer wave casting and 3000-grit optical polishing." },
  { title: "Studio Archives & Gallery", href: "/gallery", desc: "Explore past bespoke dining tables, ocean wave clocks, and floral heirlooms." },
  { title: "Policies & Care Guide", href: "/policies", desc: "Returns, 12-hour cancellation window, heat resistance, and lifetime warranty." },
  { title: "Frequently Asked Questions", href: "/faq", desc: "Common questions about delivery rates, international shipping, and customization." },
  { title: "About the Coimbatore Studio", href: "/about", desc: "The story behind our independent handcrafted resin art workshop." },
  { title: "Order Tracking & Journal", href: "/orders", desc: "Live status timeline and timestamped workshop production photographs." },
  { title: "Speak with the Artist", href: "/contact", desc: "Direct studio contact, WhatsApp inquiries, and workshop location." },
];

function SearchResultsContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);

  const q = query.trim().toLowerCase();

  const matchingProducts = useMemo(() => {
    if (!q) return PRODUCTS;
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.collection.toLowerCase().includes(q) ||
        p.materials.some((m) => m.toLowerCase().includes(q))
    );
  }, [q]);

  const matchingCollections = useMemo(() => {
    if (!q) return [];
    return COLLECTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [q]);

  const matchingPages = useMemo(() => {
    if (!q) return [];
    return STATIC_PAGES.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-16 md:py-24">
      {/* Search Header */}
      <div className="max-w-2xl mb-12 space-y-4">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Catalogue & Studio Search
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Search Results
        </h1>

        <div className="relative pt-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by piece name, materials (teak, floral), or collection..."
            className="input-field h-12 pl-11 text-sm font-medium"
          />
          <Search className="absolute left-3.5 top-5 h-4 w-4 text-[var(--text-muted)]" />
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Showing {matchingProducts.length} pieces{q ? ` matching "${query}"` : ""}
        </p>
      </div>

      {/* Matching Collections if any */}
      {matchingCollections.length > 0 && (
        <div className="mb-12 space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[var(--text)]">Curated Lines</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {matchingCollections.map((c) => (
              <Link
                key={c.slug}
                href={`/shop/${c.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all hover:border-[var(--primary)] hover:shadow-sm"
              >
                <h3 className="font-serif text-base font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">
                  {c.name}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">{c.description}</p>
                <span className="btn-tertiary text-xs mt-3 block">View Collection →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Matching Pages if any */}
      {matchingPages.length > 0 && (
        <div className="mb-12 space-y-4">
          <h2 className="font-serif text-lg font-semibold text-[var(--text)]">Studio Pages & Policies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matchingPages.map((pg) => (
              <Link
                key={pg.href}
                href={pg.href}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-5 transition-all hover:border-[var(--accent)]"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-base font-semibold text-[var(--text)]">{pg.title}</h3>
                  <ArrowRight className="h-4 w-4 text-[var(--accent)] transition-transform group-hover:translate-x-1" />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{pg.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Matching Product Grid */}
      <div className="space-y-6">
        <h2 className="font-serif text-xl font-semibold text-[var(--text)]">
          {q ? `Matching Pieces (${matchingProducts.length})` : "All Studio Pieces"}
        </h2>

        {matchingProducts.length === 0 ? (
          <div className="py-20 text-center rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8">
            <Sparkles className="mx-auto h-10 w-10 text-[var(--text-muted)] opacity-30 mb-3" />
            <h3 className="font-serif text-xl font-semibold text-[var(--text)]">No Pieces Matched Your Search</h3>
            <p className="mt-2 text-xs text-[var(--text-muted)] max-w-sm mx-auto">
              Try searching for &ldquo;ocean&rdquo;, &ldquo;clock&rdquo;, &ldquo;coaster&rdquo;, &ldquo;tray&rdquo;, or design a custom commission with our builder.
            </p>
            <div className="mt-6">
              <Link href="/custom" className="btn-primary text-xs">
                Design Your Piece
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {matchingProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        </div>
      }
    >
      <SearchResultsContent />
    </Suspense>
  );
}
