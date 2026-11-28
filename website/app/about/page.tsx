import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MapPin } from "lucide-react";
import { BRAND } from "@/lib/copy";

export const metadata: Metadata = {
  title: "About the Studio & Artist — Saba Art Coimbatore",
  description:
    "Learn about Saba Art, an independent handmade resin art studio in Coimbatore, Tamil Nadu pouring bespoke ocean clocks and botanical keepsakes.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[680px] px-6 py-16 md:py-24">
      {/* Eyebrow and Headline */}
      <div className="space-y-4 mb-12">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)] flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          <span>Coimbatore Studio Journal</span>
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl leading-[1.1]">
          Poured with patience, cast to last generations.
        </h1>
      </div>

      {/* Prose Column - Max 680px, generous leading */}
      <div className="space-y-6 text-base text-[var(--text-muted)] leading-[1.8] font-normal">
        <p className="text-lg text-[var(--text)] font-serif leading-relaxed">
          Saba Art began with a single wooden slab and a fascination with liquid light. Founded in Coimbatore, Tamil Nadu, our studio exists to transform natural seasoned hardwoods and botanical blooms into timeless, functional resin art.
        </p>

        {/* Inline Photo Slot 1 [TO CONFIRM - Studio photograph] */}
        <div className="my-10 space-y-2">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
            <Image
              src="/brand/hero-ocean.svg"
              alt="Hand pouring resin in the Coimbatore studio"
              fill
              className="object-cover"
              sizes="(max-width: 680px) 100vw, 680px"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] italic text-center">
            [TO CONFIRM — Studio pouring photograph] Layered epoxy wave formation over seasoned teak wood.
          </p>
        </div>

        <p>
          Unlike mass-produced factory decor, no two pours in our workshop ever settle the exact same way. When high-viscosity artist resin meets organic pigment and flame, delicate cellular lacing forms naturally—replicating the rhythmic froth of shoreline tides and the deep crystalline geometry of mineral geodes.
        </p>

        <p>
          Every piece is built on seasoned Indian teak wood. We allow each translucent wave a minimum of 24 to 72 hours of dust-free ambient curing before the next layer is cast. A single ocean wall clock or floral block can take over a week of dedicated attention, sanding through seven progressive grit levels up to a 3000-grit glass finish.
        </p>

        {/* Inline Photo Slot 2 [TO CONFIRM - Studio photograph] */}
        <div className="my-10 space-y-2">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
            <Image
              src="/brand/hero-floral.svg"
              alt="Preserving dried bridal flowers in clear resin"
              fill
              className="object-cover"
              sizes="(max-width: 680px) 100vw, 680px"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] italic text-center">
            [TO CONFIRM — Pressed botanical preservation photograph] Curing organic wedding garland petals in UV-stabilized crystal resin.
          </p>
        </div>

        <p>
          Our mission is quiet and focused: to craft heirlooms that hold personal meaning. Whether you are preserving flowers from your wedding day or adding an ocean accent to your living space, we pour every commission as if it were for our own home.
        </p>

        <div className="pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-serif font-bold text-lg text-[var(--text)]">{BRAND.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{BRAND.location}</p>
          </div>

          <Link href="/shop" className="btn-primary text-xs">
            <span>Explore Studio Pieces</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
