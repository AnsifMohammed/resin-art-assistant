"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PRODUCTS, COLLECTIONS } from "@/lib/products";
import { formatINR } from "@/lib/pricing";

const STATIC_PAGES = [
  { title: "Custom Piece Builder", href: "/custom" },
  { title: "Studio Archives & Gallery", href: "/gallery" },
  { title: "How We Pour & Cure", href: "/process" },
  { title: "About the Studio", href: "/about" },
  { title: "Care Instructions & Policies", href: "/policies" },
  { title: "Track Your Order", href: "/orders" },
];

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchPalette({ isOpen, onClose }: SearchPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Toggle if needed or open
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered results
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.materials.some((m) => m.toLowerCase().includes(q))
    );
  }, [query]);

  const filteredCollections = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return COLLECTIONS.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const filteredPages = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return STATIC_PAGES.filter((p) => p.title.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black backdrop-blur-xs"
          />

          {/* Palette Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.2 }}
            className="glass-surface relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] shadow-2xl"
          >
            {/* Search Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) {
                  handleSelect(`/search?q=${encodeURIComponent(query.trim())}`);
                }
              }}
              className="flex items-center border-b border-[var(--border)] px-4"
            >
              <Search className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pieces, floral preservation, wall clocks... (ESC to close)"
                className="w-full border-none bg-transparent py-4 pl-3 pr-4 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {/* Results Area */}
            <div className="max-h-96 overflow-y-auto p-4 space-y-4">
              {query.trim() === "" ? (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Popular Inquiries
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Ocean Coaster Set", "12 inch Clock", "Wedding Garland Preservation", "Large Tray"].map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setQuery(item)}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Products Group */}
                  {filteredProducts.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Pieces ({filteredProducts.length})
                      </div>
                      <div className="space-y-1">
                        {filteredProducts.map((p) => {
                          const minPrice = Math.min(...p.sizes.map((s) => s.price));
                          const maxPrice = Math.max(...p.sizes.map((s) => s.price));
                          const priceStr =
                            minPrice === maxPrice
                              ? formatINR(minPrice)
                              : `${formatINR(minPrice)} – ${formatINR(maxPrice)}`;

                          return (
                            <button
                              key={p.slug}
                              type="button"
                              onClick={() => handleSelect(`/product/${p.slug}`)}
                              className="w-full flex items-center justify-between rounded-lg p-2.5 text-left transition-colors hover:bg-[var(--surface-muted)] group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-muted)]">
                                  <Image
                                    src={p.images && p.images.length > 0 ? p.images[0] : `/brand/product-${p.slug}.svg`}
                                    alt={p.name}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                  />
                                </div>
                                <div>
                                  <div className="font-serif text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                                    {p.name}
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]">{p.collection}</div>
                                </div>
                              </div>
                              <span className="tabular-nums text-sm font-medium text-[var(--text)]">
                                {priceStr}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Collections Group */}
                  {filteredCollections.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Collections
                      </div>
                      <div className="space-y-1">
                        {filteredCollections.map((c) => (
                          <button
                            key={c.slug}
                            type="button"
                            onClick={() => handleSelect(`/shop/${c.slug}`)}
                            className="w-full flex items-center justify-between rounded-lg p-2 text-left hover:bg-[var(--surface-muted)] group text-sm text-[var(--text)]"
                          >
                            <span>{c.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pages Group */}
                  {filteredPages.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Studio Guidance
                      </div>
                      <div className="space-y-1">
                        {filteredPages.map((pg) => (
                          <button
                            key={pg.href}
                            type="button"
                            onClick={() => handleSelect(pg.href)}
                            className="w-full flex items-center justify-between rounded-lg p-2 text-left hover:bg-[var(--surface-muted)] text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            <span>{pg.title}</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full search page link */}
                  {query.trim() && (
                    <div className="pt-2 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => handleSelect(`/search?q=${encodeURIComponent(query.trim())}`)}
                        className="btn-tertiary text-xs w-full justify-center text-center py-2 text-[var(--primary)]"
                      >
                        View all results on search page →
                      </button>
                    </div>
                  )}

                  {/* Fallback */}
                  {filteredProducts.length === 0 &&
                    filteredCollections.length === 0 &&
                    filteredPages.length === 0 && (
                      <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                        No pieces found for &ldquo;{query}&rdquo;. Looking for a bespoke commission?{" "}
                        <button
                          type="button"
                          onClick={() => handleSelect("/custom")}
                          className="text-[var(--primary)] font-medium underline"
                        >
                          Design a custom piece
                        </button>
                      </div>
                    )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
