"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, ShieldCheck } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

const SLIDE_DURATION_MS = 7000;

export const FULL_WIDTH_HERO_SLIDES = [
  {
    id: "tea-table",
    eyebrow: "SIGNATURE MASTERPIECE · LIVE EDGE TEAK",
    title: "Handcrafted in Coimbatore.\nPoured for a lifetime.",
    body: "Preserved botanical blossoms and deep turquoise ocean lacing cast in crystal epoxy resin over seasoned Indian teak wood. Seven days of meticulous hand-poured artisan curing.",
    cta: "Explore Tea Table",
    href: "/product/resin-art-tea-tables",
    image: "https://res.cloudinary.com/dkozsbkjy/image/upload/w_3840,q_auto:best,f_auto/products/w7hqwjmubg4q4uri5xtv.jpg",
    badge: "100% Solid Teak Wood · Custom Dimensions",
  },
  {
    id: "ocean-table",
    eyebrow: "OCEAN COLLECTION · WILD-GRAIN HARDWOOD",
    title: "Deep ocean depths\ncast in raw timber.",
    body: "Sculpted coastal shoreline with swimming manta rays and cellular seafoam lacing. Multiple transparent pigment tiers create stunning aerial depth that never yellows.",
    cta: "View Ocean Table",
    href: "/product/resin-art-table",
    image: "https://res.cloudinary.com/dkozsbkjy/image/upload/w_3840,q_auto:best,f_auto/products/syf9jblrfoluux51mn0n.jpg",
    badge: "Hand-Torched Wave Lacing · UV-Protected",
  },
  {
    id: "ocean-clock",
    eyebrow: "TIMELESS WALL ART · SILENT SWEEP",
    title: "Cellular waves\ncaptured in motion.",
    body: "Multi-layered ocean whitecaps frozen in crystal resin over kiln-dried teak foundations. Equipped with high-precision silent German quartz movements.",
    cta: "Discover Clocks",
    href: "/product/resin-clock-12in",
    image: "https://res.cloudinary.com/dkozsbkjy/image/upload/w_3840,q_auto:best,f_auto/knowvya/products/resin-clock-12in/tc5lmkkf7ooxtdg2atna.jpg",
    badge: "Silent German Quartz · Non-Yellowing Resin",
  },
  {
    id: "geode-coasters",
    eyebrow: "GEODE CRYSTAL COLLECTION · 24K GOLD",
    title: "Amethyst crystal bands\ngilded in 24K leaf.",
    body: "Organic geode formations hand-poured with luminous magenta mineral pigments and genuine metallic gold leaf foils. Scratch-safe and heat-resistant for daily living.",
    cta: "Shop Coaster Set",
    href: "/product/ocean-coaster-set-4",
    image: "https://res.cloudinary.com/dkozsbkjy/image/upload/w_3840,q_auto:best,f_auto/knowvya/products/ocean-coaster-set-4/zkp0fxojb7dovk1jm664.jpg",
    badge: "Heat-Resistant to 90°C · Set of 4 Pieces",
  },
];

export function HeroCarousel() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const progressStartTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);

  const autoplay = useRef(
    Autoplay({
      delay: SLIDE_DURATION_MS,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    })
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      duration: 35,
    },
    [autoplay.current]
  );

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion && emblaApi) {
      autoplay.current.stop();
    }
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setProgress(0);
    progressStartTimeRef.current = Date.now();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Smooth progress bar update
  useEffect(() => {
    const updateProgress = () => {
      if (!isPaused) {
        const elapsed = Date.now() - progressStartTimeRef.current;
        const currentProgress = Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100);
        setProgress(currentProgress);
      }
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPaused, selectedIndex]);

  const scrollPrev = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = (index: number) => {
    if (!emblaApi) return;
    emblaApi.scrollTo(index);
  };

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => {
        setIsPaused(false);
        progressStartTimeRef.current = Date.now() - (progress / 100) * SLIDE_DURATION_MS;
      }}
      className="relative w-full h-[85vh] sm:h-[90vh] min-h-[620px] max-h-[960px] overflow-hidden bg-[#0A080E] select-none"
      aria-roledescription="carousel"
      aria-label="Signature Handcrafted Resin Artworks"
    >
      {/* Embla Carousel Viewport — 100% full width edge-to-edge */}
      <div className="h-full w-full overflow-hidden" ref={emblaRef}>
        <div className="flex h-full w-full">
          {FULL_WIDTH_HERO_SLIDES.map((slide, idx) => (
            <div
              key={slide.id}
              className="relative h-full min-w-full flex-[0_0_100%] overflow-hidden"
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${idx + 1} of ${FULL_WIDTH_HERO_SLIDES.length}`}
            >
              {/* Full Width Edge-to-Edge 4K Resin Art Photography */}
              <div className="absolute inset-0 h-full w-full">
                <Image
                  src={slide.image}
                  alt={slide.title.replace("\n", " ")}
                  fill
                  priority={idx <= 1}
                  unoptimized
                  className="object-cover object-center scale-100 transition-transform duration-1000 ease-out"
                  sizes="100vw"
                />
              </div>

              {/* Cinematic Multilayer Gradients for Crystal Legibility & Luxury Aesthetics */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/25 z-10"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20 z-10"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.6)_100%)] z-10 pointer-events-none"
              />

              {/* Text & Content Layer — Expanded fluid container */}
              <div className="relative z-20 flex h-full w-full items-center">
                <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 2xl:px-32 pt-12 pb-24">
                  <div className="max-w-2xl lg:max-w-3xl space-y-5 sm:space-y-6">
                    {/* Eyebrow Pill */}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-black/40 px-3.5 py-1 text-xs font-semibold tracking-[0.16em] uppercase text-amber-300 backdrop-blur-md shadow-xs">
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        {slide.eyebrow}
                      </span>
                    </div>

                    {/* Bold Editorial Headline */}
                    <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-white leading-[1.05] drop-shadow-md">
                      {slide.title.split("\n").map((line, lineIdx) => (
                        <span key={lineIdx} className="block overflow-hidden">
                          <motion.span
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{
                              duration: 0.7,
                              ease: [0.22, 1, 0.36, 1],
                              delay: lineIdx * 0.08,
                            }}
                            className="block"
                          >
                            {line}
                          </motion.span>
                        </span>
                      ))}
                    </h1>

                    {/* Lead Body Description */}
                    <p className="max-w-xl text-sm sm:text-base md:text-lg lg:text-xl font-normal leading-relaxed text-zinc-200 drop-shadow-xs">
                      {slide.body}
                    </p>

                    {/* CTA Button & Craftsmanship Badge */}
                    <div className="pt-2 sm:pt-4 flex flex-wrap items-center gap-4 sm:gap-6">
                      <Link
                        href={slide.href}
                        className="btn-primary text-sm sm:text-base px-7 py-3.5 shadow-xl hover:shadow-amber-500/20"
                      >
                        {slide.cta}
                      </Link>

                      <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-300 bg-black/30 border border-white/10 px-3 py-2 rounded-lg backdrop-blur-xs">
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>{slide.badge}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Navigation Arrows (Desktop & Tablet) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={scrollPrev}
          aria-label="Previous slide"
          className="pointer-events-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-amber-400 hover:bg-black/70 hover:text-amber-400 focus:outline-none"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <button
          type="button"
          onClick={scrollNext}
          aria-label="Next slide"
          className="pointer-events-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-amber-400 hover:bg-black/70 hover:text-amber-400 focus:outline-none"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {/* Bottom Controls: Slide Counter & Filling Progress Bar */}
      <div className="absolute bottom-6 left-0 right-0 z-30 w-full">
        <div className="w-full max-w-[1920px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 2xl:px-32 flex items-center justify-between gap-6">
          {/* Slide Counter */}
          <div className="text-xs font-mono font-medium tracking-wider text-zinc-400">
            <span className="text-amber-400 font-bold">0{selectedIndex + 1}</span>
            <span className="mx-1 text-zinc-600">/</span>
            <span>0{FULL_WIDTH_HERO_SLIDES.length}</span>
          </div>

          {/* Segmented Progress Bars */}
          <div className="flex flex-1 items-center gap-2 sm:gap-3 max-w-md">
            {FULL_WIDTH_HERO_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => scrollTo(idx)}
                aria-label={`Jump to slide ${idx + 1}`}
                className="group relative h-1.5 sm:h-2 flex-1 overflow-hidden rounded-full bg-white/20 transition-all hover:bg-white/40"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[var(--primary)] transition-all"
                  style={{
                    width:
                      selectedIndex === idx
                        ? `${progress}%`
                        : selectedIndex > idx
                        ? "100%"
                        : "0%",
                    transitionDuration: selectedIndex === idx ? "50ms" : "250ms",
                  }}
                />
              </button>
            ))}
          </div>

          {/* Small thumbnail pills on wide desktop */}
          <div className="hidden xl:flex items-center gap-2">
            {FULL_WIDTH_HERO_SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => scrollTo(idx)}
                aria-label={`Select ${slide.eyebrow}`}
                className={`relative h-9 w-14 overflow-hidden rounded-md border transition-all ${
                  selectedIndex === idx
                    ? "border-amber-400 ring-2 ring-amber-400/40 opacity-100 scale-105"
                    : "border-white/20 opacity-50 hover:opacity-80"
                }`}
              >
                <Image
                  src={slide.image}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
