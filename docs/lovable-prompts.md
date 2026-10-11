# Saba Art — Lovable design prompts (light + dark)

How to use:
1. Paste **Part 0** into Lovable → Project Settings → Knowledge.
2. Send **Prompts 1–7** one at a time, in order. Check each result before sending the next.
3. If Lovable rejects Part 0 as too long, move the "Status labels & colours" and "Demo data" sections to the start of Prompt 1.

---

# PART 0 — Project Knowledge (paste once: Project Settings → Knowledge)

**Product.** Saba Art is a dashboard for an AI messaging assistant used by a small handmade resin-art business in Coimbatore, Tamil Nadu. Customers message on WhatsApp and Instagram. The AI replies on its own to routine questions (price, delivery, care, custom orders). It escalates sensitive ones (refunds, complaints, payment claims, unknown products) to a human. There are two roles: **Admin** (the owner, sees everything) and **Staff** (handles escalations only). The owner mostly uses it on her phone, so mobile must feel native.

**Scope.** This document defines the design: screens, visual style and interactions. It is applied to the existing Saba Art dashboard, which is **already connected to the real backend**.
- Keep the real login and keep every page's data coming from the existing hooks (`dashboard/src/hooks`, `dashboard/src/api`). Do NOT replace real data with sample data, and do NOT change the login or auth code.
- Do NOT add Supabase or any new backend, database or API.
- Only parts with no backend yet use static sample data, and they must show the "Sample data" badge: Orders, Customers, Broadcast, Templates, IG Comments, and the revenue/orders figures on Analytics.

**Design direction.** Calm, premium and information-dense, with the polish of Linear, Vercel and Stripe Dashboard plus a warm handmade touch from the brand: amber/gold like cured resin, ocean teal like the coasters. **Light theme is the default. Dark theme must be just as good**, and every screen must look finished in both. Avoid:
- a generic admin-template look
- gradients everywhere
- glassmorphism on every card
- emoji as UI icons (use lucide icons; emoji only inside message content)

**Stack** (front end only; see Scope). React + TypeScript + Vite, Tailwind, shadcn/ui, lucide-react, Recharts, framer-motion, sonner (toasts), cmdk (command palette), react-router.
- Theme: `class="dark"` on `<html>`. Every colour is a CSS variable mapped into Tailwind; no hex values in components.
- Theme options: Light / Dark / System. Default **Light**, saved in localStorage.

**Colour tokens**

| Token | Light | Dark |
|---|---|---|
| background | #FAFAF9 | #0B1120 |
| surface (cards) | #FFFFFF | #111827 |
| surface-muted (hover, table header, inputs) | #F5F5F4 | #1A2335 |
| border | #E7E5E4 | rgba(255,255,255,0.08) |
| text | #1C1917 | #F1F5F9 |
| text-muted | #706963 | #94A3B8 |
| primary (amber fills, main buttons) | #F59E0B | #F59E0B |
| primary-foreground (text on primary) | #1C1917 | #0B1120 |
| primary-text (amber links, active nav, highlights) | #B45309 | #FBBF24 |
| primary-soft (active nav bg, AI bubbles) | #FEF3C7 | rgba(245,158,11,0.12) |
| success | #047857 | #34D399 |
| warning | #92400E | #FBBF24 |
| danger | #B91C1C | #F87171 |
| info | #1D4ED8 | #60A5FA |
| teal (secondary accent) | #0F766E | #2DD4BF |
| ring (focus) | #F59E0B | #F59E0B |

- **Text vs fills:** the status tokens above are for text and are dark enough for AA contrast on white and on their own tints. For dots, icons, progress bars and chart fills, use the brighter 500 shades (emerald #10B981, amber #F59E0B, red #EF4444, blue #3B82F6, teal #14B8A6).
- **Status badges:** soft style, with text in the status colour on a 10–12% tint of the same colour. Never solid saturated blocks.
- **Channel colours:** WhatsApp #25D366; Instagram gradient #F58529 → #DD2A7B → #8134AF. Use them for icons and thin accents only.
- **Chart palette:** same order everywhere, in both themes: amber #F59E0B, teal #14B8A6, violet #8B5CF6, blue #3B82F6, rose #F43F5E.
- **Contrast:** all text must pass WCAG AA in both themes.

**Typography**
- **Fonts:** Outfit (600/700) for page titles, card headings and big numbers; Inter (400/500/600) for everything else. Load both from Google Fonts.
- **Scale:** 12 caption · 13 table/meta · 14 body · 16 emphasis · 20 section title · 24 page title · 32–36 KPI number.
- **Numbers:** `tabular-nums` on all numbers, prices and times. Indian formatting: ₹1,200 and ₹48,500. Use "₹1.2L" style only on chart axes.
- **Dates:** "2 Oct, 4:15 pm" in detail views; relative times ("3m ago") in lists.

**Surfaces & depth**
- **Radius:** 12px cards; 8px inputs and buttons; fully round pills, badges and avatars.
- **Light theme:** white cards with a 1px border and shadow `0 1px 2px rgb(0 0 0/0.04), 0 4px 16px rgb(0 0 0/0.04)`.
- **Dark theme:** cards stand out through the border plus `inset 0 1px 0 rgb(255 255 255/0.04)`. No heavy shadows.
- **Glass** (backdrop-blur 12px over a translucent background) ONLY on the sticky top bar, mobile bottom nav, command palette and popovers.
- **Spacing:** 4px grid. Page padding 24px (desktop) / 16px (mobile); card padding 20px; table rows 44px.

**Motion** (framer-motion, 150–220ms ease-out; respect `prefers-reduced-motion`)
- **Clickable cards:** lift 2px on hover with a slightly bigger shadow; scale to 0.98 when pressed.
- **Page enter:** fade + 8px rise; children stagger by 30ms.
- **Data:** KPI numbers count up on first load; charts animate in once.
- **Sidebar collapse:** spring width; labels fade.
- **Count badges:** a soft pulse ring only when the count goes up.
- **Theme switch:** colours cross-fade over 200ms; the sun/moon icon rotates.
- **Login error:** 300ms horizontal shake.
- **Loading:** shimmer skeletons, never blank screens.

**Layout shell**
- **Desktop (≥1024px):** fixed sidebar 240px, collapsible to a 64px icon rail with tooltip labels; the choice is remembered. Sticky top bar 56px.
- **Tablet (768–1023px):** sidebar collapsed by default.
- **Mobile (<768px):** no sidebar.
  - Glass bottom tab bar with 4 main items plus "More", which opens a bottom sheet with the rest.
  - Split views stack into list → detail with a back button.
  - Dialogs become bottom sheets.
  - Tap targets at least 44px.
- **Top bar:**
  - Left: page title with breadcrumb.
  - Centre: channel filter, a segmented control "All · WhatsApp · Instagram" that filters the current page.
  - Right:
    - search button (⌘K)
    - connection dot: "Live" green, or "Connecting" with an amber pulse
    - AI pill, admin only: "AI on" green or "AI paused" red; click to toggle, with a confirm step
    - notifications bell with a popover
    - theme toggle
    - avatar menu: name, role badge (from the signed-in account), theme Light/Dark/System, log out (returns to `/login`)

**Navigation**
- **Admin sidebar** (grouped):
  - **Overview:** Analytics `/analytics` (admin home), Inbox `/inbox`, Escalations `/escalations` (badge: open count)
  - **Commerce:** Orders `/orders` (badge: pending count), Customers `/customers`, Catalogue `/catalogue`
  - **Engage:** Broadcast `/broadcast`, Templates `/templates`, IG Comments `/ig-comments`
  - **Manage:** Knowledge Base `/knowledge-base`, Audit Log `/audit-log`, Users `/users`, Settings `/settings`
  - **Footer:** avatar, name, role badge, log out.
  - **Active item:** primary-soft background, primary-text label and a 2px left indicator.
- **Staff sidebar:** Escalations only; staff home is `/escalations`. The Staff view shows only the staff navigation and screens; admin pages are not reachable from it, and switching to Staff while on an admin page goes to `/escalations`.
- **Mobile tabs:** Admin gets Analytics, Inbox, Escalations, Orders, More. Staff gets Escalations and Profile.

**Shared components** (build once, reuse everywhere): StatCard, StatusBadge, ChannelIcon, SegmentBadge, Avatar, DataTable, FilterChips, SegmentedControl, EmptyState, Skeleton variants, ConfirmDialog, SlideOver, ChatBubble, MessageComposer, TemplatePicker, PhonePreview, toasts.
- **Avatar:** initials, with a stable colour derived from the name.
- **DataTable:** sorting, filters, sticky header, row hover, built-in empty state.
- **EmptyState:** icon, title, hint and action button.
- **SlideOver:** right-side sheet, 480px wide.
- **PhonePreview:** WhatsApp or Instagram message bubble inside a phone frame; follows the current theme.
- **Toasts:** bottom-right on desktop, top on mobile; success / warning / error; disappear after 4s.

**Status labels & colours** (use these labels and treatments consistently on every screen; all are soft badges as described above)
- **Conversation state:**
  - "AI active" (success)
  - "Escalated" (danger)
  - "Human handling" (warning)
  - "Paused" (muted)
- **Conversation tags** (neutral label badges): New lead, Custom order, Payment pending, Order confirmed, Follow-up.
- **Message bubbles by sender:**
  - Customer: left, surface-muted
  - AI: right, primary-soft with a small "AI" chip
  - Admin: right, success tint, labelled "Admin"
  - Staff: right, violet tint, labelled "Staff"
  - System: centred muted caption
- **Escalation reasons:** "Complaint", "Refund request" and "Payment claim" (danger); "Unknown product", "Missing information", "Flagged phrase" and "Outside AI scope" (warning); "AI couldn't process" and "Manual" (muted).
- **Order status:** Pending (warning) · Confirmed (info) · In production (violet) · Ready (teal) · Dispatched (info) · Delivered (success) · Cancelled (muted).
- **Roles:** "Admin" badge in a success tint, "Staff" badge in a violet tint.
- **24-hour window:** every conversation shows a countdown of the time left to reply (e.g. "18h 20m left"). It turns red when under 2h.

**Sample data.**
- Real data comes from the backend. Show the loading skeleton while it loads and an error state if it fails.
- Static sample data (see Demo data below) is used only for the no-backend parts listed in Scope, always with the "Sample data" badge.

**Demo data**
- **Business:** Saba Art, Coimbatore.
- **Products:**
  - Ocean Coaster Set of 4: ₹1,200, 5 days
  - 12 inch Resin Wall Clock: ₹2,800, 7 days
  - Large Resin Serving Tray: ₹1,800, 6 days
  - Resin Keychain Set of 3: ₹450, 3 days
  - Resin Photo Frame 5x7: ₹950, 5 days
  - Resin Bookmark Set of 4: ₹380, 3 days
- **Customers:** Kavya Ramesh, Arun Kumar, Divya Subramanian, Karthik Raja, Priya Senthil, Meena Krishnan, and about 15 more Tamil Nadu names.
- **Courier:** Shiprocket (DTDC / Delhivery).
- **Delivery:**
  - Coimbatore city: 1–2 days, free
  - Rest of Tamil Nadu: 3–5 days, ₹60
  - Rest of India: 7–10 days, ₹120
  - No international shipping

**Quality bar.**
- Every page has a real loading skeleton, an empty state, hover and focus states, and visible keyboard focus rings.
- Every page works at 375px wide and looks right in both themes.
- No lorem ipsum anywhere.

---

# PROMPT 1 — Foundation, shell and login

**Reminder:** follow the Scope in the Project Knowledge. Keep the real login and the existing data hooks; no Supabase or new backend; sample data only where there's no backend yet.

Read the Project Knowledge first and follow it exactly. Build the foundation of Saba Art:

1. **Theme system:** the light and dark CSS variables from the token table, the Tailwind mapping, and a ThemeProvider (default Light; Light/Dark/System; saved). Put the theme toggle in the top bar and the avatar menu.
2. **Base styles:** Inter + Outfit, focus rings, amber text-selection colour.
3. **App shell:** grouped, collapsible sidebar with badges; sticky glass top bar with every element listed in the Knowledge; mobile bottom tab bar with a "More" sheet; page-transition wrapper.
4. **Command palette** (⌘K / Ctrl+K and the search button):
   - Jump to any page.
   - Search customers and orders.
   - Actions: "Pause AI", "New template", "Toggle theme".
5. **Login page `/login`:**
   - **Layout:** a centred card on a soft background. Light: warm off-white with a faint amber radial glow and a subtle resin-swirl SVG pattern. Dark: deep navy with the same glow.
   - **Logo:** an amber resin-drop mark and the "Saba Art" wordmark in Outfit.
   - **Form:** email and password with floating labels, a show/hide password toggle, and a full-width amber "Sign in" button with a loading spinner. Sign-in uses the real login.
   - **Demo login (development only):** two small chips under the form, "Demo admin" and "Demo staff", that only fill in the demo accounts. You still press Sign in.
   - **Errors:** shake the card and show an inline message: wrong email or password, account deactivated, too many attempts, or can't reach the server.
6. **Admin and Staff views:**
   - The role comes only from the signed-in account. There is no role switcher.
   - Admin lands on `/analytics`; Staff lands on `/escalations` and sees only the staff sidebar, mobile tabs and screens (Escalations and the chat view).
   - "Log out" returns to `/login`.
7. **Shared components and sample data:**
   - Every shared component from the Knowledge.
   - Sample content only for the no-backend parts listed in Scope.
8. **Routes:** every route in the navigation exists. Pages not built yet show a tidy placeholder with the page title and an EmptyState.

Finish on the login page, and make sure it looks polished in both themes.

---

# PROMPT 2 — Analytics (admin home)

Build `/analytics`, the first screen the client sees. It should be impressive but calm.

- **Header:** "Good morning, Asha" with today's date. On the right:
  - date range SegmentedControl: 7 days · 30 days · Custom (opens a date-range popover)
  - "Export" ghost button
- **KPI grid:**
  - **Layout:** 3×2 on desktop, 2 columns on tablet, horizontal snap-scroll on mobile.
  - **Cards:**
    - Total revenue ₹48,500 (amber)
    - Orders confirmed 23 (emerald)
    - Messages today 142 (blue)
    - Auto-reply rate 78% (violet, with a small radial progress ring)
    - Open escalations 4 (red, with a pulsing dot)
    - Avg response time 1m 24s (teal)
  - **Each card shows:** a label, a count-up number, a trend chip (↑12% vs previous period, green or red) and a small sparkline.
  - **Clicking a card** opens the matching filtered page: escalations → `/escalations`, orders → `/orders?status=confirmed`, messages → `/inbox`.
- **Charts row** (Recharts, coloured through the CSS variables, custom tooltip card, no chart clutter):
  - **Daily revenue:** bar chart for the last 14 days. Amber bars with rounded tops; hovering a bar highlights it and shows ₹ and order count.
  - **Message volume:** inbound vs outbound in amber and teal, with gradient fills that fade to transparent.
  - **Channel split:** donut of WhatsApp vs Instagram, with % and count in the centre and a legend below.
- **Bottom row:**
  - **Revenue by channel:** two stat blocks with a proportion bar (WhatsApp ₹38,000 · Instagram ₹10,500).
  - **Top products:** ranked list with thumbnail, units, revenue and an inline bar. Ocean Coaster Set ₹14,400 · Resin Clock ₹11,200 · Serving Tray ₹9,000.
  - **AI performance:** auto-replied vs escalated, split by reason, as a stacked horizontal bar.
  - **Recent activity:** last 6 events with icons and relative times, plus a "View audit log" link.
- **Filters:** the top-bar channel filter re-filters every number and chart. Changing the date range shows skeletons briefly, then animates the new data in.

---

# PROMPT 3 — Inbox and Escalations

**`/inbox` (admin)**
- **Layout:** three panes on wide screens (list 340px · chat · collapsible customer panel 300px), two panes on laptops, stacked on mobile.
- **Conversation list:**
  - **Search and filters:** search box; filter chips All · Unread · AI active · Escalated · Human handling · Paused. The top-bar channel filter also applies.
  - **Each row:** avatar, name, channel icon, one-line last message, relative time, state badge, segment badges (Favourite star, Priority, Recent order) and an unread dot.
  - **Order:** priority customers are pinned to the top with a thin red left border.
  - **Navigation:** J/K moves between rows and Enter opens one. The selected row uses primary-soft.
- **Chat:**
  - **Header:** name, channel, state badge, 24h window countdown (red under 2h), and an actions menu: Pause AI for this chat, Assign, Mark resolved.
  - **Message thread:**
    - Messages are grouped by day with sticky date dividers; bubbles follow the sender rules in the Knowledge.
    - AI bubbles have an "AI" chip and an expandable "Why?" showing the intent and facts used.
    - System events appear as centred captions, e.g. "Escalated: Refund request" or "Asha took over".
    - Include a demo typing indicator.
  - **Composer:**
    - Auto-growing textarea.
    - "Use template" opens the TemplatePicker (search + preview) and inserts the text with variables filled in.
    - Attach-image button.
    - Send (⌘Enter).
    - Resolve, with a confirm step; it hands the conversation back to the AI.
  - **On send:**
    - The bubble appears immediately with sending → sent ticks.
    - The state badge changes to "Human handling", with a system caption such as "Asha took over".
- **Customer panel:** avatar, name, phone or handle, language, editable segments, notes, a short order-history list with statuses, and lifetime spend.

**`/escalations`**
- **Admin view:**
  - **Header stats:** Open · Unassigned · Avg wait.
  - **Filters:** chips All · Unassigned · Assigned to me, plus a filter by reason.
  - **Display:** cards, with a toggle to a table view.
  - **Each card shows:**
    - customer
    - reason badge
    - excerpt of the last message
    - waiting time (amber over 30m, red over 2h)
    - assignee avatar, or "Unassigned"
    - **Assign** (popover with a searchable staff list) and **Open** buttons
  - **New escalations** slide in at the top and trigger a toast (simulate one arriving a few seconds after the page opens).
- **Staff view:**
  - **Scope:** the same cards, but only escalations assigned to them or unassigned.
  - **Reply** opens `/conversations/:id`, a single chat view built from the same chat components, without the admin-only actions.
  - **After Resolve:** back to the queue with a success toast.
  - **Empty state:** "All caught up" with a small illustration.

---

# PROMPT 4 — Orders and Customers

**`/orders`**
- **Views:** toggle between Board and Table.
  - **Board:** kanban columns Pending · Confirmed · In production · Ready · Dispatched · Delivered. Cancelled orders are behind a filter.
  - **Status tabs:** show counts.
- **Order card:**
  - order number (e.g. #SA-1042)
  - customer and channel
  - products with thumbnails
  - total ₹
  - tracking ID with a copy button, once dispatched
  - age, e.g. "4 days ago"
  - due date, with a warning if it's past the product's lead time
- **Changing status:** drag between columns on desktop, or use the "Update status" menu on any device. Either way a dialog opens:
  - **Preview:** a PhonePreview of the customer notification using the matching template, e.g. Dispatched.
  - **Option:** a "Send notification" checkbox.
  - **On confirm:** a toast appears.
- **Order detail (SlideOver):**
  - status timeline
  - items
  - order total
  - shipping address and courier
  - "Open conversation" button
- **Demo data:** 8–10 orders spread across the stages.

**`/customers`**
- **Segment tabs with counts:** Favourites · Priority · Recent orders (30 days) · New · All.
- **Search and sort:** last active, total spend, number of orders.
- **Card grid** (with a table toggle). Each card shows:
  - avatar, name and channel icon
  - segment badges
  - last message and time
  - order count and total spend
  - animated star toggle for Favourite
  - "Open conversation" button
- **Info banner (dismissible):** "Priority and returning customers are processed first by the AI during busy periods."
- **Customer detail (SlideOver):** profile, segment editor, notes, orders and a link to the conversation.

---

# PROMPT 5 — Broadcast, Templates and IG Comments

**`/broadcast`** is a two-column composer.
- **Left — Audience:**
  - Segment checkboxes: All · Previous buyers · Priority · Favourites.
  - Channel locked to WhatsApp, with the tooltip "Broadcasts use approved WhatsApp templates".
  - A live estimated-reach number that animates as the selection changes.
  - A note on opt-outs.
- **Right — Message:**
  - Template picker and variable fields: `{customerName}` fills in automatically, the others are entered by hand.
  - Live PhonePreview of a WhatsApp bubble.
  - **Schedule** (date and time picker) or **Send now** (confirm dialog with a reach summary).
- **Below — recent broadcasts table:**
  - **Columns:** date, template, audience, sent, delivered %, read %, status (Sent / Scheduled / Draft).
  - **Demo rows:** "Diwali Special Offer", 89 sent, 94% delivered; "New Collection Launch", scheduled for tomorrow at 10:00.

**`/templates`**
- **Category tabs:** All · Delivery · Festive · Custom order · General. Plus a search box.
- **Template cards:**
  - name and channel badge (WhatsApp / Instagram / Both)
  - body text with `{variables}` shown as amber chips
  - list of variables used
  - last updated
  - actions: Edit · Duplicate · Delete (with a confirm step)
- **"New template"** opens a right SlideOver:
  - name, category and channel toggle
  - body editor where typing `{` opens autocomplete for `{customerName}`, `{product}`, `{trackingId}`, `{deliveryDate}`, `{amount}`, `{eventName}`
  - live preview that switches between WhatsApp and Instagram bubble styles
  - character count and Save
- **Pre-load these 6 templates:**
  - **Order Confirmed (WhatsApp):** "Hi {customerName}! 🎉 Your order for {product} is confirmed. Amount: ₹{amount}. Production starts now! 💕"
  - **Dispatched (WhatsApp):** "Great news {customerName}! 🚚 Your {product} is on the way! Tracking: {trackingId}. Expected: {deliveryDate}."
  - **Ready to Dispatch (WhatsApp):** "Hi {customerName}, your {product} is ready! 🌸 We'll dispatch it shortly and share the tracking details."
  - **Pongal Wishes + Offer (WhatsApp, Festive):** "Happy Pongal {customerName}! 🌾🎉 Special 15% off on all coaster sets this Pongal. Order now!"
  - **Christmas Collection (WhatsApp, Festive):** "Merry Christmas {customerName}! 🎄 Our limited Christmas resin collection is live. Reply to order!"
  - **Instagram Update (Instagram):** "Hi {customerName}! Your order is on the way 🚚 Tracking: {trackingId}. DM us for anything!"

**`/ig-comments`** has two tabs: Comments log · Rules.
- **Comments log:**
  - **Columns:** post thumbnail and title, commenter handle, comment, matched rule, action badge (Replied publicly · DM sent · Skipped), time.
  - **Filters:** All · Replied · Pending.
- **Rules:**
  - **Rule cards:** name, keyword chips, reply type (Public reply / Send DM), reply preview, active switch, Edit/Delete.
  - **"Add rule"** opens a SlideOver:
    - keywords (chip input)
    - reply-type toggle
    - reply text with `{postTitle}` and `{customerHandle}`
    - active toggle
    - test box: type a sample comment to see whether the rule matches
  - **Pre-load these 3 rules:**
    - **Price enquiry** (price, cost, rate, how much): "Hi! DM us for pricing 💕 @saba_art"
    - **Customization ask** (custom, customize, name): "Yes we do custom orders! DM us 🌸"
    - **Availability** (available, stock, buy): "DM us to order! We ship all over India 🚚"

---

# PROMPT 6 — Catalogue, Knowledge Base, Audit Log, Users and Settings

**`/catalogue`** (admin only) is **the products page, and only products**: a visual showcase of everything Saba Art sells. The assistant quotes prices and lead times from these products, so this is also where products are added and edited.
- **Header:** title "Catalogue", subtitle "Your products. The assistant quotes prices and lead times from this list." Right side: search box, a "Customizable only" filter chip, a sort menu (name · price · lead time) and a primary **"Add product"** button.
- **Grid of product cards:** 3 columns on desktop, 2 on tablet, 1 on mobile. Each card shows:
  - photo (seeded picsum.photos, 4:3, rounded, subtle zoom on hover)
  - name and ₹ price (large, tabular numbers)
  - sizes
  - lead-time badge ("5 days")
  - amber "Customizable" badge with the custom-option chips (colour · name · dried flowers…)
- **Clicking a card** opens a product detail SlideOver: large photo, all details, and an **Edit** button that switches it to a form with name, price, sizes (chip input), lead time (days), a customizable switch and custom options (chip input).
- **"Add product"** opens the same form. Delete asks for confirmation: "The assistant will stop quoting this product."
- **Empty state:** "No products yet — the assistant will hand every price question to you".
- Nothing else lives here. Delivery, policies, tone and the other rules are in the Knowledge Base.

**`/knowledge-base`** (admin only) is the AI's brain: **everything the assistant knows about Saba Art apart from the products themselves**. The AI answers customers only from this page and the Catalogue. A wrong delivery charge or policy here is a wrong answer sent to a customer. Design it as the most carefully crafted editing screen in the app: calm, clear, hard to make mistakes in.

- **Header:**
  - Title "Knowledge Base", subtitle "Everything the assistant knows about how Saba Art works. Products are in the Catalogue."
  - Right side: "Last updated by Asha · 2 Oct, 4:15 pm", a **"Test the assistant"** button and a primary **"Save changes"** button (disabled until something changes).
  - **Summary strip:** "6 products (in Catalogue) · 4 delivery zones · 4 policies · 5 tone examples", plus a small "Ready" check when every section has content, or an amber "Needs attention" naming the empty section. "6 products" links to `/catalogue`.
- **Layout:** sticky section list on the left (desktop) with a small count per section; on mobile it becomes a horizontal scrolling tab row. Sections, in order:
  1. **Custom orders**
     - Note text (e.g. "All products can be customised") and a bulk discount ("10+ pieces → 10% off": quantity and % fields).
     - Extra lead time for custom orders (days).
     - A locked-on row: "Items not in your product list → always handed to you", with a lock icon and tooltip "This keeps the assistant from inventing prices."
  2. **Delivery**
     - Editable table of zones: area, delivery time, charge ("Free" or ₹), and a "We deliver here" switch. Add/remove rows.
     - Courier name field.
     - Sample rows:
       - Coimbatore city: 1–2 days, Free
       - Rest of Tamil Nadu: 3–5 days, ₹60
       - Rest of India: 7–10 days, ₹120
       - International: not delivered
  3. **Policies:** four cards (Returns, Cancellation, Care, Warranty), each with view/edit toggle, a textarea and "Last edited by".
  4. **Tone examples**
     - Customer → reply pairs shown as mini chat bubbles (customer left, reply right in the AI bubble style).
     - Add, edit and delete, with the hint "3–6 examples work best. Write replies exactly the way you talk to customers."
  5. **Always hand over**
     - Topic chips the assistant never answers itself: refund, return, complaint, damaged, broken, wrong item, legal. Add with a chip input; remove with ×.
     - Info note: "Refunds, complaints and payment claims are always handed over, even if you remove them here."
- **Unsaved changes:** a sticky bottom bar "You have unsaved changes" with Discard and Save. Leaving the page asks for confirmation. Save shows the toast "Knowledge base updated — the assistant uses it right away".
- **"Test the assistant" SlideOver:**
  - Text box "Ask a question like a customer would" with suggestion chips: "How much is the wall clock?", "Do you deliver to Chennai?", "Can I get a name on coasters?".
  - Shows a preview AI bubble with a small "Preview" label, then either "Would reply automatically" (green) or "Would hand over to you — Unknown product" (amber).
  - The backend has no "test" endpoint yet, so for now build the panel with canned sample answers and the "Sample data" badge.
- **Staff never see this page.**

**`/audit-log`** is a DataTable.
- **Columns:**
  - **Actor:** avatar, name, role badge. AI and System are special actors.
  - **Action badge:** "Reply sent" green · "Escalation assigned" amber · "Staff added" blue · "Settings changed" red · "Auto-reply sent" violet.
  - **Target:** conversation link.
  - **Details:** expandable row.
  - **Timestamp.**
- **Filters:** actor, action, date range.
- **Also:** pagination and CSV export.

**`/users`**
- **Staff table:** avatar, name, email, Active/Deactivated switch, last login, actions.
- **Admin row:** shown at the top and not editable.
- **"Add staff" dialog:** name, email, password with a generate button and strength meter.
- **Deactivating:** asks for confirmation.

**`/settings`**
- **Layout:** sticky sub-navigation on the left, content on the right. On mobile it becomes a list that opens each section.
- **Sections:**
  1. **Automation:** a large AI switch card. While paused, a red banner runs across the whole app: "AI is paused — new messages are stored but not answered", with a Resume button.
  2. **WhatsApp:** connection card with status dot, +91 98765 43210, "Token valid until 12 Jan 2027", and an outlined red Disconnect button with a confirm step.
  3. **Instagram:** @saba_art in the amber "Token expires in 5 days" state, with a Refresh token button.
  4. **Business hours:**
     - on/off toggle
     - open and close time pickers, 09:00–21:00
     - day chips, Mon–Sun
     - away-message textarea with a preview, default "Hi! We're closed right now 🌙 We'll reply by 9am tomorrow. — Saba Art"
     - helper note
  5. **24-hour window alerts:**
     - on/off toggle
     - threshold select: 1h / 2h / 4h
     - alert target: Admin WhatsApp / Push
     - table of conversations close to expiry, showing time left and a "Reply now" button
  6. **Message statistics:** a table with rows for Inbound, AI replies, Staff replies, Admin replies, Failed and Read receipts, columns for Today, This week and This month, and an Export CSV button.
  7. **Appearance:** theme cards for Light / Dark / System with mini previews, plus a compact-density toggle.
- **Saving:** shows a toast; leaving with unsaved changes asks for confirmation.

---

# PROMPT 7 — Polish pass

Review the whole app against the Project Knowledge quality bar and fix anything that falls short:
- **Both themes:** switch every page between light and dark. Check contrast, borders, chart colours, badges, images and phone previews.
- **Widths:** check 375px, 768px, 1280px and 1536px. Expect no horizontal scrolling, split views that stack, a working bottom nav, and dialogs that become sheets.
- **States:** every list, table and chart has a skeleton, an empty state and a hover state. Every destructive action asks for confirmation. Every change shows a toast.
- **Keyboard:** ⌘K, visible focus rings, Esc closes overlays, J/K in the inbox.
- **Motion:** `prefers-reduced-motion` is respected.
- **Roles:** sign in with the staff account and confirm that only Escalations and the chat view are reachable.

Then list what you changed.
