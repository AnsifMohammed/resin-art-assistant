"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { SearchPalette } from "@/components/search/SearchPalette";
import { SmoothScroll } from "@/components/providers/SmoothScroll";

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <SmoothScroll>
      <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--text)]">
        <Header onOpenSearch={() => setSearchOpen(true)} />
        <main className="flex-1 pt-20">{children}</main>
        <Footer />
        <CartDrawer />
        <SearchPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </SmoothScroll>
  );
}
