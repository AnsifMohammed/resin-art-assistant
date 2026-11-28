"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, MessageCircle, AlertCircle } from "lucide-react";
import { BRAND } from "@/lib/copy";

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  city: string;
  productName: string;
  productSlug: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: "test-1",
    quote: "The depth of the ocean layers in the 12-inch clock is remarkable. It looks even better under natural morning light.",
    author: "Collector P.",
    city: "Chennai",
    productName: "12 inch Resin Wall Clock",
    productSlug: "resin-clock-12in",
  },
  {
    id: "test-2",
    quote: "Preserved our wedding varmala petals inside a crystal block. The craftsmanship brought tears to my mother's eyes.",
    author: "Patrons K. & A.",
    city: "Coimbatore",
    productName: "Bouquet Preservation Block",
    productSlug: "photo-frame-5x7",
  },
  {
    id: "test-3",
    quote: "Ordered 10 sets of the ocean coasters for housewarming return gifts. Every single set had its own unique wave pattern.",
    author: "Client N.",
    city: "Bengaluru",
    productName: "Ocean Coaster Set of 4",
    productSlug: "ocean-coaster-set-4",
  },
  {
    id: "test-4",
    quote: "The large serving tray with brass handles is now the centerpiece on our dining table. Cleans easily with just a damp cloth.",
    author: "Client A.",
    city: "Kochi",
    productName: "Large Resin Serving Tray",
    productSlug: "resin-tray-large",
  },
  {
    id: "test-5",
    quote: "The custom bookmark set made for a thoughtful retirement gift. The dried ferns and gold foil look suspended in ice.",
    author: "Collector S.",
    city: "Hyderabad",
    productName: "Resin Bookmark Set of 4",
    productSlug: "bookmarks-set-4",
  },
  {
    id: "test-6",
    quote: "Ordered the personalized initial keychain set. Sturdy, crystal-clear, and the brass hardware is high quality.",
    author: "Client V.",
    city: "Coimbatore",
    productName: "Custom Resin Keychain Set",
    productSlug: "keychain-set-3",
  },
];

const PRODUCTS_FILTER = [
  { slug: "all", label: "All Words" },
  { slug: "resin-clock-12in", label: "Ocean Clock" },
  { slug: "ocean-coaster-set-4", label: "Coasters" },
  { slug: "resin-tray-large", label: "Serving Tray" },
  { slug: "photo-frame-5x7", label: "Preservation Block" },
];

export default function TestimonialsPage() {
  const [activeSlug, setActiveSlug] = useState("all");

  const filtered = activeSlug === "all"
    ? TESTIMONIALS
    : TESTIMONIALS.filter((t) => t.productSlug === activeSlug);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-16 md:py-24">
      {/* Header */}
      <div className="space-y-4 mb-10 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Collector Words
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Heirlooms in real homes.
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
          Unfiltered impressions from patrons across India who have welcomed our Coimbatore studio pieces into their spaces.
        </p>
      </div>

      {/* Pre-launch Disclaimer Box */}
      <div className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--text-muted)] flex items-center gap-3">
        <AlertCircle className="h-4 w-4 text-[var(--primary)] shrink-0" />
        <span>
          <strong>[TO CONFIRM — Launch Notice]:</strong> Testimonials shown below are representative studio demonstration drafts. Verified customer reviews will be collected and authenticated post-delivery.
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-10 pb-4 border-b border-[var(--border)]">
        {PRODUCTS_FILTER.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            onClick={() => setActiveSlug(tab.slug)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${
              activeSlug === tab.slug
                ? "bg-[var(--text)] text-[var(--background)] shadow-xs"
                : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Masonry / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((t) => (
          <div
            key={t.id}
            className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xs space-y-6"
          >
            <div>
              {/* Gold Stars */}
              <div className="flex gap-1 mb-4" aria-label="5 out of 5 stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[var(--gold-leaf)] text-[var(--gold-leaf)]" />
                ))}
              </div>

              {/* Fraunces non-italic quote */}
              <p className="font-serif text-lg font-normal text-[var(--text)] leading-relaxed">
                &ldquo;{t.quote}&rdquo;
              </p>
            </div>

            <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs">
              <div>
                <p className="font-semibold text-[var(--text)]">{t.author}</p>
                <p className="text-[var(--text-muted)]">{t.city}</p>
              </div>

              <Link
                href={`/product/${t.productSlug}`}
                className="btn-tertiary text-xs"
              >
                {t.productName} →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Studio Share CTA */}
      <div className="mt-20 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center space-y-3">
        <h3 className="font-serif text-xl font-semibold text-[var(--text)]">Do you own a Saba Art piece?</h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          We would love to see how your piece catches morning light. Tag us on Instagram or message us on WhatsApp with photos of your space.
        </p>
        <div className="pt-2">
          <a
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs inline-flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Tag {BRAND.instagram}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
