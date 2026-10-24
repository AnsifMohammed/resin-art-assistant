import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Package, ArrowUpRight } from "lucide-react";

export interface TopProductItem {
  productId: string | null;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
}

interface TopProductsCardProps {
  /** Every product sold in the period (real data only; empty → empty state). */
  products: TopProductItem[];
  isLoading?: boolean;
}

// ─── Compact 36px Product Thumbnail ─────────────────────────────────────────
function ProductThumb({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center shrink-0 border border-border">
        <Package className="w-4 h-4 text-text-muted" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

/** Gap (px) between each product shell; included in virtual row height. */
const ROW_GAP = 8;

/** Minimum shell height (px, excluding gap). Shells (~48–56px) grow to fill the area exactly. */
const MIN_SHELL = 48;

export function TopProductsCard({ products, isLoading }: TopProductsCardProps) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<"revenue" | "units">("revenue");
  const [showBottomFade, setShowBottomFade] = useState(true);
  const [rowHeight, setRowHeight] = useState(MIN_SHELL + ROW_GAP); // shell + gap

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Total metrics across all products (for share %)
  const totalCatalogRevenue = useMemo(
    () => products.reduce((acc, p) => acc + p.revenue, 0),
    [products]
  );

  // Sorted list based on active toggle
  const sorted = useMemo(() => {
    return [...products].sort((a, b) =>
      sortBy === "revenue" ? b.revenue - a.revenue : b.units - a.units
    );
  }, [products, sortBy]);

  // Max value of #1 product for relative bar width
  const maxMetric = useMemo(() => {
    if (sorted.length === 0 || !sorted[0]) return 1;
    const topVal = sortBy === "revenue" ? sorted[0].revenue : sorted[0].units;
    return Math.max(topVal, 1);
  }, [sorted, sortBy]);

  // Compute row height so only whole rows show (no clipped bottom row).
  // visibleCount = floor((areaHeight + gap) / (minShell + gap)), capped at 6.
  // Then shell = floor((areaHeight + gap) / visibleCount) - gap, so rows fill the area exactly.
  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) {
          const avail = h + ROW_GAP; // total space counting the last gap
          const minRowH = MIN_SHELL + ROW_GAP;
          const visibleCount = Math.max(
            1,
            Math.min(6, Math.floor(avail / minRowH))
          );
          // Fill the area exactly (no MAX clamp here: clamping would leave part of the
          // next row peeking in at the bottom edge).
          const shellH = Math.floor(avail / visibleCount) - ROW_GAP;
          setRowHeight(shellH + ROW_GAP);
        }
      }
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });

  // Re-measure positions when rowHeight changes, preventing row overlap
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  // Reset scroll and fade state when sort or data changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setShowBottomFade(sorted.length > 6);
  }, [sortBy, products]);

  // Bottom fade on scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 8;
    setShowBottomFade(!atBottom && sorted.length > 6);
  };

  const virtualItems = virtualizer.getVirtualItems();
  // Current computed shell height (rowHeight includes the gap)
  const shellH = rowHeight - ROW_GAP;

  return (
    // ─── OUTER SHELL ────────────────────────────────────────────────────────
    <div className="@container p-4 rounded-xl border border-border bg-surface flex flex-col min-h-0 gap-3 flex-1 overflow-hidden h-[400px] lg:h-full">
      {/* ─── Header Row ─────────────────────────────────────────────────── */}
      {/* Narrow card (phones): icon-only Catalogue link so the header stays one line */}
      <div className="h-9 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
            Top Products
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {/* Sort toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-surface-muted border border-border text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setSortBy("revenue")}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                sortBy === "revenue"
                  ? "bg-surface text-text shadow-2xs font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              By revenue
            </button>
            <button
              type="button"
              onClick={() => setSortBy("units")}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                sortBy === "units"
                  ? "bg-surface text-text shadow-2xs font-semibold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              By units
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/catalogue")}
            aria-label="Open catalogue"
            title="Catalogue"
            className="text-[11px] text-text-muted hover:text-text transition-colors flex items-center gap-0.5 cursor-pointer ml-1"
          >
            <span className="hidden @min-[26rem]:inline">Catalogue</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ─── LIST AREA ────────────────────────────────────────────────────── */}
      <div ref={innerRef} className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {isLoading ? (
          /* Compact loading skeleton — matches the product shell design */
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{ height: `${shellH}px`, marginBottom: `${ROW_GAP}px` }}
                className="flex items-center gap-3 px-3 rounded-xl border border-border bg-surface-muted/40 animate-pulse"
              >
                <div className="w-5 h-5 rounded-full bg-surface-muted shrink-0" />
                <div className="w-9 h-9 rounded-lg bg-surface-muted shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 bg-surface-muted rounded w-2/3" />
                  <div className="h-2.5 bg-surface-muted rounded w-1/3" />
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="h-3.5 bg-surface-muted rounded w-14" />
                  <div className="h-1 bg-surface-muted rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <Package className="w-6 h-6 text-text-muted opacity-40 mb-1" />
            <p className="text-12 font-medium text-text-muted">No products sold in this period</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            tabIndex={0}
            role="region"
            aria-label="Top products ranked list"
            onScroll={handleScroll}
            className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar pr-1 rounded-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((vi) => {
                const p = sorted[vi.index];
                if (!p) return null;

                const metricVal = sortBy === "revenue" ? p.revenue : p.units;
                const barWidthPct = Math.min(100, Math.round((metricVal / maxMetric) * 100));
                const shareOfTotal =
                  totalCatalogRevenue > 0
                    ? Math.round((p.revenue / totalCatalogRevenue) * 100)
                    : null;
                const imgSrc = p.imageUrl;
                const rank = vi.index + 1;

                return (
                  <div
                    key={p.productId ?? `${p.name}-${vi.index}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${rowHeight}px`,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/orders?search=${encodeURIComponent(p.name)}`)
                      }
                      style={{ height: `${shellH}px` }}
                      title={p.name}
                      aria-label={`View orders for ${p.name}`}
                      className="w-full text-left flex items-center gap-3 px-3 rounded-xl border border-border bg-surface-muted/40 hover:bg-surface hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all group cursor-pointer select-none"
                    >
                      {/* Rank circle — 20px, text-11 */}
                      <span
                        className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 font-outfit ${
                          rank === 1
                            ? "bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                            : rank === 2
                              ? "bg-amber-500/18 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                              : rank === 3
                                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                                : "bg-surface text-text-muted border border-border"
                        }`}
                      >
                        {rank}
                      </span>

                      {/* 36px thumbnail */}
                      <ProductThumb src={imgSrc} />

                      {/* Name + meta text block */}
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold text-text truncate text-[13px] leading-tight group-hover:text-primary transition-colors"
                          title={p.name}
                        >
                          {p.name}
                        </p>
                        <p className="text-[11px] text-text-muted tabular-nums mt-0.5 leading-tight">
                          {p.units} {p.units === 1 ? "unit" : "units"}
                          {shareOfTotal !== null && <> · {shareOfTotal}% of sales</>}
                        </p>
                      </div>

                      {/* Revenue + short bar (w-16, h-1, 4px gap) */}
                      <div className="flex flex-col items-end shrink-0" style={{ gap: "4px" }}>
                        <span className="font-bold font-outfit text-text text-[14px] tabular-nums leading-none">
                          ₹{p.revenue.toLocaleString("en-IN")}
                        </span>
                        <div
                          className="w-16 h-1 rounded-full bg-border/60 overflow-hidden"
                          role="img"
                          aria-label={`${barWidthPct}% of the top product`}
                        >
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${barWidthPct}%` }}
                          />
                        </div>
                      </div>

                      <ArrowUpRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all shrink-0" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom fade gradient */}
        {showBottomFade && !isLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-[var(--surface)] to-transparent pointer-events-none z-10" />
        )}
      </div>
    </div>
  );
}
