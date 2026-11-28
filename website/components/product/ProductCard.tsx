"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, Plus, Eye, Sparkles, Images } from "lucide-react";
import { motion } from "framer-motion";
import { type Product } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { GlassRefraction } from "@/components/textures/GlassRefraction";

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
}

export function ProductCard({ product, onQuickView }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const { toggleWishlist, isInWishlist } = useWishlistStore();
  const isWishlisted = isInWishlist(product.slug);

  const minPrice = Math.min(...product.sizes.map((s) => s.price));
  const maxPrice = Math.max(...product.sizes.map((s) => s.price));
  const priceDisplay =
    minPrice === maxPrice
      ? formatINR(minPrice)
      : `${formatINR(minPrice)} – ${formatINR(maxPrice)}`;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultSize = product.sizes[0]!;
    addItem({
      slug: product.slug,
      name: product.name,
      sizeName: defaultSize.name,
      unitPrice: defaultSize.price,
      quantity: 1,
      leadTimeDays: product.leadTimeDays,
      isCustomized: false,
    });
  };

  return (
    <div className="group relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
      {/* 4:5 Visual Slot with Caustic Sweep & Image Zoom */}
      <Link href={`/product/${product.slug}`} className="relative aspect-4/5 w-full overflow-hidden block bg-[var(--surface-muted)]">
        <Image
          src={product.images && product.images.length > 0 ? product.images[0] : `/brand/product-${product.slug}.svg`}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-600 ease-out group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />

        <GlassRefraction />

        {/* Lead time pill */}
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs border border-white/10 flex items-center gap-1">
          <span>{product.leadTimeDays}d</span>
        </span>

        {/* Custom badge */}
        {product.customizable && (
          <span className="absolute top-3 left-16 rounded-full bg-[var(--primary)] px-2.5 py-1 text-[11px] font-semibold text-[#1A1620] shadow-sm flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>Custom</span>
          </span>
        )}

        {/* Photo count indicator badge */}
        {product.images && product.images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs border border-white/10 flex items-center gap-1">
            <Images className="h-3 w-3" />
            <span>1/{product.images.length}</span>
          </span>
        )}

        {/* Dots indicator */}
        {product.images && product.images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
            {product.images.slice(0, 5).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === 0 ? "w-3 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.slug);
          }}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 backdrop-blur-xs text-white transition-colors hover:bg-black/50"
        >
          <motion.div whileTap={{ scale: 1.3 }}>
            <Heart
              className={`h-4 w-4 ${isWishlisted ? "fill-[var(--primary)] text-[var(--primary)]" : "text-white"}`}
            />
          </motion.div>
        </button>

        {/* Quick Add Overlay on Hover */}
        <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex gap-2">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="btn-primary w-full text-xs h-10 shadow-lg"
          >
            <Plus className="h-4 w-4" /> Quick Add
          </button>
          {onQuickView && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickView(product);
              }}
              aria-label="Quick View"
              className="btn-secondary h-10 px-3 bg-[var(--surface)] text-[var(--text)]"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>
      </Link>

      {/* Product Details Header */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <Link href={`/product/${product.slug}`}>
            <h3 className="font-serif text-lg font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors">
              {product.name}
            </h3>
          </Link>
          <p className="text-xs text-[var(--text-muted)] line-clamp-1 mt-1">
            {product.tagline}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 mt-2 border-t border-[var(--border)]">
          <span className="tabular-nums font-semibold text-[var(--text)] text-base">
            {priceDisplay}
          </span>
          <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Made to Order
          </span>
        </div>
      </div>
    </div>
  );
}
