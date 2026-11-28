"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Heart, Search, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { NAV_LINKS, BRAND } from "@/lib/copy";

interface HeaderProps {
  onOpenSearch?: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const cartItems = useCartStore((s) => s.items);
  const openCart = useCartStore((s) => s.openCart);
  const wishlistSlugs = useWishlistStore((s) => s.slugs);

  const cartCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);
  const wishlistCount = wishlistSlugs.length;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? "glass-surface border-b border-[var(--border)] py-3 shadow-xs"
          : "bg-transparent py-5"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between px-6 sm:px-10 lg:px-16 2xl:px-24">
        {/* Brand Wordmark & Mark */}
        <Link
          href="/"
          className="group flex items-center gap-3 font-serif text-2xl font-semibold tracking-tight text-[var(--text)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/saba-logo.svg"
            alt="Saba Art Mark"
            className="h-8 w-8 object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span>{BRAND.name}</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] -mt-1 font-sans">
              Studio Coimbatore
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-[var(--primary)] ${
                  isActive ? "text-[var(--primary)] font-semibold" : "text-[var(--text-muted)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Search Trigger */}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search catalogue (Cmd+K)"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Wishlist Link */}
          <Link
            href="/wishlist"
            aria-label="View saved pieces"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <Heart className="h-4 w-4" />
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[#1A1620]">
                {wishlistCount}
              </span>
            )}
          </Link>

          {/* Cart Drawer Trigger */}
          <button
            type="button"
            onClick={openCart}
            aria-label={`Shopping Cart with ${cartCount} items`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <ShoppingBag className="h-4 w-4 text-[var(--text)]" />
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[#1A1620]"
                >
                  {cartCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] md:hidden hover:bg-[var(--surface-muted)]"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-surface border-b border-[var(--border)] px-6 py-6 md:hidden"
          >
            <nav className="flex flex-col space-y-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-serif text-lg font-medium text-[var(--text)] hover:text-[var(--primary)]"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-[var(--border)] flex justify-between items-center text-sm text-[var(--text-muted)]">
                <span>WhatsApp Studio Inquiries</span>
                <a
                  href={BRAND.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] font-medium"
                >
                  Chat with Saba
                </a>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
