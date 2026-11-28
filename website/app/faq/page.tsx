"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, HelpCircle, ArrowRight } from "lucide-react";
import { POLICIES, BRAND } from "@/lib/copy";

const FAQS = [
  {
    id: "cancellation",
    q: "Can I cancel or modify my order after placing it?",
    a: POLICIES.cancellation.summary,
  },
  {
    id: "returns",
    q: "What is your returns and replacement policy?",
    a: POLICIES.returns.summary,
  },
  {
    id: "yellowing",
    q: "Will my resin piece turn yellow over time?",
    a: POLICIES.warranty.summary,
  },
  {
    id: "care",
    q: "How should I clean and care for cured resin?",
    a: POLICIES.care.summary,
  },
  {
    id: "delivery",
    q: "What are your delivery charges and shipping times across India?",
    a: POLICIES.delivery.summary,
  },
  {
    id: "international",
    q: "Do you ship internationally?",
    a: "International shipping is currently not handled through our automated checkout. For custom commissions outside India, please message our Coimbatore studio directly on WhatsApp to coordinate private courier quotes.",
  },
  {
    id: "customization",
    q: "Can I choose my own colors, text, and flower petals?",
    a: "Yes! You can use our interactive Custom Piece Builder (/custom) to configure shapes, color themes, real botanicals, and engraved initials, or reach out to us on WhatsApp for bespoke requirements.",
  },
  {
    id: "heat",
    q: "Can I place hot coffee mugs or dishes on resin coasters and trays?",
    a: "Yes. Our finished top coats are heat-resistant up to 50°C, which is ideal for hot tea cups and coffee mugs. However, avoid placing boiling cookware directly off the flame onto the resin surface.",
  },
];

export default function FAQPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-16 md:py-24">
      {/* Title */}
      <div className="space-y-3 mb-12 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Studio Knowledge Base
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Frequently Asked Questions
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-lg leading-relaxed">
          Everything you need to know about our handcrafted pouring process, curing timelines, delivery, and lifetime craftsmanship.
        </p>
      </div>

      {/* Accordion */}
      <Accordion.Root type="single" collapsible className="space-y-4">
        {FAQS.map((faq) => (
          <Accordion.Item
            key={faq.id}
            value={faq.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-colors data-[state=open]:border-[var(--primary)]"
          >
            <Accordion.Header>
              <Accordion.Trigger className="flex w-full items-center justify-between p-6 text-left font-serif text-base font-semibold text-[var(--text)] hover:text-[var(--primary)] transition-colors group">
                <span className="flex items-center gap-3">
                  <HelpCircle className="h-4 w-4 text-[var(--accent)] shrink-0" />
                  <span>{faq.q}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0 transition-transform duration-300 group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-6 pb-6 pt-1 text-xs text-[var(--text-muted)] leading-relaxed border-t border-[var(--border)]/50 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              <p>{faq.a}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>

      {/* WhatsApp Assistance Banner */}
      <div className="mt-16 rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center space-y-3">
        <h3 className="font-serif text-xl font-semibold text-[var(--text)]">Still have a specific question?</h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          We answer every inquiry directly from the workshop in Coimbatore.
        </p>
        <div className="pt-2">
          <a
            href={BRAND.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs inline-flex items-center gap-2"
          >
            <span>Message on WhatsApp</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
