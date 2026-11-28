"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { BRAND } from "@/lib/copy";

// Section 6.7: Clearly marked placeholder entries documented in README as pre-launch content needed.
const PLACEHOLDER_TESTIMONIALS = [
  {
    id: "test-1",
    quote: "The depth of the ocean layers in the 12-inch clock is remarkable. It looks even better under natural morning light.",
    author: "Priya R.",
    city: "Chennai",
    productName: "12 inch Resin Wall Clock",
    productSlug: "resin-clock-12in",
  },
  {
    id: "test-2",
    quote: "Preserved our wedding varmala petals inside a crystal block. The craftsmanship brought tears to my mother’s eyes.",
    author: "Kavitha & Arvind",
    city: "Coimbatore",
    productName: "Bouquet Preservation Block",
    productSlug: "photo-frame-5x7",
  },
  {
    id: "test-3",
    quote: "Ordered 10 sets of the ocean coasters for housewarming return gifts. Every single set had its own unique wave pattern.",
    author: "Naveen S.",
    city: "Bengaluru",
    productName: "Ocean Coaster Set of 4",
    productSlug: "ocean-coaster-set-4",
  },
  {
    id: "test-4",
    quote: "The large serving tray with brass handles is now the centerpiece on our dining table. Cleans easily with just a damp cloth.",
    author: "Ananya M.",
    city: "Kochi",
    productName: "Large Resin Serving Tray",
    productSlug: "resin-tray-large",
  },
];

export function TestimonialsCarousel() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const autoplay = useRef(
    Autoplay({
      delay: 7000,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    })
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: "start",
      slidesToScroll: 1,
    },
    [autoplay.current]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
  const scrollNext = () => emblaApi && emblaApi.scrollNext();

  return (
    <section
      className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28"
      aria-roledescription="carousel"
      aria-label="Customer Reviews"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Collector Words
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl mt-2">
            Heirlooms in real homes.
          </h2>
        </div>

        {/* Carousel Prev/Next Buttons */}
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {selectedIndex + 1} / {PLACEHOLDER_TESTIMONIALS.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={scrollPrev}
              aria-label="Previous testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              aria-label="Next testimonial"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Embla Track */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex -ml-6">
          {PLACEHOLDER_TESTIMONIALS.map((t, idx) => (
            <div
              key={t.id}
              className="min-w-0 flex-[0_0_100%] pl-6 sm:flex-[0_0_50%] lg:flex-[0_0_33.333%]"
              role="group"
              aria-roledescription="slide"
              aria-label={`Testimonial ${idx + 1} of ${PLACEHOLDER_TESTIMONIALS.length}`}
            >
              <div className="flex h-full flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
                <div>
                  {/* Small 14px gold star row */}
                  <div className="flex gap-1 mb-4" aria-label="5 out of 5 stars">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-[var(--gold-leaf)] text-[var(--gold-leaf)]" />
                    ))}
                  </div>

                  {/* Quote in Fraunces 20, strictly NOT italic */}
                  <p className="font-serif text-lg font-normal text-[var(--text)] leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-[var(--border)] flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {t.author}
                    <span className="font-normal text-[var(--text-muted)]">, {t.city}</span>
                  </span>
                  <Link
                    href={`/product/${t.productSlug}`}
                    className="text-xs text-[var(--accent)] hover:underline inline-block"
                  >
                    Purchased: {t.productName}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trust row */}
      <div className="mt-16 text-center text-xs text-[var(--text-muted)]">
        <p>{BRAND.trustLine}</p>
      </div>
    </section>
  );
}
