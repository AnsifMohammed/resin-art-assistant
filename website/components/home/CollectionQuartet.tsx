import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { GlassRefraction } from "@/components/textures/GlassRefraction";
import { COLLECTIONS } from "@/lib/products";

export function CollectionQuartet() {
  return (
    <section className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Curated Lines
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl mt-2">
            Poured for every corner.
          </h2>
        </div>
        <Link
          href="/shop"
          className="btn-tertiary text-sm mt-4 md:mt-0"
        >
          <span>View entire catalogue</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {COLLECTIONS.map((c) => (
          <Link
            key={c.slug}
            href={`/shop/${c.slug}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition-transform duration-500 hover:-translate-y-1 hover:shadow-xl"
          >
            {/* Visual Aspect 4:5 */}
            <div className="relative aspect-4/5 w-full overflow-hidden p-6 flex flex-col justify-end bg-[var(--surface-muted)]">
              <Image
                src={
                  c.slug === "for-the-home"
                    ? "/brand/collection-home.svg"
                    : c.slug === "everyday-pieces"
                    ? "/brand/collection-everyday.svg"
                    : c.slug === "keepsakes"
                    ? "/brand/collection-keepsakes.svg"
                    : "/brand/collection-gifting.svg"
                }
                alt={c.name}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
              <GlassRefraction />

              {/* Teal label sliding up on hover */}
              <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                <span className="inline-block rounded-full bg-[var(--accent)]/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-xs">
                  {c.count} Pieces
                </span>
                <h3 className="font-serif text-xl font-semibold text-white mt-2">
                  {c.name}
                </h3>
              </div>
            </div>

            {/* Description Card Foot */}
            <div className="p-5 border-t border-[var(--border)] bg-[var(--surface)]">
              <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                {c.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
