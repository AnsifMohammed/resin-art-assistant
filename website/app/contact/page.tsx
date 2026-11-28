"use client";

import { useState } from "react";
import { MessageCircle, Mail, MapPin, Send, CheckCircle2, Clock } from "lucide-react";
import { Instagram } from "@/components/ui/Icons";
import { BRAND } from "@/lib/copy";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [type, setType] = useState("commission");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim() || !message.trim()) return;

    // Direct WhatsApp fallback link generation
    const waText = encodeURIComponent(
      `Hello Saba Art studio! My name is ${name}. Inquiry regarding [${type}]: ${message} (Contact: ${contact})`
    );
    window.open(`https://wa.me/${BRAND.whatsapp.replace(/\D/g, "")}?text=${waText}`, "_blank");
    setSubmitted(true);
  };

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-16 md:py-24">
      {/* Title */}
      <div className="space-y-4 mb-16 text-center md:text-left">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Studio Inquiries
        </span>
        <h1 className="font-serif text-3xl font-semibold text-[var(--text)] sm:text-5xl">
          Speak with the artist.
        </h1>
        <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
          We answer all messages directly from our Coimbatore workshop. Whether you are planning a bespoke dining table or need advice on wedding flower preservation, reach out below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Column (7 cols): Contact Form */}
        <div className="lg:col-span-7 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-10 shadow-xs">
          {submitted ? (
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="font-serif text-2xl font-semibold text-[var(--text)]">Message Sent</h2>
              <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
                Thank you, {name}! Your message was dispatched to the studio WhatsApp. We will reply as soon as our current resin pour is settled.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setMessage("");
                }}
                className="btn-secondary text-xs"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text)]">Your Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text)]">Phone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text)]">Inquiry Nature</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="input-field"
                >
                  <option value="commission">Custom Piece Commission</option>
                  <option value="wedding">Wedding Garland / Flower Preservation</option>
                  <option value="order-status">Existing Order Question</option>
                  <option value="bulk">Bulk / Return Gift Inquiry</option>
                  <option value="care">Care & Restoration Advice</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text)]">Message or Dimension Requirements *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Tell us about the piece you have in mind, desired dimensions, or occasion date..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input-field py-3 resize-none"
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center h-12 text-sm mt-2"
              >
                <Send className="h-4 w-4" />
                <span>Send to Studio (WhatsApp Direct)</span>
              </button>

              <p className="text-[11px] text-center text-[var(--text-muted)]">
                Average reply time: under 2 hours during studio operating hours.
              </p>
            </form>
          )}
        </div>

        {/* Right Column (5 cols): Direct Studio Channels & Coordinates */}
        <div className="lg:col-span-5 space-y-6">
          {/* Studio WhatsApp */}
          <a
            href={BRAND.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-all hover:border-[var(--primary)] hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Instant Response</span>
                <h3 className="font-serif text-lg font-semibold text-[var(--text)] mt-0.5">WhatsApp Studio Chat</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Share reference photos, discuss custom color swatches, or get real-time price quotes.
                </p>
                <span className="inline-block pt-2 font-mono text-xs font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
                  {BRAND.whatsapp} →
                </span>
              </div>
            </div>
          </a>

          {/* Studio Instagram */}
          <a
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-all hover:border-[var(--primary)] hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] shrink-0">
                <Instagram className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Visual Journal</span>
                <h3 className="font-serif text-lg font-semibold text-[var(--text)] mt-0.5">Instagram DMs & Stories</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Behind the scenes footage of daily curing waves and newly completed commissions.
                </p>
                <span className="inline-block pt-2 font-mono text-xs font-bold text-[var(--text)] group-hover:text-[var(--primary)]">
                  {BRAND.instagram} →
                </span>
              </div>
            </div>
          </a>

          {/* Email & Physical Studio Coordinates */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 space-y-4 text-xs text-[var(--text-muted)]">
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-[var(--primary)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[var(--text)] block font-semibold">Email Orders & Press:</strong>
                <a href={`mailto:${BRAND.email}`} className="hover:text-[var(--primary)]">
                  {BRAND.email}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[var(--text)] block font-semibold">Workshop Location:</strong>
                <span>Coimbatore, Tamil Nadu, India — 641001</span>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  [TO CONFIRM — Studio street address, Coimbatore]
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[var(--text)] block font-semibold">Studio Hours:</strong>
                <span>Monday to Saturday: 10:00 AM – 7:00 PM IST</span>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Closed on Sundays for chemical curing cycles.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
