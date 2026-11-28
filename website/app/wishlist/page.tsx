"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, ShoppingBag, Share2, Check } from "lucide-react";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCartStore } from "@/lib/cartStore";
import { PRODUCTS } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";

function WishlistContent() {
  const searchParams = useSearchParams();
  const { slugs, getShareUrl, loadFromShareParam } = useWishlistStore();
  const addItem = useCartStore((s) => s.addItem);
  const [copied, setCopied] = useState(false);

  // Load shared wishlist items from URL query if present
  useEffect(() => {
    const itemsParam = searchParams.get("items");
    if (itemsParam) {
      loadFromShareParam(itemsParam);
    }
  }, [searchParams, loadFromShareParam]);

  const wishlistedProducts = PRODUCTS.filter((p) => slugs.includes(p.slug));

  const handleMoveAllToCart = () => {
    wishlistedProducts.forEach((p) => {
      const defaultSize = p.sizes[0]!;
      addItem({
        slug: p.slug,
        name: p.name,
        sizeName: defaultSize.name,
        unitPrice: defaultSize.price,
        quantity: 1,
        leadTimeDays: p.leadTimeDays,
      });
    });
  };

  const handleShare = () => {
    const url = getShareUrl();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-16 md:py-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-[var(--border)]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Saved Pieces
          </span>
          <h1 className="font-serif text-3xl font-bold text-[var(--text)] sm:text-4xl mt-2">
            Your Wishlist ({wishlistedProducts.length})
          </h1>
        </div>

        {wishlistedProducts.length > 0 && (
          <div className="flex items-center gap-3 mt-4 md:mt-0">
            <button
              type="button"
              onClick={handleShare}
              className="btn-secondary text-xs h-10 px-4"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              <span>{copied ? "Link Copied" : "Share Wishlist"}</span>
            </button>
            <button
              type="button"
              onClick={handleMoveAllToCart}
              className="btn-primary text-xs h-10 px-4"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Move all to Cart</span>
            </button>
          </div>
        )}
      </div>

      {wishlistedProducts.length === 0 ? (
        <div className="py-24 text-center">
          <Heart className="mx-auto h-12 w-12 text-[var(--text-muted)] opacity-30 mb-4" />
          <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">No Saved Pieces Yet</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)] max-w-sm mx-auto">
            Click the heart icon on any piece in our gallery to keep track of designs you love.
          </p>
          <div className="mt-6">
            <Link href="/shop" className="btn-primary">
              Browse Catalogue
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {wishlistedProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
        </div>
      }
    >
      <WishlistContent />
    </Suspense>
  );
}
