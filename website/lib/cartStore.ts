"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  calculateCartPricing,
  type CartLineItem,
  type PricingBreakdown,
} from "./pricing";

export interface CartItem extends CartLineItem {
  id: string; // unique per configuration (e.g. slug + size + hash of customizations)
  customDetails?: Record<string, string | number | boolean>;
  previewImage?: string;
}

export interface RemovedCartItem {
  item: CartItem;
  index: number;
  timerId: NodeJS.Timeout;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  pincode: string;
  stateName: string;
  recentlyRemoved: RemovedCartItem | null;
  undoCountdown: number;

  // Actions
  addItem: (item: Omit<CartItem, "id"> & { id?: string }) => void;
  removeItem: (id: string) => void;
  undoRemove: () => void;
  updateQuantity: (id: string, delta: number) => void;
  setPincode: (pin: string, stateName?: string) => void;
  openCart: () => void;
  closeCart: () => void;
  clearCart: () => void;
  getPricing: () => PricingBreakdown;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      pincode: "",
      stateName: "",
      recentlyRemoved: null,
      undoCountdown: 0,

      addItem: (newItem) => {
        const id =
          newItem.id ||
          `${newItem.slug}-${newItem.sizeName}-${JSON.stringify(newItem.customDetails || {})}`;

        const existingIndex = get().items.findIndex((item) => item.id === id);

        if (existingIndex > -1) {
          const updated = [...get().items];
          const existing = updated[existingIndex]!;
          updated[existingIndex] = {
            ...existing,
            quantity: existing.quantity + newItem.quantity,
          };
          set({ items: updated, isOpen: true });
        } else {
          set({
            items: [...get().items, { ...newItem, id }],
            isOpen: true,
          });
        }
      },

      removeItem: (id: string) => {
        const currentItems = get().items;
        const targetIndex = currentItems.findIndex((it) => it.id === id);
        if (targetIndex === -1) return;

        const targetItem = currentItems[targetIndex]!;

        // Clear existing undo timer if any
        if (get().recentlyRemoved?.timerId) {
          clearTimeout(get().recentlyRemoved!.timerId);
        }

        // Set up 6-second undo window
        const timerId = setTimeout(() => {
          set({ recentlyRemoved: null, undoCountdown: 0 });
        }, 6000);

        set({
          items: currentItems.filter((it) => it.id !== id),
          recentlyRemoved: { item: targetItem, index: targetIndex, timerId },
          undoCountdown: 6,
        });
      },

      undoRemove: () => {
        const { recentlyRemoved, items } = get();
        if (!recentlyRemoved) return;

        clearTimeout(recentlyRemoved.timerId);
        const restored = [...items];
        restored.splice(recentlyRemoved.index, 0, recentlyRemoved.item);

        set({
          items: restored,
          recentlyRemoved: null,
          undoCountdown: 0,
        });
      },

      updateQuantity: (id: string, delta: number) => {
        const updated = get()
          .items.map((item) => {
            if (item.id === id) {
              const newQty = item.quantity + delta;
              return newQty > 0 ? { ...item, quantity: newQty } : null;
            }
            return item;
          })
          .filter((it): it is CartItem => it !== null);

        set({ items: updated });
      },

      setPincode: (pin: string, stateName: string = "") => {
        set({ pincode: pin, stateName });
      },

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      clearCart: () => set({ items: [], recentlyRemoved: null }),

      getPricing: () => {
        const { items, pincode, stateName } = get();
        return calculateCartPricing(items, pincode, stateName);
      },
    }),
    {
      name: "saba-cart-storage",
      partialize: (state) => ({
        items: state.items,
        pincode: state.pincode,
        stateName: state.stateName,
      }),
    }
  )
);
