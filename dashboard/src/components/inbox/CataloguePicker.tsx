import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Loader2,
  MessageSquare,
  MinusSquare,
  Package,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useProducts } from "../../hooks/useProducts.ts";
import { cn } from "../../lib/cn.ts";
import type { Product } from "../../types/index.ts";
import { Skeleton } from "../shared/Skeleton.tsx";

export interface CataloguePickerProps {
  open: boolean;
  onClose: () => void;
  /** 24h window closed: disables sending */
  windowClosed: boolean;
  /** Insert into composer text and attachments */
  onInsert: (text: string, imageUrls?: string[]) => void;
  /** Send catalogue directly via API */
  onSend: (productIds: string[], customNote?: string) => Promise<unknown>;
}

function formatPriceRange(product: Product): string {
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const prices = sizes
    .map((s) => (typeof s?.price === "number" ? s.price : null))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return "Price on request";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max || prices.length === 1) {
    return `₹${min.toLocaleString("en-IN")}`;
  }
  return `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;
}

function PreviewImageCarousel({
  images,
  name,
  leadTimeDays,
}: {
  images?: string[];
  name: string;
  leadTimeDays?: number;
}) {
  const imgList = Array.isArray(images) && images.length > 0 ? images : [];
  const [activeIdx, setActiveIdx] = useState(0);

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((i) => (i > 0 ? i - 1 : imgList.length - 1));
  };

  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((i) => (i < imgList.length - 1 ? i + 1 : 0));
  };

  if (imgList.length === 0) {
    return (
      <div className="flex h-36 w-full items-center justify-center bg-surface-muted text-text-muted">
        <Package className="h-10 w-10 opacity-30" />
      </div>
    );
  }

  return (
    <div className="relative h-44 w-full overflow-hidden bg-black/5 group">
      <img
        src={imgList[activeIdx]}
        alt={`${name} ${activeIdx + 1}`}
        className="h-full w-full object-cover transition-all duration-300"
      />
      {imgList.length > 1 && (
        <div className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-10 font-semibold text-white backdrop-blur-xs">
          {activeIdx + 1}/{imgList.length}
        </div>
      )}
      {leadTimeDays !== undefined && (
        <div className="absolute top-2 right-2">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-10 font-medium text-white backdrop-blur-xs">
            ⏱️ ~{leadTimeDays}d lead time
          </span>
        </div>
      )}
      {imgList.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white opacity-80 group-hover:opacity-100 transition-opacity hover:bg-black/80 cursor-pointer"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1 text-white opacity-80 group-hover:opacity-100 transition-opacity hover:bg-black/80 cursor-pointer"
            aria-label="Next image"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
            {imgList.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIdx ? "w-4 bg-white" : "w-1.5 bg-white/50",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CataloguePicker({
  open,
  onClose,
  windowClosed,
  onInsert,
  onSend,
}: CataloguePickerProps) {
  const titleId = useId();
  const query = useProducts({ active: "true" });
  const [search, setSearch] = useState("");
  const [customizableOnly, setCustomizableOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState("");
  const [sending, setSending] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCustomizableOnly(false);
    setSelectedIds([]);
    setCustomNote("");
    setSending(false);
  }, [open]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, sending]);

  const allProducts = useMemo(() => query.data?.products ?? [], [query.data]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (customizableOnly && !p.customizable) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [allProducts, search, customizableOnly]);

  const selectedProducts = useMemo(() => {
    return selectedIds
      .map((id) => allProducts.find((p) => p.id === id))
      .filter((p): p is Product => Boolean(p));
  }, [selectedIds, allProducts]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((pId) => pId !== id);
      }
      if (prev.length >= 10) {
        toast.info("Maximum 10 products can be shared at once.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const removeProduct = (id: string) => {
    setSelectedIds((prev) => prev.filter((pId) => pId !== id));
  };

  const allFilteredSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.every((p) => selectedIds.includes(p.id));
  }, [filteredProducts, selectedIds]);

  const someFilteredSelected = useMemo(() => {
    if (allFilteredSelected || filteredProducts.length === 0) return false;
    return filteredProducts.some((p) => selectedIds.includes(p.id));
  }, [allFilteredSelected, filteredProducts, selectedIds]);

  const handleToggleSelectAll = () => {
    if (filteredProducts.length === 0) return;

    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredProducts.map((p) => p.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      const combined = Array.from(new Set([...selectedIds, ...filteredProducts.map((p) => p.id)]));
      if (combined.length > 10) {
        toast.info("Selected first 10 products (maximum 10 allowed).");
        setSelectedIds(combined.slice(0, 10));
      } else {
        setSelectedIds(combined);
      }
    }
  };

  const handleInsert = () => {
    if (selectedProducts.length === 0) return;

    const notePrefix = customNote.trim() ? `${customNote.trim()}\n\n` : "";
    let text = "";
    const imageUrls: string[] = [];

    if (selectedProducts.length === 1) {
      const p = selectedProducts[0]!;
      const price = formatPriceRange(p);
      text = `${notePrefix}✨ *${p.name}*\n💰 ${price}\n⏱️ Lead time: ~${p.leadTimeDays} days\n${p.customizable ? "🎨 Customizable\n" : ""}\n${p.description || "Handcrafted resin piece."}\n\nLet me know if you would like to order or customize this!`.trim();
      if (p.images && p.images[0]) imageUrls.push(p.images[0]);
    } else {
      const list = selectedProducts
        .map((p, idx) => `${idx + 1}. *${p.name}* (${formatPriceRange(p)})`)
        .join("\n");
      text = `${notePrefix}✨ *Our Handcrafted Resin Collection*\n\n${list}\n\nLet me know which one catches your eye or if you'd like more details!`.trim();
      selectedProducts.forEach((p) => {
        if (p.images && p.images[0]) imageUrls.push(p.images[0]);
      });
    }

    onInsert(text, imageUrls.slice(0, 3));
    onClose();
  };

  const handleSend = async () => {
    if (selectedIds.length === 0 || sending || windowClosed) return;
    setSending(true);
    try {
      await onSend(selectedIds, customNote.trim() || undefined);
      toast.success(
        selectedIds.length === 1
          ? "Product card shared with customer"
          : `${selectedIds.length} products shared with customer`,
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send catalogue";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => !sending && onClose()}
        aria-hidden
      />

      {/* Modal Dialog */}
      <div className="relative flex h-[90vh] max-h-[780px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 id={titleId} className="text-15 font-semibold text-text sm:text-16">
                Share Product Catalogue
              </h2>
              <p className="text-11 text-text-muted sm:text-12">
                Select products to send interactive cards with enquiry buttons
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-text cursor-pointer disabled:opacity-50"
            aria-label="Close dialogue"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Window closed warning */}
        {windowClosed && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-12 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              The 24h customer messaging window is closed. Direct sends are restricted. You can still use &quot;Insert into Chat&quot;.
            </span>
          </div>
        )}

        {/* Content: 2 Columns */}
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0">
          {/* Left Column: Product Selection */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Search & Filter Bar */}
            <div className="space-y-2 border-b border-border/60 p-3 sm:p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products by name or style…"
                  className="w-full rounded-xl border border-border bg-surface-muted py-2 pl-9 pr-8 text-13 text-text placeholder:text-text-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2.5 rounded p-0.5 text-text-muted hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1.5 text-11">
                <button
                  type="button"
                  onClick={() => setCustomizableOnly(false)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 font-medium transition cursor-pointer",
                    !customizableOnly
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-surface-muted text-text-muted hover:bg-border/60 hover:text-text",
                  )}
                >
                  All ({allProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomizableOnly(true)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition cursor-pointer",
                    customizableOnly
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-surface-muted text-text-muted hover:bg-border/60 hover:text-text",
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Customizable only</span>
                </button>
              </div>
            </div>

            {/* Select All Bar */}
            {!query.isLoading && filteredProducts.length > 0 && (
              <div className="flex items-center justify-between border-b border-border/50 bg-surface-muted/40 px-3.5 py-2 text-12">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="group inline-flex items-center gap-2 font-medium text-text hover:text-primary transition-colors cursor-pointer select-none"
                  aria-label={allFilteredSelected ? "Deselect all products" : "Select all products"}
                >
                  <div className="text-primary shrink-0">
                    {allFilteredSelected ? (
                      <CheckSquare className="h-4 w-4 fill-primary text-surface" />
                    ) : someFilteredSelected ? (
                      <MinusSquare className="h-4 w-4 fill-primary text-surface" />
                    ) : (
                      <Square className="h-4 w-4 text-text-muted/60 group-hover:text-text-muted" />
                    )}
                  </div>
                  <span>
                    Select all ({filteredProducts.length})
                  </span>
                </button>
                <span className="text-11 text-text-muted">
                  {selectedIds.length} of 10 selected
                </span>
              </div>
            )}

            {/* Product List */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3 custom-scrollbar">
              {query.isLoading ? (
                <div className="space-y-2.5 p-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-text-muted">
                  <Package className="mb-2 h-8 w-8 stroke-1 opacity-50" />
                  <p className="text-13 font-medium">No products found</p>
                  <p className="text-11">Try adjusting your search query or filters.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedIds.includes(p.id);
                    const primaryImg = p.images?.[0];
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleProduct(p.id)}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            toggleProduct(p.id);
                          }
                        }}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border p-2.5 transition cursor-pointer select-none",
                          isSelected
                            ? "border-primary/60 bg-primary/6 ring-1 ring-primary/40 shadow-xs"
                            : "border-border/60 bg-surface hover:border-border hover:bg-surface-muted/50",
                        )}
                      >
                        {/* Checkbox Icon */}
                        <div className="text-primary shrink-0">
                          {isSelected ? (
                            <CheckSquare className="h-4.5 w-4.5 fill-primary text-surface" />
                          ) : (
                            <Square className="h-4.5 w-4.5 text-text-muted/60 group-hover:text-text-muted" />
                          )}
                        </div>

                        {/* Thumbnail */}
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-muted border border-border/40">
                          {primaryImg ? (
                            <img
                              src={primaryImg}
                              alt={p.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-text-muted">
                              <Package className="h-5 w-5 opacity-40" />
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-13 font-semibold text-text group-hover:text-primary transition-colors">
                              {p.name}
                            </p>
                            <span className="shrink-0 text-12 font-bold text-primary">
                              {formatPriceRange(p)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-11 text-text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> ~{p.leadTimeDays}d lead time
                            </span>
                            {p.customizable && (
                              <span className="rounded bg-violet-500/10 px-1.5 py-0.2 text-10 font-semibold text-violet-700 dark:text-violet-300">
                                Customizable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Customer Preview & Options */}
          <div className="flex min-h-0 flex-1 flex-col bg-surface-muted/20">
            <div className="border-b border-border/60 px-4 py-3">
              <h3 className="text-12 font-semibold uppercase tracking-wider text-text-muted">
                Customer Message Preview
              </h3>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 custom-scrollbar space-y-4">
              {/* Selected Pills Tray */}
              {selectedProducts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-11 font-medium text-text-muted">
                    Selected items ({selectedProducts.length}/10):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProducts.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-11 font-medium text-primary-text"
                      >
                        <span className="max-w-[140px] truncate">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="rounded p-0.5 hover:bg-primary/20 text-text-muted hover:text-text cursor-pointer"
                          aria-label={`Remove ${p.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Simulation Card */}
              <div className="flex-1 rounded-2xl border border-border/80 bg-surface p-3.5 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-10 text-text-muted">
                  <span>What the customer receives:</span>
                  <span className="font-mono">Interactive WhatsApp / IG</span>
                </div>

                {selectedProducts.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center text-center text-text-muted border border-dashed border-border rounded-xl">
                    <Layers className="mb-2 h-7 w-7 opacity-40" />
                    <p className="text-12 font-medium">Select a product on the left</p>
                    <p className="text-10 mt-0.5 max-w-[200px]">
                      The interactive card preview with instant &quot;Enquire Now&quot; button will render here.
                    </p>
                  </div>
                ) : selectedProducts.length === 1 ? (
                  /* Single Product Card Preview */
                  <div className="overflow-hidden rounded-xl border border-border bg-surface-muted/30 shadow-xs max-w-sm mx-auto">
                    <PreviewImageCarousel
                      images={selectedProducts[0]!.images}
                      name={selectedProducts[0]!.name}
                      leadTimeDays={selectedProducts[0]!.leadTimeDays}
                    />
                    <div className="p-3">
                      {customNote.trim() && (
                        <p className="mb-2 text-12 text-text font-medium border-b border-border/40 pb-1.5">
                          {customNote.trim()}
                        </p>
                      )}
                      <p className="text-14 font-bold text-text">{selectedProducts[0]!.name}</p>
                      <p className="text-13 font-bold text-primary mt-0.5">
                        {formatPriceRange(selectedProducts[0]!)}
                      </p>
                      <p className="text-11 text-text-muted mt-1 leading-snug line-clamp-2">
                        {selectedProducts[0]!.description || "Handmade premium resin art."}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-10 text-text-muted">
                        <span>⏱️ ~{selectedProducts[0]!.leadTimeDays}d lead time</span>
                        {selectedProducts[0]!.customizable && <span>· 🎨 Customizable</span>}
                      </div>

                          {/* Mock Interactive Single Action */}
                          <div className="mt-3 border-t border-border/60 pt-2.5">
                            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-2 text-12 font-semibold text-primary shadow-xs">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>💬 Enquire Now</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      ) : (
                      /* Multi-Product Vertical Scroll Preview */
                      <div className="max-w-sm mx-auto space-y-2">
                        {customNote.trim() && (
                          <p className="mb-2 text-12 text-text font-medium border-b border-border/40 pb-1.5">
                            {customNote.trim()}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-11 text-text-muted px-0.5 pb-0.5">
                          <span className="font-semibold text-text">🛍️ Shared Catalogue ({selectedProducts.length} items)</span>
                          <span className="text-10">Scroll down to view all</span>
                        </div>

                        <div className="max-h-[380px] overflow-y-auto space-y-3 custom-scrollbar overscroll-contain pr-1">
                          {selectedProducts.map((p) => (
                            <div
                              key={p.id}
                              className="overflow-hidden rounded-xl border border-border bg-surface-muted/30 shadow-xs"
                            >
                              <PreviewImageCarousel
                                images={p.images}
                                name={p.name}
                                leadTimeDays={p.leadTimeDays}
                              />
                              <div className="p-3">
                                <p className="text-13 font-bold text-text">{p.name}</p>
                                <p className="text-12 font-bold text-primary mt-0.5">
                                  {formatPriceRange(p)}
                                </p>
                                    {p.description && (
                                      <p className="text-11 text-text-muted mt-1 leading-snug line-clamp-2">
                                        {p.description}
                                      </p>
                                    )}
                                    <div className="mt-2.5 border-t border-border/60 pt-2">
                                      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 py-1.5 text-11 font-semibold text-primary shadow-xs">
                                        <MessageSquare className="h-3 w-3" />
                                        <span>💬 Enquire Now</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                      ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Optional Custom Note Input */}
                        <div>
                          <label className="block text-11 font-medium text-text-muted mb-1">
                            Optional note / greeting to customer:
                          </label>
                          <textarea
                            rows={2}
                            value={customNote}
                            onChange={(e) => setCustomNote(e.target.value)}
                            placeholder="e.g. Hi! Here are the clocks you asked about:"
                            className="w-full resize-none rounded-xl border border-border bg-surface p-2 text-12 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

        {/* Footer */}
                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-2 text-12 text-text-muted">
                    <span className="font-medium text-text">
                      {selectedIds.length} {selectedIds.length === 1 ? "product" : "products"} selected
                    </span>
                    {selectedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedIds([])}
                        className="text-11 text-text-muted hover:text-text underline cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={sending}
                      className="rounded-xl border border-border px-3.5 py-2 text-12 font-medium text-text hover:bg-surface-muted transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleInsert}
                      disabled={selectedIds.length === 0 || sending}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3.5 py-2 text-12 font-semibold text-primary transition hover:bg-primary/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      title="Populates the reply input for editing before sending"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Insert into Chat</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={selectedIds.length === 0 || sending || windowClosed}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-12 font-semibold text-primary-foreground shadow-xs transition hover:brightness-105 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending…</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Send Catalogue</span>
                        </>
                      )}
                    </button>
                  </div>
                </footer>
              </div>
            </div>,
            document.body,
            );
}
