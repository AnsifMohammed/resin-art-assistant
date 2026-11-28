"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Eye, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface GalleryItem {
  id: string;
  title: string;
  category: "tables" | "ocean" | "florals" | "everyday";
  imageUrl: string;
  dimensions?: string;
  materials: string;
  note: string;
}

const GALLERY_PIECES: GalleryItem[] = [
  {
    id: "table-1",
    title: "Handcrafted Teak Resin Tea Table — Ocean Shore",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621769/products/w7hqwjmubg4q4uri5xtv.jpg",
    dimensions: "24 × 24 in",
    materials: "Seasoned Indian teak, crystal epoxy resin, mica pigments",
    note: "Studio flagship commission featuring 3-layer coastal cell froth over raw live-edge teak.",
  },
  {
    id: "table-2",
    title: "Live Edge Resin Coffee Table — Emerald Deep",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621652/products/s7hcj5qvba7appttujwt.jpg",
    dimensions: "36 × 20 in",
    materials: "Live-edge hardwood slab, transparent ocean tint resin",
    note: "Custom living-room centerpiece cast with deep sea teal gradient.",
  },
  {
    id: "table-3",
    title: "Resin Art Side Table — Marine Flow",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621663/products/yhka1ufwimrfvxah23gs.jpg",
    dimensions: "18 in Round",
    materials: "Turned wood tripod legs, high-viscosity artist epoxy",
    note: "Subtle turquoise tide lines captured over blonde wood grain.",
  },
  {
    id: "table-4",
    title: "Bespoke Accent Table — Blue Lagoon",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621700/products/h4nmmlko1anja6bjclb6.jpg",
    dimensions: "20 in Round",
    materials: "Hardwood slice, multi-pour white wave lacing",
    note: "Hand-poured cellular foam rings inspired by aerial coral reefs.",
  },
  {
    id: "table-5",
    title: "Artisan Low Tea Table — Azure Shoreline",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794621765/products/bpret0derk5isetygjzx.jpg",
    dimensions: "28 × 18 in",
    materials: "Reclaimed seasoned teak, UV-shielded resin topcoat",
    note: "High gloss optical finish polished to a 3000-grit mirror clarity.",
  },
  {
    id: "table-6",
    title: "Grand Resin Dining Table Commission",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933534/products/syf9jblrfoluux51mn0n.jpg",
    dimensions: "48 × 24 in",
    materials: "Dual teak slabs, crystal river pour, matte steel base",
    note: "Bespoke residential dining statement piece with deep ocean river inlay.",
  },
  {
    id: "table-7",
    title: "Custom Geode Pour Side Table",
    category: "tables",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1794933510/products/kdy5grdhidyuxeptdvrr.png",
    dimensions: "22 in Round",
    materials: "Gold metallic inlay, amethyst crystals, casting resin",
    note: "Shimmering amethyst geode rings with 24k gold-leaf pour edges.",
  },
  {
    id: "art-ocean",
    title: "Signature Ocean Wave Wall Clock",
    category: "ocean",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821802/knowvya/products/resin-clock-12in/tc5lmkkf7ooxtdg2atna.jpg",
    dimensions: "12 in Round",
    materials: "Teak base, silent quartz movement, layered resin",
    note: "Signature Coimbatore studio timepiece with natural seafoam cells.",
  },
  {
    id: "art-floral",
    title: "Bridal Garland Preservation Block",
    category: "florals",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821828/knowvya/products/wedding-bouquet-preservation/nxazlyehkwdsshiv6b6r.jpg",
    dimensions: "5 × 7 in",
    materials: "Preserved crimson roses, marigold petals, UV resin",
    note: "Archival wedding flower preservation heirloom that never yellows.",
  },
  {
    id: "art-everyday",
    title: "Artisan Teak Coaster Set of 4",
    category: "everyday",
    imageUrl: "https://res.cloudinary.com/dkozsbkjy/image/upload/v1793821799/knowvya/products/ocean-coaster-set-4/zkp0fxojb7dovk1jm664.jpg",
    dimensions: "10 cm Round",
    materials: "Natural wood round, heat-resistant epoxy, cork backing",
    note: "Functional everyday dining coasters safe for hot drinks up to 50°C.",
  },
];

export default function GalleryPage() {
  const [filter, setFilter] = useState<"all" | "tables" | "ocean" | "florals" | "everyday">("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filteredItems = filter === "all"
    ? GALLERY_PIECES
    : GALLERY_PIECES.filter((item) => item.category === filter);

  const activeItem = lightboxIndex !== null ? filteredItems[lightboxIndex] : null;

  const handlePrev = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : filteredItems.length - 1));
  }, [lightboxIndex, filteredItems.length]);

  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => (prev! < filteredItems.length - 1 ? prev! + 1 : 0));
  }, [lightboxIndex, filteredItems.length]);

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, handleClose, handlePrev, handleNext]);

  return (
    <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-16 md:py-24">
      {/* Header */}
      <div className="space-y-4 mb-12 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)] flex items-center justify-center md:justify-start gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Studio Archives</span>
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Past Works & Commissions
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-lg leading-relaxed">
          Explore finished pieces poured in our Coimbatore studio, including bespoke resin tables, ocean wall clocks, and preserved floral heirlooms.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-10 pb-4 border-b border-[var(--border)]">
        {[
          { id: "all", label: "All Pieces" },
          { id: "tables", label: "Resin Tables" },
          { id: "ocean", label: "Ocean Lines" },
          { id: "florals", label: "Preserved Florals" },
          { id: "everyday", label: "Everyday & Gifts" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setFilter(tab.id as typeof filter);
              setLightboxIndex(null);
            }}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
              filter === tab.id
                ? "bg-[var(--text)] text-[var(--background)] shadow-xs"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-6 sm:gap-8">
        {filteredItems.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => setLightboxIndex(idx)}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
          >
            {/* Visual slot 4:5 */}
            <div className="relative aspect-4/5 w-full overflow-hidden bg-[var(--surface-muted)]">
              <Image
                src={item.imageUrl}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                  <Eye className="h-5 w-5" />
                </span>
              </div>
            </div>

            <div className="p-5 space-y-1">
              <h3 className="font-serif text-base font-semibold text-[var(--text)] line-clamp-1">
                {item.title}
              </h3>
              <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                {item.materials}
              </p>
              {item.dimensions && (
                <span className="inline-block pt-1 font-mono text-[11px] font-semibold text-[var(--accent)]">
                  {item.dimensions}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal with Keyboard Navigation */}
      <AnimatePresence>
        {lightboxIndex !== null && activeItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
            onClick={handleClose}
          >
            <div
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close Lightbox (Esc)"
                className="absolute -top-12 right-0 text-white/80 hover:text-white p-2"
              >
                <X className="h-6 w-6" />
              </button>

              {/* Prev / Next Buttons */}
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous Image"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors z-10"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next Image"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors z-10"
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              {/* Image Container */}
              <div className="relative aspect-[4/3] w-full max-h-[70vh] rounded-2xl overflow-hidden border border-white/10 bg-black">
                <Image
                  src={activeItem.imageUrl}
                  alt={activeItem.title}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
                />
              </div>

              {/* Caption */}
              <div className="mt-4 text-center text-white space-y-1 max-w-xl">
                <h3 className="font-serif text-lg font-semibold">{activeItem.title}</h3>
                <p className="text-xs text-white/70">{activeItem.note}</p>
                <p className="text-[11px] text-white/50 font-mono">
                  {lightboxIndex + 1} of {filteredItems.length} · Use Arrow keys to navigate
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
