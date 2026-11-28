# Build Brief — Saba Art Premium Resin Art Store

> **For Antigravity.**

## 0. Where this is built — read before touching anything

Build it **inside the existing `resin-art-assistant` repository**, in a new top-level folder:

```
resin-art-assistant/
├── backend/      ← existing AI assistant API      — DO NOT MODIFY
├── dashboard/    ← existing admin dashboard       — DO NOT MODIFY
├── docs/         ← existing documentation         — DO NOT MODIFY
└── website/      ← ★ BUILD EVERYTHING HERE
```

**Every path in this brief is relative to `website/`.** When the brief says `app/globals.css`, it means `website/app/globals.css`.

### Hard rules

1. **Create and modify files only inside `website/`.** Do not edit, refactor, reformat or "clean up" anything in `backend/`, `dashboard/` or `docs/`. Those are live production code for a different application.
2. **Do not import from `backend/` or `dashboard/`.** No shared `tsconfig` paths pointing outside `website/`, no reaching into their `src/`. The colour tokens and product data in this brief are given in full below — use those, do not go fishing for them in the dashboard.
3. **`website/` has its own `package.json` and its own `node_modules`.** Do not add dependencies to the root or to the other folders. Do not convert the repo to npm/pnpm workspaces.
4. **Do not touch the repo root** — no changes to root `README.md`, `.gitignore`, CI config or git history, except adding `website/node_modules` and `website/.next` to `.gitignore` if they are not already covered.
5. **Work on a new branch**, e.g. `feat/website`. Never commit to `main` — it is the production branch for the assistant.
6. **Other agents and people work in this repository at the same time.** Before you start, run `git status`. If files outside `website/` have uncommitted changes, leave them completely alone — they are someone else's work in progress.

### Why self-contained

The storefront must run and deploy on its own. It gets its own data layer (§1) rather than calling the assistant's API, so neither project can break the other. If the two are wired together later, that is a separate, deliberate piece of work — not part of this build.

---

Build a **premium e-commerce website** for **Saba Art**, a handmade resin-art studio in Coimbatore, Tamil Nadu, India. Every piece is poured by hand, to order.

The word that governs every decision is **premium**. Not "nice". Not "clean". Premium means: generous whitespace, slow confident motion, photography treated as the hero, typography with real contrast, and restraint everywhere else. A visitor should feel they've walked into a gallery, not a marketplace.

---

## 1. Stack

- **Next.js 15+**, App Router, TypeScript strict. Server Components by default; `"use client"` only where interaction requires it.
- **Tailwind CSS v4** — CSS-first config, design tokens as CSS variables in `app/globals.css`. No `tailwind.config.ts`.
- **shadcn/ui** for primitives (Dialog, Sheet, Accordion, Form, Toast, Carousel) — fully restyled to the brand. Default shadcn grey must not survive anywhere.
- **Framer Motion** for all animation. **Embla Carousel** for carousels. **Lenis** for smooth scroll.
- **Zustand** + `persist` for cart. **TanStack Query** for client data. **React Hook Form + Zod** for forms.
- **Razorpay Checkout** — cards, UPI, netbanking, wallets. Server-side order creation, HMAC signature verification, webhook.
- **Sanity** or MDX for products/testimonials — not hardcoded arrays in components. Document the choice in the README.
- `next/image` everywhere. AVIF with WebP fallback, blur placeholders.
- Deploy to **Vercel**, with the project root set to `website/`. **Vitest** for pricing logic, **Playwright** for the checkout happy path.

All of the above are installed in `website/package.json` only. The existing `backend/` and `dashboard/` keep their own dependency trees untouched.

---

## 2. Design system — this is where premium is won or lost

### 2.1 Palette

| Token | Light | Dark |
|---|---|---|
| background | `#FAF8F5` | `#0C0A14` |
| surface | `#FFFFFF` | `#16131F` |
| surface-muted | `#F4F1EC` | `#1E1A2B` |
| border | `#E8E3DB` | `rgba(255,255,255,0.07)` |
| text | `#1A1620` | `#F4F1F7` |
| text-muted | `#6B6459` | `#9B94A8` |
| **primary — amber** | `#E8912B` | `#F5A63D` |
| primary-soft | `#FDF0DC` | `rgba(232,145,43,0.14)` |
| **accent — deep teal** | `#0E7C7B` | `#2DD4BF` |
| **accent-2 — amethyst** | `#7C5BD9` | `#A78BFA` |
| gold-leaf | `#C9A227` | `#E3C14E` |
| success / danger | `#0F766E` / `#B91C1C` | `#34D399` / `#F87171` |

Tokens on `:root`, redefined under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. Header toggle writes `data-theme` to `<html>`, persisted.

**Colour discipline — non-negotiable.** Amber is the only call-to-action colour, and **only one amber element is visible at a time**. Teal is links and the ocean line. Amethyst is geode pieces only. Gold-leaf is for celebratory moments (discount unlocked, order confirmed) — never decoration. Backgrounds stay in the warm stone family so amber reads hot against them.

Cheapness comes from too many colours. Resist.

### 2.2 Typography

- **Fraunces** (variable, optical sizing on) 600/700 — headings, product names. Its soft-serif warmth reads handmade; a geometric sans reads like a SaaS dashboard.
- **Inter** 400/500/600 — body, labels, inputs, prices.
- Two typefaces total. No third.

| Role | Size (desktop / mobile) | Face | Tracking | Leading |
|---|---|---|---|---|
| Hero | 80 / 44 | Fraunces 700 | `-0.04em` | 1.0 |
| Section title | 44 / 30 | Fraunces 600 | `-0.02em` | 1.1 |
| Card title | 20 | Fraunces 600 | `-0.01em` | 1.3 |
| Lead | 19 / 17 | Inter 400 | `0` | 1.65 |
| Body | 16 | Inter 400 | `0` | 1.7 |
| Label / meta | 13 | Inter 500 | `0.02em` | 1.4 |
| Eyebrow | 11 | Inter 600 uppercase | `0.16em` | 1.2 |
| Price | 22 | Inter 600 | `-0.01em` | 1 |

`font-variant-numeric: tabular-nums` on every price, quantity and date. Indian rupee formatting with Indian digit grouping: `₹1,200`, `₹48,500`. Prose maxes at 68 characters per line.

### 2.3 Space — the main lever

Premium is mostly whitespace. Be generous to the point that it feels slightly too much, then keep it.

- **4px grid.** Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 160 · 200.
- Section rhythm: **128px** desktop / 72px mobile. Hero is full viewport.
- Page gutter 24px desktop, 16px mobile. Content max 1320px; prose max 680px.
- Radius: **24px** hero/feature cards · **16px** product cards and images · **10px** inputs/buttons · **full** pills and chips.
- Grid: 12 / 6 / 4 columns desktop / tablet / mobile, 24px gutters.

### 2.4 Elevation — three levels, no more

- **Flat** — 1px hairline border, no shadow. Most cards.
- **Raised** — `0 1px 2px rgb(0 0 0/0.04), 0 6px 20px rgb(0 0 0/0.05)`. Hover, popovers.
- **Floating** — `0 12px 40px rgb(0 0 0/0.12)` + hairline. Drawer, dialog, lightbox.

In dark mode shadows vanish — replace with `inset 0 1px 0 rgb(255 255 255/0.05)` and a one-step-lighter surface. Never carry a light-mode drop shadow into dark.

**Glass** (`backdrop-blur-2xl`, 70% surface opacity) in exactly two places: the sticky header once scrolled past 80px, and the cart drawer. Nowhere else.

### 2.5 Signature texture — build these four, use them sparingly

This is what separates the site from a template. Never fire more than one in a viewport.

1. **Resin swirl** — layered SVG `feTurbulence` + `feDisplacementMap`, slow marbled flow. 5–8% opacity as a section wash. Drift the seed at ~0.3fps so it moves almost imperceptibly. Fully paused under `prefers-reduced-motion`.
2. **Gold leaf flecks** — scattered metallic polygons with a masked gradient sheen that travels on scroll. Hero accent, discount-unlocked, order confirmation.
3. **Pour edge** — organic, slightly irregular SVG section dividers, as if resin settled against a mould. Never a straight rule, never a lazy diagonal.
4. **Glass refraction** — on product card hover, a soft caustic highlight sweeps across the image over 700ms, like light through cured resin. Subtle: 12% white at peak.

### 2.6 Motion — slow and confident

Cheap sites animate fast. Premium sites animate slowly and rarely.

- Durations: **160ms** micro (hover, focus) · **240ms** standard · **380ms** entrance · **700ms+** hero and scroll choreography.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` entrances, `cubic-bezier(0.4, 0, 0.2, 1)` exits. Springs (`stiffness 260, damping 26`) for physical things — quantity stepper, cart badge.
- **Scroll reveal:** 32px rise + fade, 70ms stagger, triggered at 15% intersection, **once only**. Never re-animate on scroll-up.
- **Hero headline:** per-line mask reveal, 90ms stagger, 700ms each.
- **Numbers** (prices, totals, quantities) count over 250ms — never snap.
- **Image hover:** 1.05 scale over 600ms inside an overflow-hidden parent. The container never moves.
- **Custom cursor** on desktop: amber dot that scales to a ring over interactive elements, becomes a "drag" label over carousels. Disabled on touch.
- `prefers-reduced-motion: reduce` kills transforms, parallax, cursor effects and turbulence entirely — opacity-only remains. Do not merely shorten durations.

### 2.7 Component details

- **Buttons** — primary solid amber, text `#1A1620`, 46px tall (50px mobile), 10px radius, 24px horizontal padding. Hover darkens 6% and lifts 1px; active presses 1px; focus shows a 2px amber ring at 2px offset. Secondary is a hairline ghost. Tertiary is a teal text link whose underline grows from the left.
- **Inputs** — 46px tall, 1px border, 10px radius. Focus swaps border to amber plus a 3px `primary-soft` glow. Labels above, never placeholder-as-label. Errors below in danger with a 13px icon.
- **Product card** — 4:5 image, overflow hidden. Name in Fraunces 600, price in tabular Inter 600, lead-time pill in `primary-soft`. Hover: lift 2px to Raised, image 1.05, caustic sweep, quick-add fades up from the image's lower edge.
- **Skeletons** — shaped to the real content, shimmer at 1.4s. Never a grey block, never a spinner where the shape is known.
- **Empty states** — hand-drawn line illustration, one sentence in the brand voice, one clear action. No sad-face emoji.
- **Focus rings** — 2px amber at 2px offset on every interactive element, both themes. Never `outline: none` without a replacement.

### 2.8 Photography direction

Premium lives or dies here. Warm natural light, shallow depth of field, honest surfaces — linen, raw wood, stone. Pieces shot **in use**, never floating on white. One macro per product showing embedded flowers, foil or sand. Consistent ~5600K cast across the library so the grid reads as one shoot.

**There are currently no product photographs.** Build with clearly-marked placeholder slots at the real aspect ratios and list photography as a launch blocker in the README. Do not ship stock "artisan hands" filler.

### 2.9 Forbidden

Generic Shopify-theme look. Gradients on everything. Glassmorphism beyond the two sanctioned places. Emoji as UI icons (`lucide-react` only). Lorem ipsum. Newsletter pop-up on load. Infinite parallax. A third typeface. More than one amber CTA in view. Drop shadows on everything.

---

## 3. Brand voice

Plain, warm, everyday Indian English — a message from the artist, not a marketing department. Contractions fine. At most one emoji per block, and not in every block.

**Banned:** "Elevate your space", "Curated collection", "Unleash", "Discover", "Feel free to", "Dear customer", "Premium quality".

> Good: *"Each coaster is poured by hand, so no two sets look the same. Yours takes about five days."*
> Bad: *"Elevate your home with our curated collection of premium artisanal coasters."*

Premium copy is specific and unhurried. It never shouts.

---

## 4. Catalogue and commerce rules

Everything is **made to order**. No stock, no inventory.

Product shape: `slug, name, description, collection, sizes[{name, price}], leadTimeDays, customizable, customOptions[], images[], materials[], isActive, sortOrder`. **Price lives on the size** — listings show `₹min – ₹max`, resolving once a size is chosen.

### Seed catalogue

| Slug | Name | Price | Size | Lead time | Custom options |
|---|---|---|---|---|---|
| `ocean-coaster-set-4` | Ocean Coaster Set of 4 | ₹1,200 | 10cm round | 5 days | colour, name engraving |
| `resin-clock-12in` | 12 inch Resin Wall Clock | ₹2,800 | 12 inch | 7 days | colour, dried flowers, name, theme |
| `resin-tray-large` | Large Resin Serving Tray | ₹1,800 | 30×20cm | 6 days | colour, dried flowers, gold foil |
| `keychain-set-3` | Resin Keychain Set of 3 | ₹450 | — | 3 days | colour, name, shape |
| `photo-frame-5x7` | Resin Photo Frame 5×7 | ₹950 | — | 5 days | colour, dried flowers |
| `bookmarks-set-4` | Resin Bookmark Set of 4 | ₹380 | — | 3 days | colour, pressed flowers, name |

**Collections:** For the Home · Everyday Pieces · Keepsakes · Wedding & Gifting

**Colour themes:** Ocean Blue · Emerald Green · Black & Gold · Amethyst Purple · custom shade matched to the customer's interior

**Materials for copy:** epoxy resin, dried and pressed flowers, preserved bridal bouquet petals, gold and silver foil leafing, real sand, sea shells, teak wood bases

### Pricing rules — one pure module, unit tested

- **Bulk discount:** 10+ of the same product → 10% off that line. Appears live in the cart the instant quantity hits 10, with the gold-fleck flourish. Nudge at 8: *"Add 2 more for 10% off."*
- **Customisation** adds **2 days** to that product's lead time.
- **Dispatch-by date** = `today + max(leadTimeDays in cart) + 2 if anything is customised`, skipping Sundays. Shown on product page, cart, checkout and confirmation.
- **Delivery:** Coimbatore city 1–2 days **free** · rest of Tamil Nadu 3–5 days **₹60** · rest of India 7–10 days **₹120** · **international not available** — block it at the form with a WhatsApp fallback. Zone derives from pincode + state.
- **Courier:** Shiprocket (DTDC / Delhivery).

### Policies — surface inline, not only on `/policies`

- **Returns:** No returns on personalised custom orders. Exchange only for transit damage reported with an unboxing video within 24 hours.
- **Cancellation:** Cancel within 12 hours of booking. Once resin pouring starts, the amount paid is non-refundable. *(Goes on the confirmation screen.)*
- **Care:** Away from prolonged harsh sunlight. Wipe with a damp microfibre cloth. Heat safe to 50°C; avoid boiling pans. *(Product page + receipt email.)*
- **Warranty:** Lifetime craftsmanship guarantee against yellowing under standard indoor use. No warranty on colour fading from sunlight.

---

## 5. Pages

```
/                      Home
/shop                  All products, filterable
/shop/[collection]     Collection listing
/product/[slug]        Detail + inline configurator
/custom                Full custom configurator
/cart                  Full cart page (drawer is primary)
/checkout              Single-page checkout
/checkout/success      Confirmation
/orders                Order history / lookup
/orders/[orderNo]      Single order detail + tracking

/wishlist              Saved pieces
/gifting               Gift guide + gift options explainer
/bulk                  Bulk & wedding return gifts — quote request
/preservation          Bouquet preservation — booking + how to send flowers
/occasions/[slug]      Diwali, weddings, housewarming, Ramadan
/gift-card             Buy a gift card
/gift-card/redeem      Redeem
/studio-visit          Book a studio visit / local pickup (Coimbatore)
/search                Full search results

/about  /process  /gallery  /testimonials  /faq  /policies  /contact
```

---

## 6. Home screen — section by section

### 6.1 Hero carousel ⭐

A **full-viewport carousel**, 3–4 slides, Embla with autoplay.

- **8 second** dwell per slide. Premium means unhurried — do not use 4s.
- Transition: **1200ms cross-fade with a 1.06 → 1.0 ken-burns settle** on the incoming image. No hard slide, no horizontal push.
- Each slide: full-bleed photograph, a warm amber radial wash at 18% from the lower left, eyebrow + headline (Fraunces 80) + one line of body + **one** amber CTA.
- Headline animates in with a **per-line mask reveal**, 90ms stagger.
- **Progress indicators:** thin horizontal bars, one per slide, the active one filling over the dwell duration. Not dots. Clickable, keyboard reachable, `aria-label` per slide.
- **Pauses on hover, on focus, and when the tab is hidden.** Resumes on leave.
- Drag/swipe enabled; the custom cursor becomes a "drag" label over it.
- Under `prefers-reduced-motion`: autoplay off, cross-fade only, no ken-burns.
- First slide's image is `priority` and must be the LCP element — do not let the carousel library delay it.

Slide content:
1. The studio's signature ocean-wave wall clock — *"Poured by hand in Coimbatore"*
2. Wedding bouquet preservation — *"Keep the flowers from the day"*
3. The custom configurator — *"Design a piece that's only yours"*

### 6.2 Collection quartet

Four cards, 4:5 images, teal label sliding up on hover, caustic sweep across the image. Generous 32px gutters.

### 6.3 Featured pieces

Six-card grid, real products, real prices, real lead times. Quick-add on hover. Quick-view opens a Dialog without navigating away.

### 6.4 Configurator teaser

A live miniature of the custom builder embedded in the page — two controls (shape, colour) driving a real preview. Clicking anything deep-links to `/custom` with state preserved in the URL.

### 6.5 Process strip

Four steps — Design together → Pour and cure → Finish and polish → Pack and ship — as a scroll-linked horizontal timeline, the active step lighting amber as it enters.

### 6.6 Materials showcase

Split layout. Hovering a material name (dried flowers, gold leaf, sea shells, sand) cross-fades a macro photograph beside it over 500ms.

### 6.7 Testimonials carousel ⭐

**Three visible on desktop, two on tablet, one on mobile.** Embla, peek of the next card at the edge so it reads as a track, not a slideshow.

Each card:
- The quote in **Fraunces 20, not italic** — italic reads cheap at this weight
- Customer name, city, and **what they bought**, linked to that product — specificity is what makes a testimonial credible
- Optional customer photo of the piece in their home, 4:5, rounded 16px
- A 5-star row in `gold-leaf`, small — 14px, not a shouty block
- Flat surface with a hairline border. **No drop shadow, no quotation-mark graphic.**

Behaviour:
- Autoplay **7s**, pauses on hover/focus/hidden tab
- Arrows on desktop (hairline ghost buttons, appearing on section hover), swipe on mobile
- Progress bars, same treatment as the hero
- Keyboard: arrows move slides, each card is tabbable
- `aria-roledescription="carousel"`, live region announcing "Testimonial 2 of 9"

**There is no testimonial content yet.** Build the component with clearly-marked placeholder entries and list it in the README as content needed before launch. Do not invent fake customer names and ship them.

Below the carousel: a quiet trust row — *"Handmade in Coimbatore · 500+ pieces delivered · Lifetime craftsmanship guarantee"*. Keep it small and grey, not badges.

### 6.8 Instagram wall

Grid of `@saba_art` posts with a documented integration point.

### 6.9 Footer

Logo, contact, policy links, WhatsApp button, newsletter field. Resin-swirl wash at 5%.

---

## 7. Product detail page

Gallery with large main image and thumbnail rail; lightbox with pinch-zoom on mobile and arrow keys on desktop. Name, price or range, description, lead-time badge, "Made to order" chip.

Size pills reprice in place with a number roll. Quantity stepper with the bulk nudge. **"Customise this piece"** expands the configurator *inline* — not a separate page. Sticky add-to-cart bar below 768px.

Accordion: Materials · Care · Delivery and lead time · Returns, from the real policy text. "Pairs well with" row of three. Breadcrumbs. JSON-LD `Product` with `offers` and `priceCurrency: INR`.

---

## 8. Custom configurator

Two panes on desktop (preview left, controls right, independently scrollable). On mobile, preview pinned to the top 45% of the viewport, controls in a scrollable sheet below.

**The preview must be live and real** — a layered SVG/Canvas composition, not an image swap:
- base silhouette **morphing** between round / square / hexagon / geode-edge over 400ms
- resin fill with a procedural swirl that changes **pattern**, not just hue, per theme
- embedded elements (flowers, gold flecks, shells, sand) as positioned SVG groups with **slight random jitter per render**, so it reads handmade
- engraved text live in the chosen font, size and position
- a specular highlight tracking the pointer across the surface

Controls, driven generically by the product's `customOptions`: colour swatches (real resin-like gradients, not flat chips) · shape · flower type + density slider · gold foil toggle + intensity · name engraving with font and position · theme presets.

**Sticky live price panel**, every number counting over 250ms:

```
Base (12 inch Resin Wall Clock)        ₹2,800
Dried flowers                            ₹200
Gold foil                                ₹150
Name engraving                           ₹100
Delivery (rest of Tamil Nadu)             ₹60
─────────────────────────────────────────────
Total                                  ₹3,310
Dispatch by                        Mon, 1 Dec
```

Plus: undo/redo (Cmd+Z, 20 steps) · shareable URL state · "Send to WhatsApp" · save as draft to localStorage · full keyboard access with swatches as a radio group.

---

## 9. Cart ⭐

**Slide-over drawer from the right is primary;** `/cart` is the full-page fallback. Opens on add-to-cart with a 2.5s toast unless already open.

- Entrance: 380ms, `cubic-bezier(0.22, 1, 0.36, 1)`, with a backdrop fading to 40% black. Glass surface.
- Line items: thumbnail (for custom pieces, the configurator preview rendered to an image), name, size, customisation chips, unit price, quantity stepper, line total, remove.
- **Optimistic quantity updates** — never a spinner on `+`.
- Removal offers **inline undo for 6 seconds** before committing.
- Live summary: subtotal → bulk discount → delivery → total, plus the dispatch-by date. Every figure counts when it changes.
- **Pincode field inside the drawer** resolving zone, charge and ETA *before* the user commits to checkout. This is the single biggest drop-off saver — surprise delivery charges at checkout kill orders.
- Bulk discount appearing at qty 10 triggers the gold-fleck flourish.
- Empty state: line illustration, one sentence in voice, three product suggestions.
- Persists to localStorage across sessions. On return, revalidate every line against the live catalogue and flag changed prices or inactive products.

---

## 10. Delivery ⭐

Delivery must be **visible early and everywhere** — never a surprise at checkout.

- **Product page:** a delivery estimator. Enter a pincode, see zone, charge and dispatch-by date inline, without leaving the page. Remember it in localStorage for next time.
- **Cart drawer:** the same field, prefilled from that memory.
- **Checkout:** pincode drives zone, charge and ETA live as they type.
- **A `/delivery` section** inside `/policies` with the full zone table, courier name, and what happens if a piece arrives damaged.
- **Free-delivery nudge:** Coimbatore city is free — say so on the product page for visitors who've entered a Coimbatore pincode.
- International: blocked at the form with *"We only ship within India right now. Message us on WhatsApp and we'll see what we can do."* plus a link.

Zones, charges and transit times exactly as §4.

---

## 11. Checkout — Razorpay

Single page, three collapsible sections, progress indicator. No multi-page wizard. Guest checkout by default; optional "save my details" writes to localStorage only.

1. **Contact** — name, phone (10-digit Indian, validated), email. Note under the phone: "We'll send order updates on WhatsApp."
2. **Delivery** — address lines, city, state select, 6-digit pincode driving zone/charge/ETA live.
3. **Review and pay** — line items with customisations expanded, ETA, totals, and a **required** checkbox: *"I understand custom orders can be cancelled within 12 hours, and that once resin pouring starts the amount paid is non-refundable."*

### Payment flow — implement exactly

1. Client POSTs the cart to `POST /api/checkout/create-order`.
2. **The server recomputes the entire total from scratch** — live catalogue prices, bulk discount, surcharges, delivery by zone. It never trusts a client amount. A mismatch returns 409 with the corrected breakdown; the UI shows a clear diff before retrying.
3. Server creates the Razorpay order (`amount` in paise, `currency: "INR"`, `receipt` = order number) and returns `{ razorpayOrderId, amount, keyId, orderNo }`.
4. Client opens Razorpay Checkout with prefill, theme colour `#E8912B`, and the Saba Art logo.
5. Client POSTs `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `POST /api/checkout/verify`.
6. **Server verifies the HMAC-SHA256 signature** before marking anything paid. An unverified payment is never trusted.
7. On verified success: persist the order, send confirmation email and WhatsApp message, clear the cart, redirect to `/checkout/success`.
8. **Also implement `POST /api/webhooks/razorpay`** with its own signature verification as the authoritative source — the browser can close mid-redirect. Make order creation **idempotent on `razorpay_order_id`**.
9. Handle every failure explicitly: modal dismissed, payment failed, network error after payment, signature mismatch. Each gets its own message and recovery action. **Never leave the user staring at a spinner wondering whether they were charged.**

### Success page

Order number, dispatch-by date, full summary, "Track your order", WhatsApp button, care instructions. One-shot confetti in amber and gold-leaf, suppressed under `prefers-reduced-motion`.

---

## 12. Orders ⭐

### `/orders` — order history

Guest-friendly: look up by **order number + phone**, no account required. If "save my details" was used, show recent orders straight away from localStorage.

Each row: order number, date, thumbnail stack of the pieces, total, and a **status chip**. Click through to detail.

### `/orders/[orderNo]` — order detail

The premium touch is making the wait feel cared for, not anxious.

- **Vertical status timeline** using these seven statuses with their colours:

| Status | Colour |
|---|---|
| Pending | amber |
| Confirmed | blue |
| In production | violet |
| Ready | teal |
| Dispatched | blue |
| Delivered | green |
| Cancelled | muted |

- Completed steps fill amber with a 300ms sweep as the page loads, staggered 80ms. The current step pulses softly — 2.4s, very subtle.
- **Expected dispatch date** prominent at the top, with a plain-English line: *"We're pouring your piece now. It should leave the studio by Monday, 1 December."*
- Full item list with customisation details expanded, and the configurator preview image for custom pieces.
- Courier and tracking ID when present, with a deep link to Shiprocket tracking.
- Payment summary: paid, and balance if any.
- Care instructions, shown once the status reaches Delivered.
- **"Message us about this order"** — a WhatsApp link pre-filled with the order number.
- Rate-limit the lookup endpoint: **10 attempts per phone number per hour.**

---

## 13. Content pages

- `/about` — the artist and the studio. One long-form column, 680px, generous leading, two inline photographs. No stock imagery.
- `/process` — how a piece is made, scroll-linked, one photograph per step.
- `/gallery` — past work, filterable by collection, lightbox with keyboard navigation.
- `/testimonials` — the full set, masonry layout, filterable by product.
- `/faq` — accordion, seeded from the real policy text.
- `/policies` — returns, cancellation, care, warranty, delivery, privacy, terms.
- `/contact` — form plus WhatsApp and Instagram.

---

## 13A. Additional features

These are not optional extras bolted on — several of them are where this business actually makes money. Build them in the priority order marked.

### 🔴 P1 — build these with the core

#### A. Production progress gallery — *the signature feature*

A made-to-order piece means the customer waits 5–18 days in silence. That silence is where anxiety and refund requests come from. Turn the wait into the best part.

On `/orders/[orderNo]`, below the status timeline, a **production journal**: timestamped photographs posted by the studio as the piece is made — *"Resin poured"*, *"Curing, day 2"*, *"Flowers set"*, *"Polished and packed"*.

- Each entry: photo (4:5), a one-line caption in the brand voice, relative timestamp.
- Vertical, newest first, each entry revealing on scroll with a 32px rise.
- Empty state before the first photo: *"We'll post photos here as your piece comes together."*
- Notify by WhatsApp when a new entry is posted, with a deep link to the order.
- This is also the single most shareable thing on the site — give each entry a "share" affordance.

#### B. Gift options at checkout

Resin art is overwhelmingly bought as a gift. Treat that as a first-class path, not an afterthought.

A **Gift options** block in checkout, collapsed by default:
- **Gift wrapping** — toggle, `[TO CONFIRM — price]`, with a photograph of the actual wrap, not an icon
- **Handwritten gift note** — textarea, 200 characters, live character count, shown in a handwriting-style preview so they can see what the card will look like
- **Hide the price** — a gift receipt with no amounts, stated plainly: *"We won't include any price in the parcel."*
- **Ship directly to the recipient** — a separate delivery address from the billing contact, with a *"This is a gift, send it straight to them"* checkbox that reveals it

All gift selections carry into the order payload and appear on the order detail page.

#### C. Wishlist

A heart on every product card and product page. `localStorage` for guests, no account needed.

- Animates on add — a 300ms spring fill, not a jump
- `/wishlist` page with a grid, "Move all to cart", and per-item "Add to cart"
- Header icon with a count badge
- Cross-device sharing: a "Share my wishlist" link that serialises the list into the URL — for sending to a husband before an anniversary. **This matters more than you'd think for gifting.**

#### D. Search

Header search opening a **command-palette style overlay** (`⌘K` / `Ctrl+K`), not a page navigation.

- Instant results as they type, debounced 150ms
- Grouped: Products · Collections · Pages
- Each product result shows thumbnail, name, price range
- Recent searches and three "popular" suggestions when the field is empty
- Full keyboard navigation, Escape to close, results announced to screen readers
- Falls through to `/search` for the full result set

#### E. Recently viewed

A quiet strip at the bottom of product pages and the cart drawer — the last 6 products viewed, from `localStorage`. Small cards, no heading shouting about it. Hidden when there are fewer than 3.

#### F. Abandoned cart recovery (WhatsApp)

If an email or phone number was captured and the cart sits untouched for 2 hours, send **one** WhatsApp message with the cart contents and a link that restores it.

- **One message only.** Never a sequence. A second message makes a premium brand feel desperate.
- A one-click unsubscribe, honoured permanently.
- Skip entirely if the customer completed any order in the last 24 hours.

---

### 🟠 P2 — build right after the core works

#### G. Bulk & wedding return gifts — `/bulk`

Wedding return gifts are a real revenue line for this business — alphabet keychains, bookmarks, small coasters ordered 50–200 at a time. The standard cart cannot serve that.

A dedicated enquiry flow:
- Choose a product, quantity (10 / 25 / 50 / 100 / 200+), colour theme, personalisation (names, dates, initials), and a needed-by date
- **Live estimate** using the 10% bulk rule, clearly labelled *"Estimated — we'll confirm by WhatsApp"*
- A needed-by date that is too soon for the lead time shows a warning, not a silent failure
- Submits to the studio and opens a WhatsApp thread with a summary
- Page content: photographs of past bulk orders, minimum quantities, how personalisation works, realistic timelines

#### H. Bouquet preservation booking — `/preservation`

The highest-value, most emotional product, and the most time-critical: flowers must reach the studio within a few days of the wedding or they cannot be preserved.

- **A clear "how this works" sequence**: book → send or drop off flowers within `[TO CONFIRM] days` → dehydration → casting → delivery
- A **date-aware booking form**: wedding date, city, piece type (frame / block / resin art), size
- If the wedding date has already passed by more than the safe window, say so honestly and offer the alternative rather than taking a booking that cannot be fulfilled
- Packing instructions for posting flowers, with photographs
- A prominent lead-time statement — this is an 18-day process, set the expectation up front
- Gallery of past preservation work. **This page sells on emotion; give photography the most room on the entire site.**

#### I. Product reviews with photos

Below the fold on product pages.

- Star average, distribution bars, count
- Each review: rating, name, city, date, verified-purchase badge, body, and **customer photographs** — a resin piece in someone's actual home is the most persuasive asset you have
- Filter by rating and "with photos only"
- Review submission opens from the order detail page after Delivered, never unsolicited
- Photo upload with client-side resize before upload
- **No review content exists yet.** Build it, seed nothing, mark it in the README.

#### J. Occasion shop — `/occasions/[slug]`

Diwali · Weddings · Housewarming · Ramadan · Anniversaries.

Each a curated landing page: hero photograph, a short line of copy, 6–8 relevant pieces, and a reminder of the lead time relative to that occasion — *"Order by 2 November for Diwali delivery."* Drive the date from config so it is updated once a year, not hardcoded in a component.

Surface the active occasion in the header as a single quiet link when within its window.

#### K. Gift cards

- Denominations ₹500 / ₹1,000 / ₹2,500 / ₹5,000 and a custom amount
- Delivered by email and WhatsApp on a chosen date, with a personal message
- A designed card — the resin swirl, the wordmark, the code in tabular figures — not a plain code in an email
- Redemption at checkout, partial redemption supported, balance retained
- Server-side balance validation. **Never trust a client-supplied balance.**

---

### 🟡 P3 — valuable, can follow

#### L. "See it in your space"

For wall clocks and nameplates, an upload-a-photo-of-your-wall preview: the piece composited at an adjustable size and position. Entirely client-side with canvas — no upload to a server, and say so on screen, because people are uploading photographs of their homes.

A true AR view (`model-viewer` / WebXR) is a later upgrade and needs 3D assets that do not exist yet.

#### M. Certificate of authenticity

Every delivered piece gets a page at `/authenticity/[code]`: piece name, materials, the date it was poured, the artist's name, and a photograph from the production journal. A small printed card in the parcel carries the code.

Costs almost nothing to build and does more for perceived value than any amount of styling.

#### N. Care reminders

Opt-in at delivery. One email at 1 month and one at 6 months with care guidance and a quiet link to the shop. **Two emails total, ever.** This is a service, not a campaign.

#### O. Studio visit booking — `/studio-visit`

Coimbatore customers can book a slot to see pieces in person or collect an order. Simple date and time-slot picker against configured studio hours, confirmation by WhatsApp. Also serves local pickup for free-delivery-zone orders.

#### P. Referral

After a delivered order, a shareable link giving the friend ₹200 off their first order and the referrer ₹200 off their next. Tracked server-side, one reward per new customer, fraud-guarded against self-referral by phone number.

#### Q. Offline-capable PWA

Installable, with the catalogue and the cart available offline, and a clear offline banner. Resin art gets browsed on phones with patchy connections.

---

### Feature flags

Every feature in this section ships behind a flag in `lib/features.ts`, defaulting to **off** except P1. The studio should be able to launch with the core and switch these on as content and operations are ready. A half-built feature must never be reachable in production.

---

## 14. Quality bar

**Accessibility** — WCAG 2.1 AA in both themes. Every interactive element keyboard-reachable with a visible amber focus ring. Both carousels: `aria-roledescription="carousel"`, labelled slides, arrow-key navigation, autoplay pausing on focus, live region announcing position. Cart drawer and lightbox focus-trapped, Escape to close. Live regions announce cart and price changes. Real alt text describing each piece.

**Performance** — Lighthouse ≥ 95 across the board on home and product pages. **LCP under 2.0s on simulated 4G** — the hero carousel is the main risk; the first slide must be `priority` and must not wait on JS. Zero layout shift. Lazy-load the configurator's render logic with `next/dynamic`.

**Responsive** — deliberate at 375px, 768px, 1024px, 1440px, 1920px. The configurator must be genuinely usable on a phone, not a squeezed desktop layout.

**SEO** — per-page metadata, `next/og` Open Graph images, JSON-LD for `Product`, `Organization` / `LocalBusiness` (Coimbatore) and `BreadcrumbList`, sitemap, robots.txt.

**Code** — strict TypeScript, no `any`, no non-null assertions. Zod at every API boundary, shared client and server. **All pricing in one pure `lib/pricing.ts`** with unit tests covering: bulk discount at exactly 10 units, each delivery zone, lead time with and without customisation, Sunday skipping. All copy in `lib/copy.ts`. No secrets in client components. `.env.example` documents every variable. A real README: setup, env vars, Razorpay test-mode walkthrough, deployment.

---

## 15. Build order

Deliver working code at each step. **Do not scaffold all nine and leave them stubbed.**

0. `git checkout -b feat/website`, create `website/`, scaffold Next.js there. Confirm `npm run dev` inside `website/` works and that `backend/` and `dashboard/` are untouched (`git status` shows changes only under `website/`).
1. Tokens, theme toggle, layout shell, header, footer, the four resin-motif components, `lib/features.ts`.
2. CMS schema and data layer; shop and product pages.
3. Cart store, drawer, pricing module with tests.
4. Hero carousel and testimonials carousel.
5. Configurator — preview renderer first, then controls, then the price panel.
6. Delivery estimator (product page, cart, checkout).
7. Checkout form and server-side total recomputation.
8. Razorpay integration, signature verification, webhook, every failure path.
9. Orders history and detail with the status timeline.
10. **P1 features** — production progress gallery, gift options, wishlist, search, recently viewed, abandoned-cart WhatsApp.
11. Content pages, motion choreography, accessibility pass, Lighthouse pass.
12. Playwright test for the full checkout happy path in Razorpay test mode.
13. **P2 features** behind flags — bulk, preservation, reviews, occasions, gift cards.

P3 is a later milestone. Do not start it in this build.

---

## 16. Confirm before starting — do not invent these

Leave an unmissable `[TO CONFIRM]` marker and list each in the README:

1. WhatsApp number, email, studio address
2. GST number, or confirmation there is none (decides whether checkout shows tax)
3. Razorpay key ID and secret — test mode to start
4. **Product photography — there is none.** Launch blocker.
5. **Testimonial content — there is none.** Do not fabricate customer names.
6. **Review content — there is none.** Seed nothing.
7. Surcharge amounts per customisation option
8. Business hours, and studio-visit slots if `/studio-visit` is enabled
9. Gift wrapping price
10. Bouquet preservation: how many days after the wedding flowers can still be accepted
11. Bulk order minimums and whether the 10% rule still applies at 100+
12. Gift card denominations and expiry policy, if any
13. Referral reward amounts, if that feature is enabled
