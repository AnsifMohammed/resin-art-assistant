# Saba Art Storefront (Next.js 15 + Tailwind CSS v4)

A self-contained, premium e-commerce storefront for **Saba Art**, an independent handmade resin-art studio in Coimbatore, Tamil Nadu, India.

---

## 1. Quick Start

```bash
# Navigate to website directory
cd website

# Install dependencies (only in website/package.json)
npm install

# Run unit tests (Pricing logic + Payment Verification security)
npm test

# Build for production
npm run build

# Start production server
npm start

# Run end-to-end checkout test
npm run test:e2e
```

---

## 2. Environment Variables

Create `.env.local` based on `.env.example`:

```bash
# Razorpay Credentials (Test Mode)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Optional local demo mode without Razorpay credentials (default: false)
# Only active in non-production environments (NODE_ENV !== "production")
NEXT_PUBLIC_PAYMENTS_DEMO_MODE=false
```

---

## 3. Launch Blockers & Unanswered Items `[TO CONFIRM]`

The following business items are marked with `[TO CONFIRM]` in code and must be confirmed with the studio owner before launching to real customers:

1. **Product Photography (Launch Blocker)**:
   - There is currently **no authentic studio photography for the six catalogue pieces** (`ocean-coaster-set-4`, `resin-clock-12in`, `resin-tray-large`, `keychain-set-3`, `photo-frame-5x7`, `bookmarks-set-4`).
   - The SVG artworks in `/public/brand/` serve as temporary 4:5 placeholders.
   - Seven authentic photographs exist in Cloudinary, but they are of custom **resin tables**; they have been integrated into `/gallery` and studio background highlights.
2. **Customer Reviews & Testimonials**:
   - Zero fabricated reviews are seeded. Testimonials on the site are clearly marked demo drafts and will be replaced by authentic post-delivery feedback.
3. **Studio Coordinates & Phone**:
   - WhatsApp number: currently `+91 98765 43210` (`[TO CONFIRM]`).
   - Studio email: currently `hello@sabaart.in` (`[TO CONFIRM]`).
   - Workshop street address in Coimbatore (`[TO CONFIRM]`).
4. **GST Registration**:
   - Confirm whether the studio operates under GST threshold exemption or has an active GSTIN.
5. **Razorpay Production Credentials**:
   - Production Key ID and Secret required for live UPI/card payments.
6. **Gift Wrapping Price**:
   - Configured at ₹150 for organic seeded paper + dried lavender wax seal (`[TO CONFIRM]`).
7. **Customisation Surcharges**:
   - Custom engraving (+₹100), gold leaf edging (+₹150), preserved flowers (+₹200) (`[TO CONFIRM]`).
8. **Studio Operating Hours**:
   - Monday to Saturday: 10:00 AM – 7:00 PM IST; Closed Sundays for resin chemical curing cycles (`[TO CONFIRM]`).
9. **Artist Biography & Studio History**:
   - Story copy on `/about` and `/process` needs final review by Saba Art founder (`[TO CONFIRM]`).

---

## 4. Architecture & Data Flow

- **Design System**: Warm stone palette (`#FAF8F5`/`#0C0A14`), primary amber (`#E8912B`), accent teal (`#0E7C7B`), Fraunces serif + Inter typography. Single amber CTA in viewport.
- **Authoritative Pricing Engine (`lib/pricing.ts`)**: Pure TypeScript functions. Computes line item pricing, bulk discounts (10% at qty 10+, nudge at 8/9), Sunday-skipping dispatch date calculation (+2 extra days for custom work), and regional courier zones (Coimbatore free, Tamil Nadu ₹60, Rest of India ₹120, International blocked).
- **Payment Verification Security (`app/api/checkout/verify`)**: Server-side HMAC-SHA256 signature verification. Fails closed (500) if `RAZORPAY_KEY_SECRET` is missing, and returns 400 on missing or invalid signatures.
- **Production Progress Journal (`app/orders/[orderNo]`)**: Real-time 7-stage vertical status timeline with 2.4s pulse on active stage, expected dispatch date, and timestamped workshop photographs.
- **Guest Order Lookup (`app/orders`)**: Order lookup by Order Reference + 10-digit phone, rate-limited to 10 attempts per phone per hour.
