import Link from "next/link";
import { MessageCircle, Mail, ArrowUpRight } from "lucide-react";
import { Instagram } from "@/components/ui/Icons";
import { ResinSwirl } from "@/components/textures/ResinSwirl";
import { BRAND, POLICIES } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="relative border-t border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
      {/* 5% Resin swirl subtle wash */}
      <ResinSwirl opacity={0.05} />

      <div className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-16 md:py-24">
        {/* Main 4-column footer grid */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          {/* Col 1: Studio info */}
          <div className="space-y-4">
            <Link href="/" className="group flex items-center gap-3 font-serif text-2xl font-semibold tracking-tight text-[var(--text)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/saba-logo.svg"
                alt="Saba Art Mark"
                className="h-8 w-8 object-contain"
              />
              <span>{BRAND.name}</span>
            </Link>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-xs">
              Every piece is poured by hand to order in our Coimbatore studio. We work with layered epoxy resin, preserved blooms, and seasoned teak.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href={BRAND.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Saba Art on Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={`mailto:${BRAND.email}`}
                aria-label="Email the studio"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Col 2: Studio Work & Collections */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
              Collections
            </h3>
            <ul className="space-y-2.5 text-sm text-[var(--text-muted)]">
              <li>
                <Link href="/shop/for-the-home" className="hover:text-[var(--primary)] transition-colors">
                  For the Home
                </Link>
              </li>
              <li>
                <Link href="/shop/everyday-pieces" className="hover:text-[var(--primary)] transition-colors">
                  Everyday Pieces
                </Link>
              </li>
              <li>
                <Link href="/shop/keepsakes" className="hover:text-[var(--primary)] transition-colors">
                  Keepsakes & Blocks
                </Link>
              </li>
              <li>
                <Link href="/gallery" className="hover:text-[var(--primary)] transition-colors">
                  Studio Gallery & Archives
                </Link>
              </li>
              <li>
                <Link href="/custom" className="hover:text-[var(--primary)] transition-colors">
                  Custom Piece Builder
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Studio Policies & Guidance */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
              Policies & Care
            </h3>
            <ul className="space-y-2.5 text-sm text-[var(--text-muted)]">
              <li>
                <Link href="/policies" className="hover:text-[var(--primary)] transition-colors">
                  {POLICIES.delivery.title}
                </Link>
              </li>
              <li>
                <Link href="/policies" className="hover:text-[var(--primary)] transition-colors">
                  {POLICIES.care.title}
                </Link>
              </li>
              <li>
                <Link href="/policies" className="hover:text-[var(--primary)] transition-colors">
                  {POLICIES.returns.title}
                </Link>
              </li>
              <li>
                <Link href="/orders" className="hover:text-[var(--primary)] transition-colors">
                  Track Your Order
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-[var(--primary)] transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Studio Notes Newsletter */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
              Studio Notes
            </h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              New batch announcements and custom commission openings. No spam, ever.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-2 pt-1">
              <input
                type="email"
                placeholder="Your email address"
                className="input-field text-sm"
                aria-label="Email address for studio notes"
              />
              <button type="submit" className="btn-secondary w-full text-xs h-9 justify-between">
                <span>Join studio list</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Quiet Trust Row & Copyright */}
        <div className="mt-16 pt-8 border-t border-[var(--border)] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <p>{BRAND.trustLine}</p>
          <p>© {new Date().getFullYear()} Saba Art Studio. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
