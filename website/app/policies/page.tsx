import { Metadata } from "next";
import { POLICIES, BRAND } from "@/lib/copy";
import { ShieldCheck, RotateCcw, AlertTriangle, Truck, Eye, Lock, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Studio Policies & Care Guide — Saba Art Coimbatore",
  description:
    "Returns, cancellation, care instructions, delivery timelines, and lifetime craftsmanship guarantee for Saba Art handmade resin pieces.",
};

export default function PoliciesPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-16 md:py-24">
      {/* Header */}
      <div className="space-y-3 mb-12 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Studio Commitments
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Policies & Care Guide
        </h1>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-xl">
          Every piece is poured by hand to order in our Coimbatore studio. We believe in complete transparency about timelines, materials, and care.
        </p>
      </div>

      {/* Quick Nav Anchor Pills */}
      <div className="flex flex-wrap gap-2 pb-10 border-b border-[var(--border)] mb-12">
        <a href="#returns" className="btn-secondary text-xs py-1.5 px-3">Returns</a>
        <a href="#cancellation" className="btn-secondary text-xs py-1.5 px-3">Cancellation</a>
        <a href="#care" className="btn-secondary text-xs py-1.5 px-3">Care Instructions</a>
        <a href="#warranty" className="btn-secondary text-xs py-1.5 px-3">Craftsmanship Guarantee</a>
        <a href="#delivery" className="btn-secondary text-xs py-1.5 px-3">Delivery Rates</a>
        <a href="#privacy" className="btn-secondary text-xs py-1.5 px-3">Privacy</a>
        <a href="#terms" className="btn-secondary text-xs py-1.5 px-3">Terms</a>
      </div>

      <div className="space-y-16">
        {/* Section 1: Returns */}
        <section id="returns" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
              <RotateCcw className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              {POLICIES.returns.title}
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>{POLICIES.returns.summary}</p>
            <p className="text-xs text-[var(--text)] font-medium">
              To submit an unboxing video, simply message us directly on WhatsApp with your Order Reference within 24 hours of package delivery.
            </p>
          </div>
        </section>

        {/* Section 2: Cancellation */}
        <section id="cancellation" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              {POLICIES.cancellation.title}
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-6 space-y-3 text-sm text-[var(--text)] leading-relaxed">
            <p className="font-semibold text-[var(--primary)]">12-Hour Cancellation Window</p>
            <p>{POLICIES.cancellation.summary}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {POLICIES.cancellation.warning}
            </p>
          </div>
        </section>

        {/* Section 3: Care Instructions */}
        <section id="care" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500/10 text-teal-600">
              <Eye className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              {POLICIES.care.title}
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>{POLICIES.care.summary}</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs">
              <li><strong>Cleaning:</strong> Use warm water with a dash of gentle dish soap and a clean microfibre cloth.</li>
              <li><strong>Scratches:</strong> Minor superficial micro-scratches can be polished out with non-abrasive plastic polish.</li>
              <li><strong>Food Safety:</strong> Fully cured epoxy resin surfaces are food contact safe for dry cold foods (fruits, bread, cheese). Never heat in microwave.</li>
            </ul>
          </div>
        </section>

        {/* Section 4: Craftsmanship Guarantee & Warranty */}
        <section id="warranty" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gold-leaf)]/10 text-[var(--gold-leaf)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              {POLICIES.warranty.title}
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>{POLICIES.warranty.summary}</p>
            <p className="text-xs">
              If your piece ever yellows or hazes under normal ambient indoor display conditions, contact our studio and we will refinish or re-pour the piece under our guarantee.
            </p>
          </div>
        </section>

        {/* Section 5: Delivery Information */}
        <section id="delivery" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
              <Truck className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              {POLICIES.delivery.title}
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>{POLICIES.delivery.summary}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-[var(--surface-muted)] text-xs">
                <strong className="text-[var(--text)] block">Coimbatore (641xxx)</strong>
                <span>Free delivery (1–2 days)</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-muted)] text-xs">
                <strong className="text-[var(--text)] block">Tamil Nadu & Kerala</strong>
                <span>₹60 delivery (3–5 days)</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--surface-muted)] text-xs">
                <strong className="text-[var(--text)] block">Rest of India</strong>
                <span>₹120 delivery (7–10 days)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Privacy */}
        <section id="privacy" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text)]">
              <Lock className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              Privacy Policy
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>
              We only collect your name, phone number, email, and shipping address to fulfill your custom order, generate shipping airway bills, and send production timeline updates.
            </p>
            <p className="text-xs">
              We never sell or distribute your data to third-party ad networks. Payment transactions are securely handled via Razorpay with 256-bit PCI-DSS compliant encryption.
            </p>
          </div>
        </section>

        {/* Section 7: Terms of Service */}
        <section id="terms" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text)]">
              <FileText className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">
              Terms & Artistic Character
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--text-muted)] leading-relaxed">
            <p>
              Every Saba Art creation is individually hand-cast and cured. Natural variations in teak wood grain, slight color nuances of dried seasonal botanicals, and micro-waves in layered resin are inherent qualities of bespoke artisanal craft, not defects.
            </p>
          </div>
        </section>
      </div>

      {/* Contact Prompt */}
      <div className="mt-20 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center space-y-3">
        <h3 className="font-serif text-xl font-semibold text-[var(--text)]">Have an unusual question?</h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          We&apos;re an independent studio. You can talk directly to the artist on WhatsApp about custom dimensions, wedding timelines, or care questions.
        </p>
        <div className="pt-2">
          <a
            href={BRAND.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs inline-flex items-center gap-2"
          >
            <span>Message on WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
}
