/**
 * Centralised Brand Copy for Saba Art.
 * All customer-facing messages, trust statements, and policy definitions.
 * Tone: Plain, warm, everyday Indian English directly from the artist.
 */

export const BRAND = {
  name: "Saba Art",
  tagline: "Handmade resin art studio in Coimbatore",
  location: "Coimbatore, Tamil Nadu, India",
  instagram: "@saba_art",
  instagramUrl: "https://instagram.com/saba_art",
  whatsapp: "+91 98765 43210", // [TO CONFIRM - Studio phone]
  whatsappUrl: "https://wa.me/919876543210",
  email: "hello@sabaart.in", // [TO CONFIRM - Studio email]
  trustLine: "Handmade in Coimbatore · 500+ pieces delivered · Lifetime craftsmanship guarantee",
  craftsmanshipGuarantee:
    "Every piece comes with a lifetime craftsmanship guarantee against yellowing under normal indoor use.",
} as const;

export const HERO_SLIDES_COPY = [
  {
    id: "ocean-clock",
    eyebrow: "SIGNATURE PIECE",
    title: "Poured by hand\nin Coimbatore.",
    body: "Layered ocean waves cast in crystal-clear epoxy resin on seasoned teak wood. Each piece takes seven days to pour and cure.",
    cta: "Explore the clock",
    href: "/product/resin-clock-12in",
    artwork: "/brand/hero-ocean.svg",
    isDarkText: false,
  },
  {
    id: "amethyst-geode",
    eyebrow: "GEODE COLLECTION",
    title: "Amethyst depths\ncast in gold.",
    body: "Deep violet mineral crystal bands framed with metallic gold-leaf pour ribbons over rich teak foundations.",
    cta: "Explore Home Pieces",
    href: "/shop/for-the-home",
    artwork: "/brand/hero-geode.svg",
    isDarkText: false,
  },
  {
    id: "bouquet-preservation",
    eyebrow: "KEEPSAKES",
    title: "Keep the flowers\nfrom the day.",
    body: "Preserve your wedding garland, bridal bouquet, or anniversary blooms in crystal resin blocks that last a lifetime.",
    cta: "Design your piece",
    href: "/custom",
    artwork: "/brand/hero-floral.svg",
    isDarkText: true, // Brightest slide by wide margin: requires dark text
  },
  {
    id: "custom-configurator",
    eyebrow: "BESPOKE",
    title: "Design a piece\nthat's only yours.",
    body: "Choose your shape, wood base, ocean palette, and dried petals. We build it to your exact specifications.",
    cta: "Design your piece",
    href: "/custom",
    artwork: "/brand/hero-custom.svg",
    isDarkText: false,
  },
] as const;

export const POLICIES = {
  returns: {
    title: "Returns & Exchanges",
    summary:
      "Because every piece is poured by hand to order, we cannot accept returns on personalised or custom work. If a piece arrives damaged in transit, please share an unboxing video within 24 hours and we will pour you a replacement immediately.",
  },
  cancellation: {
    title: "Cancellation",
    summary:
      "You can cancel your order within 12 hours of booking for a full refund. Once resin pouring and flower preparation begin, the order cannot be cancelled.",
    warning:
      "I understand custom orders can be cancelled within 12 hours, and that once resin pouring starts the amount paid is non-refundable.",
  },
  care: {
    title: "Resin Care Instructions",
    summary:
      "Keep away from prolonged harsh sunlight. Wipe clean with a soft, damp microfibre cloth. Never use harsh alcohol or acetone cleaners. Heat-resistant up to 50°C — please avoid resting boiling pans directly on the surface.",
  },
  warranty: {
    title: "Craftsmanship Guarantee",
    summary:
      "We use UV-stabilised artist-grade epoxy resin that resists yellowing under indoor lighting for life. Natural organic petals may mature gently in tone over years, which is part of their organic beauty.",
  },
  delivery: {
    title: "Delivery Information",
    summary:
      "Coimbatore city: Free hand delivery (1–2 days after dispatch). Rest of Tamil Nadu & Kerala: ₹60 via DTDC/Delhivery (3–5 days). Rest of India: ₹120 (7–10 days). International shipping is currently unavailable.",
  },
} as const;

export const NAV_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "Custom Builder", href: "/custom" },
  { label: "Gallery", href: "/gallery" },
  { label: "Process", href: "/process" },
  { label: "About", href: "/about" },
] as const;
