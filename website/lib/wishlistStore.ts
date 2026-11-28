"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WishlistState {
  slugs: string[];
  toggleWishlist: (slug: string) => void;
  isInWishlist: (slug: string) => boolean;
  clearWishlist: () => void;
  getShareUrl: () => string;
  loadFromShareParam: (param: string) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      slugs: [],

      toggleWishlist: (slug) => {
        const current = get().slugs;
        if (current.includes(slug)) {
          set({ slugs: current.filter((s) => s !== slug) });
        } else {
          set({ slugs: [...current, slug] });
        }
      },

      isInWishlist: (slug) => {
        return get().slugs.includes(slug);
      },

      clearWishlist: () => set({ slugs: [] }),

      getShareUrl: () => {
        if (typeof window === "undefined") return "";
        const encoded = encodeURIComponent(get().slugs.join(","));
        return `${window.location.origin}/wishlist?items=${encoded}`;
      },

      loadFromShareParam: (param: string) => {
        if (!param) return;
        const decoded = decodeURIComponent(param)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const merged = Array.from(new Set([...get().slugs, ...decoded]));
        set({ slugs: merged });
      },
    }),
    {
      name: "saba-wishlist-storage",
    }
  )
);
