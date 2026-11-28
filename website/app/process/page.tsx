import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock } from "lucide-react";
import { BRAND } from "@/lib/copy";

export const metadata: Metadata = {
  title: "The Workshop Process — Saba Art Coimbatore",
  description:
    "How Saba Art pours, layers, and cures handcrafted resin art pieces over a 7-day studio cycle in Coimbatore.",
};

const PROCESS_STEPS = [
  {
    step: "01",
    title: "Design & Consultation",
    timeline: "Day 1",
    desc: "Every custom piece begins with a conversation. We discuss your room's color temperature, natural wood grains, custom dimension requirements, and any botanical petals or initials you wish to embed.",
    photo: "/brand/hero-custom.svg",
    caption: "[TO CONFIRM — Consultation & teak prep photograph] Selecting and leveling seasoned Indian hardwood.",
  },
  {
    step: "02",
    title: "Multi-Layer Wave Pouring",
    timeline: "Days 2–5",
    desc: "Resin cannot be rushed. We pour in sequential thin coats—applying artist-grade mica pigments and using thermal blowtorches to coax natural wave lacing and micro-foam. Each layer requires 24 hours of undisturbed room-temperature curing.",
    photo: "/brand/hero-ocean.svg",
    caption: "[TO CONFIRM — Layered wave pour photograph] Thermal blowtorch lacing across translucent teal waves.",
  },
  {
    step: "03",
    title: "Hand-Sanding & Optical Polishing",
    timeline: "Day 6",
    desc: "Once cured to full Shore D hardness, pieces undergo seven stages of wet-sanding from 400-grit up to 3000-grit diamond polish, bringing the resin surface to optical glass clarity with satin soft-touch wood borders.",
    photo: "/brand/hero-geode.svg",
    caption: "[TO CONFIRM — Finishing and edge bevel photograph] Hand-bevelling teak edges to glass clarity.",
  },
  {
    step: "04",
    title: "Inspection & Insured Crating",
    timeline: "Day 7",
    desc: "Before departure, every piece is inspected under 5000K daylight simulation for zero surface defects. It is then wrapped in acid-free tissue, seeded paper gift wrap, and double-boxed in high-density shock foam for express courier transit.",
    photo: "/brand/hero-floral.svg",
    caption: "[TO CONFIRM — Packaging and sealing photograph] Wax-sealed in artisan crating for insured transit.",
  },
];

export default function ProcessPage() {
  return (
    <div className="mx-auto max-w-[840px] px-6 py-16 md:py-24">
      {/* Title */}
      <div className="space-y-4 mb-16 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)] flex items-center justify-center md:justify-start gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>The Seven-Day Studio Cycle</span>
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          How our pieces come to life.
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
          From rough timber selection to final optical buffing, walk through the 7-day chemical curing and hand-sanding journey of every Saba Art commission.
        </p>
      </div>

      {/* 4 Photo Steps */}
      <div className="space-y-20">
        {PROCESS_STEPS.map((item) => (
          <div
            key={item.step}
            className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-10 shadow-xs space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-[#1A1620]">
                  {item.step}
                </span>
                <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
                  {item.title}
                </h2>
              </div>
              <span className="inline-block px-3 py-1 rounded-full bg-[var(--surface-muted)] font-mono text-xs font-semibold text-[var(--accent)] self-start sm:self-auto">
                {item.timeline}
              </span>
            </div>

            {/* Photo slot */}
            <div className="space-y-2">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]">
                <Image
                  src={item.photo}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 840px) 100vw, 840px"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] italic text-center">
                {item.caption}
              </p>
            </div>

            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              {item.desc}
            </p>
          </div>
        ))}
      </div>

      {/* CTA Box */}
      <div className="mt-20 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center space-y-4">
        <h3 className="font-serif text-2xl font-semibold text-[var(--text)]">Ready to pour your piece?</h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          Start with our live 3D piece builder or message our Coimbatore studio to select your teak slab.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
          <Link href="/custom" className="btn-primary text-xs">
            <span>Configure Custom Piece</span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
          <a
            href={BRAND.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs"
          >
            <span>Message on WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
}
