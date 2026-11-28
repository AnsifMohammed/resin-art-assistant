# Build Brief — Phase 2: Finish the Saba Art Storefront

> **For Antigravity.** Continue the build in `website/` on branch `feat/website`. `WEBSITE_BRIEF.md` is still the governing document for design, tokens, voice, pricing rules and policies — **this file does not replace it.** Read both. Where this file is silent, Phase 1's brief applies.

---

## 0. Guardrails — unchanged, still binding

1. **Only touch files inside `website/`.** `backend/`, `dashboard/` and `docs/` are live production code for a different application. Do not edit, refactor or reformat them.
2. **Do not import from `backend/` or `dashboard/`.**
3. Dependencies go in `website/package.json` only.
4. Stay on `feat/website`. Never commit to `main`.
5. Run `git status` before starting. Anything changed outside `website/` is someone else's work — leave it alone.

---

## 1. Where the build actually stands

I verified this, so build on it rather than re-deriving it. **Do not rebuild what already works.**

### Verified working

- `npx tsc --noEmit` — clean
- `npx vitest run` — **9/9 pricing tests pass**
- `npx next build --turbopack` — succeeds; all 6 products statically generated

### Built and in place

| Area | Files |
|---|---|
| Home sections (all 9) | `components/home/` — `HeroCarousel`, `TestimonialsCarousel`, `CollectionQuartet`, `FeaturedPieces`, `ConfiguratorTeaser`, `ProcessStrip`, `MaterialsShowcase`, `InstagramWall` |
| Resin textures (all 4) | `components/textures/` — `ResinSwirl`, `GoldLeafFlecks`, `PourEdge`, `GlassRefraction` |
| Cart | `components/cart/CartDrawer.tsx`, `lib/cartStore.ts`, `/cart` page |
| Configurator | `components/configurator/CustomBuilder.tsx`, `/custom` page |
| Product | `components/product/ProductCard.tsx`, `ProductDetailView.tsx`, `/product/[slug]`, `/shop`, `/shop/[collection]` |
| Wishlist | `lib/wishlistStore.ts`, `/wishlist` page |
| Search | `components/search/SearchPalette.tsx` |
| Pricing | `lib/pricing.ts` — `resolveDeliveryZone`, `calculateDispatchDate`, `formatDispatchDate`, `calculateCartPricing`, `formatINR` |
| Orders data layer | `lib/ordersStore.ts` — `StoredOrder`, `OrderStatus`, `ProductionJournalEntry`, `saveOrder`, `getOrderByNumber`, `findOrdersByPhone`, `generateOrderNumber` |
| Checkout form | `components/checkout/CheckoutForm.tsx` — full Razorpay flow, already written |
| API | `app/api/checkout/create-order`, `app/api/checkout/verify`, `app/api/webhooks/razorpay` |

### Existing routes

```
/  /cart  /custom  /product/[slug]  /shop  /shop/[collection]  /wishlist
```

**The cart is a dead end.** `CheckoutForm` exists and is fully implemented, but no page renders it. Nothing after "add to cart" works.

---

## 1A. Brand assets now exist — use them, do not build empty placeholders

`website/public/brand/` has been populated. Wire these in instead of rendering blank boxes.

### Logo — these are the real brand mark, use them as-is

| File | Use |
|---|---|
| `brand/saba-logo.svg` | Header, footer. Vector, has a `viewBox` and no fixed size. |
| `brand/saba-wordmark.svg` | Mark + "Saba Art" + "HANDCRAFTED RESIN ART". Text uses `currentColor`, so it adapts to both themes. |
| `brand/saba-logo.png` | Raster fallback. Byte-identical to the studio's real logo. |
| `brand/saba-icon-192.png`, `brand/saba-icon-512.png` | PWA icons / manifest. |
| `apple-touch-icon.png` | Already at the public root. |

**Do not recolour the mark.** Its cyan `#38C7D8` and charcoal `#606060` are brand colours and deliberately sit outside the site palette. Keep it an island — no cyan anywhere else in the UI.

### Hero carousel — one file per slide

| Slide | File | Notes |
|---|---|---|
| 1 | `brand/hero-ocean.svg` | Strongest of the four. Dark upper-left — put the headline there in light text. |
| 2 | `brand/hero-geode.svg` | Darkest. Light text. |
| 3 | `brand/hero-floral.svg` | **Brightest by a wide margin — this slide needs DARK headline text**, not white. Handle per-slide text colour, do not assume one treatment for all four. |
| 4 | `brand/hero-custom.svg` | Amber pour ribbon. Light text. |

All 1920×1080. Slide 1 must still be the LCP element.

### Collections and products

- Collection cards: `brand/collection-home.svg`, `collection-everyday.svg`, `collection-keepsakes.svg`, `collection-gifting.svg` (1080×1350). Centres are deliberately uncluttered so a label sits cleanly on top.
- Product fallbacks, one per catalogue slug, 4:5: `brand/product-ocean-coaster-set-4.svg`, `product-resin-clock-12in.svg`, `product-resin-tray-large.svg`, `product-keychain-set-3.svg`, `product-photo-frame-5x7.svg`, `product-bookmarks-set-4.svg`.

Wire the product fallback so a product with an empty `images` array renders its themed artwork rather than a grey box.

### Social preview

Use **`brand/og-image.png`** (1200×630) for `og:image` and `twitter:image`. **Not the SVG** — no social scraper renders SVG, the card would come back blank. The `.svg` is kept only as the source for re-rendering.

### Real photography that exists

Seven genuine studio photographs are already in the business's Cloudinary account, listed in `brand/README.md`. They are **resin tables**, which are not in the six-product seed catalogue — so use them in `/gallery` and, if you like, as a hero slide. Do not attach them to unrelated products.

### What these artworks are

Hand-written SVG using `feTurbulence` + `feDisplacementMap` marbling. They are **generated abstract artwork, not photographs** — good as atmospheric grounds behind text, no substitute for showing a customer what a coaster actually looks like. Keep the photography launch-blocker note in the README.

All 17 SVGs parse, and every element id is prefixed per file, so several can be inlined on one page without id collisions.

---

## 2. 🔴 P0 — Fix this before building anything else

### 2.1 The payment verification can be bypassed

`app/api/checkout/verify/route.ts` line ~18:

```ts
if (secret && razorpay_signature) {
  // ... HMAC check ...
}
```

**If `RAZORPAY_KEY_SECRET` is unset or empty, the entire signature check is skipped and the order is marked paid.** A missing environment variable in production silently turns every payment into a free order. Anyone who finds the endpoint can POST to it and create paid orders.

It is made directly reachable by `components/checkout/CheckoutForm.tsx` line ~213, which, when the Razorpay SDK is absent, posts a hand-made payload:

```ts
razorpay_payment_id: `pay_test_${Date.now()}`,
razorpay_signature: "mock_signature_test",
```

**Required fix:**

1. **Verification is mandatory, always.** If `RAZORPAY_KEY_SECRET` is missing, the route must return **500** and log an error — never fall through to success. A missing secret is a deployment fault, not a reason to trust the client.
2. **A missing or malformed `razorpay_signature` is a 400.** Not an acceptable input.
3. **Remove the mock-signature branch from `CheckoutForm`.** If the Razorpay SDK fails to load, show the customer an error and keep the cart — do not fabricate a payment.
4. If you want a local path that works without Razorpay credentials, gate it on an explicit `NEXT_PUBLIC_PAYMENTS_DEMO_MODE=true` **plus** `NODE_ENV !== "production"`, and have the server mark such orders with `paymentMode: "demo"` so they are never mistaken for real revenue. Default it off and document it in `.env.example`.
5. Add a unit test asserting that a request with a bad signature is rejected, and one asserting the route fails closed when the secret is absent.

### 2.2 Feature flags contradict the brief

`lib/features.ts` has every P2 flag set to `true` while the comment still reads *"Default false, toggleable"*. The pages those flags gate do not exist, so any link to them 404s.

Set all five P2 flags (`bulkOrders`, `bouquetPreservation`, `productReviews`, `occasions`, `giftCards`) to `false`. Turn each one on in the same commit that makes its page real. P3 stays `false` — that is already correct.

**Any nav item, card or CTA behind a disabled flag must not render.** A dead link is worse than a missing feature.

---

## 3. 🟠 P1 — Make a purchase possible

This is the whole point of the site. Build in this order and keep each step working.

### 3.1 `/checkout`

Render the existing `CheckoutForm`. Do not rewrite it — read it first and wire it up.

Per §11 of the Phase 1 brief: single page, three collapsible sections (Contact · Delivery · Review and pay), progress indicator, guest checkout by default.

- Redirect to `/cart` if the cart is empty.
- The required cancellation-policy checkbox must block submission until ticked.
- Gift options block (§13A-B) — wrapping, 200-char note with live count and handwriting preview, hide-the-price, ship-to-recipient address.
- Pincode drives zone, charge and ETA live via `resolveDeliveryZone`.
- Non-India is blocked at the form with the WhatsApp fallback line.

### 3.2 `/checkout/success`

Order number, dispatch-by date, full summary, "Track your order" link, WhatsApp button, care instructions. One-shot amber + gold-leaf confetti, suppressed under `prefers-reduced-motion`.

Reachable only with a real order reference — a direct visit with no order shows a graceful "nothing to show" state, not a crash.

### 3.3 `/orders` — lookup

Order number + phone, no account. If "save my details" was used, show recent orders from `localStorage` immediately via `findOrdersByPhone`.

Rows: order number, date, thumbnail stack, total, status chip.

Rate-limit the lookup: **10 attempts per phone number per hour**, enforced server-side.

### 3.4 `/orders/[orderNo]` — detail + production journal

The most valuable page on the site. `lib/ordersStore.ts` already defines `OrderStatus` and `ProductionJournalEntry` — use them.

- **Vertical status timeline**, seven statuses with the colours in §12: Pending amber · Confirmed blue · In production violet · Ready teal · Dispatched blue · Delivered green · Cancelled muted. Completed steps fill with a 300ms sweep staggered 80ms; the current step pulses at 2.4s.
- **Expected dispatch date** prominent, with the plain-English line: *"We're pouring your piece now. It should leave the studio by Monday, 1 December."*
- **Production journal** (§13A-A): timestamped photos newest-first, 4:5, one-line captions in the brand voice, each revealing on scroll with a 32px rise. Empty state: *"We'll post photos here as your piece comes together."*
- Item list with customisations expanded and the configurator preview for custom pieces.
- Courier + tracking ID with a Shiprocket deep link when present.
- Payment summary, and gift options if the order had any.
- Care instructions once status reaches Delivered.
- "Message us about this order" — WhatsApp link pre-filled with the order number.

---

## 4. 🟡 P2 — The pages that make the site trustworthy

A store with no policy pages does not look premium; it looks temporary.

- `/policies` — returns, cancellation, care, warranty, delivery, privacy, terms. Use the **exact wording** from §4 of the Phase 1 brief. Anchor links per section, because the product page and checkout both link into it.
- `/faq` — accordion seeded from that same policy text. No invented answers.
- `/about` — the artist and the studio. One 680px column, generous leading, two inline photograph slots. `[TO CONFIRM — copy]`.
- `/process` — how a piece is made, scroll-linked, one photo per step. Reuse `ProcessStrip`'s content as the spine.
- `/gallery` — past work, filterable by collection, lightbox with keyboard navigation.
- `/testimonials` — full set, masonry, filterable by product. Keep the placeholder markers; **do not invent customer names.**
- `/contact` — form plus WhatsApp and Instagram.
- `/search` — the full-results page `SearchPalette` falls through to.

---

## 5. Remaining P1 features from §13A

Three are still unbuilt:

- **Recently viewed** (§13A-E) — last 6 products from `localStorage`, quiet strip on product pages and in the cart drawer, hidden below 3 items.
- **Wishlist share link** (§13A-C) — serialise the list into a URL so it can be sent to someone else. The store exists; the share affordance does not.
- **Abandoned cart WhatsApp** (§13A-F) — **one** message after 2 hours, never a sequence, permanent one-click unsubscribe, skipped if any order completed in the last 24 hours.

---

## 6. Testing — currently incomplete

- **`@playwright/test` is not installed** and the Phase 1 brief required an end-to-end checkout test. Install it and write the happy path: add to cart → enter pincode → checkout → Razorpay **test mode** → success page shows the order number.
- **`package.json` has no `test` script.** Add `"test": "vitest run"` and `"test:e2e": "playwright test"`.
- Keep the 9 pricing tests green. Add cases for the verify-route failures in §2.1.

---

## 7. Definition of done

Every one of these must pass before you report finished. Paste the real output.

```bash
cd website
npx tsc --noEmit        # clean
npm test                # pricing + verify-route tests green
npx next build          # succeeds
npm run test:e2e        # checkout happy path passes
npx eslint .            # clean
```

Plus, by inspection:

- `/cart` → `/checkout` → payment → `/checkout/success` → `/orders/[orderNo]` works end to end in Razorpay test mode.
- **No route renders behind a disabled feature flag**, and no nav link points at a 404.
- `git status` shows changes **only** under `website/`.
- Lighthouse ≥ 95 on `/` and one product page. The hero carousel's first slide must be the LCP element — check this specifically; a carousel that delays LCP is the most likely way this target is missed.
- Every page works at 375px, 768px, 1024px and 1440px.
- `prefers-reduced-motion` disables the carousels' autoplay, the ken-burns, the swirl animation and the confetti.

---

## 8. Still unanswered — do not invent

Mark each `[TO CONFIRM]` in code and list them in `website/README.md`:

1. WhatsApp number, email, studio address
2. GST number, or confirmation there is none
3. Razorpay key ID and secret (test mode first)
4. **Product photography of the six catalogue pieces — none exists.** Launch blocker. Generated artwork in `brand/` stands in for now (§1A); seven real photographs exist but they are of resin tables, not catalogue items.
5. **Testimonial and review content — none exists.** Seed nothing, fabricate nothing.
6. Gift wrapping price
7. Surcharge amounts per customisation option
8. Business hours
9. `/about` and `/process` copy

---

## 9. Report back with

- Which routes you added, and the build output listing them.
- Exactly how you fixed the verification bypass, with the new code quoted.
- Confirmation that the mock-signature branch is gone from `CheckoutForm`.
- The final state of `lib/features.ts` and which flags you turned on alongside a real page.
- Real output for all five commands in §7.
- Anything you could not verify without live credentials, and what the user must test manually.
