# Resin Art AI Messaging Assistant — CLAUDE.md

## READ THIS FIRST

This is the single source of truth for the entire project. Read every section before writing any code. When in doubt about structure, naming, packages or behaviour, re-read the relevant section here rather than guessing.

This is a solo project. You build and maintain all parts: backend, AI pipeline and dashboard.

---

## What this project does

An AI-powered messaging assistant for a small resin art business in Kerala, India. Customers message the business on WhatsApp or Instagram. The system:

1. Receives messages through Meta's official webhooks
2. Reads them against the business knowledge base (products, prices, delivery, policies, tone)
3. Either **auto-replies** to routine questions (price, delivery, care, custom orders in the price list)
4. Or **escalates** to a human (refunds, complaints, unknown products, payment claims, anything sensitive)
5. Admin and staff use a dashboard to handle escalations, with different access levels

**Demo mode:** use `POST /simulate/message` to fake incoming messages. `DEMO_MODE=true` logs replies to the console instead of calling Meta. Build and test everything in demo mode first.

**SaaS-ready:** every database table has `business_id`. Build as if multiple businesses will use this.

---

## The two user roles

### Admin (the business owner)
One admin per business. Full access to everything.

**Can do:**
- See all conversations (all states, all channels, all staff)
- Reply to any conversation
- See and manage the full escalation queue
- Assign escalations to staff members
- Create, deactivate and manage staff accounts
- Edit the knowledge base (products, prices, delivery, policies, tone)
- Pause and resume automation globally
- See analytics: messages, auto-replies, escalations, response times
- See the full audit log
- Manage Meta channel connections (WhatsApp, Instagram)
- Create and manage WhatsApp message templates
- See everything in settings

**Cannot do:** nothing is hidden from admin.

### Staff (hired helper or assistant)
Multiple staff per business. Limited access. They handle escalations only.

**Can do:**
- See only escalated conversations (assigned to them or unassigned)
- Read conversation history and customer profile for those conversations
- Reply to their assigned or unassigned escalated conversations
- Mark a conversation as resolved (returns it to AI)
- See their own activity

**Cannot do:**
- See conversations that are ai_active, owner_handling or paused
- See escalations assigned to other staff members
- Edit the knowledge base
- Pause or resume automation
- See analytics or the audit log
- Manage users or Meta accounts
- See any settings

**Rule:** staff members see the minimum needed to handle the customer in front of them. Nothing more.

---

## Node and package versions (use these exactly)

- **Node.js:** 22.x
- **Package manager:** npm

### Backend packages

```json
{
  "dependencies": {
    "fastify": "5.12.5",
    "@fastify/cors": "11.3.0",
    "@fastify/helmet": "13.1.1",
    "@fastify/jwt": "10.2.2",
    "@fastify/auth": "5.1.1",
    "@fastify/cookie": "11.1.2",
    "@fastify/rate-limit": "11.2.0",
    "@fastify/websocket": "11.3.1",
    "@fastify/swagger": "9.9.0",
    "@fastify/swagger-ui": "6.1.1",
    "drizzle-orm": "0.45.3",
    "postgres": "3.4.9",
    "@neondatabase/serverless": "1.1.0",
    "drizzle-zod": "0.8.3",
    "pg-boss": "12.35.0",
    "@anthropic-ai/sdk": "0.128.0",
    "argon2": "0.45.1",
    "zod": "4.6.5",
    "dotenv": "18.0.4",
    "dayjs": "1.11.23",
    "nanoid": "6.0.1",
    "pino-pretty": "13.1.3"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "tsx": "4.23.15",
    "vitest": "5.0.2",
    "drizzle-kit": "0.31.11",
    "@types/node": "26.6.3"
  }
}
```

### Dashboard packages

```json
{
  "dependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-router-dom": "7.18.4",
    "@tanstack/react-query": "5.104.0",
    "socket.io-client": "4.8.4",
    "lucide-react": "1.48.0",
    "dayjs": "1.11.23",
    "clsx": "2.1.1",
    "tailwind-merge": "3.7.0",
    "class-variance-authority": "0.7.1"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "vite": "8.3.1",
    "@vitejs/plugin-react": "6.1.1",
    "tailwindcss": "4.3.3",
    "autoprefixer": "10.6.1",
    "postcss": "8.5.28",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@types/node": "26.6.3"
  }
}
```

---

## Full folder structure

```
resin-art-assistant/
│
├── CLAUDE.md
├── .gitignore
├── README.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── .env.example
│   ├── .env                              ← Never commit
│   │
│   └── src/
│       ├── index.ts                      ← Entry point. Registers plugins and routes. Starts server.
│       ├── config.ts                     ← Reads and validates all env vars with Zod. Throws on missing.
│       │
│       ├── db/
│       │   ├── index.ts                  ← Drizzle db instance
│       │   ├── schema.ts                 ← All table definitions (see Database section)
│       │   └── migrations/               ← Generated by drizzle-kit. Never edit manually.
│       │
│       ├── routes/
│       │   ├── index.ts                  ← Registers all routes
│       │   ├── auth.ts                   ← POST /auth/login, GET /auth/me, POST /auth/logout
│       │   ├── conversations.ts          ← GET /conversations, GET /conversations/:id
│       │   ├── reply.ts                  ← POST /conversations/:id/reply
│       │   ├── resolve.ts                ← POST /conversations/:id/resolve
│       │   ├── escalations.ts            ← GET /escalations, POST /escalations/:id/assign
│       │   ├── users.ts                  ← GET /users, POST /users, PATCH /users/:id (admin only)
│       │   ├── settings.ts               ← GET /settings, POST /settings/pause (admin only)
│       │   ├── knowledge-base.ts         ← GET /knowledge-base, PUT /knowledge-base (admin only)
│       │   ├── analytics.ts              ← GET /analytics (admin only)
│       │   ├── audit-log.ts              ← GET /audit-log (admin only)
│       │   ├── webhooks.ts               ← GET /webhook (verify), POST /webhook (events)
│       │   ├── simulate.ts               ← POST /simulate/message (demo only)
│       │   └── health.ts                 ← GET /health
│       │
│       ├── middleware/
│       │   ├── authenticate.ts           ← Verifies JWT. Attaches user to request.
│       │   ├── requireAdmin.ts           ← Returns 403 if user.role !== "admin"
│       │   ├── requireStaffOrAdmin.ts    ← Returns 403 if not staff or admin
│       │   └── filterByRole.ts           ← Adds role-based query filters to request
│       │
│       ├── queue/
│       │   ├── index.ts                  ← pg-boss instance
│       │   ├── worker.ts                 ← Starts all workers
│       │   └── jobs/
│       │       ├── processMessage.ts     ← Main job (see Pipeline section)
│       │       ├── sendReminder.ts       ← Escalation reminder after 2h silence
│       │       └── refreshTokens.ts      ← Daily Instagram token refresh
│       │
│       ├── ai/
│       │   ├── pipeline.ts               ← Calls Anthropic API, returns AiDecision
│       │   ├── prompt.ts                 ← Builds prompt from KB + history + message
│       │   ├── rules.ts                  ← Escalation rules. Always applied after LLM.
│       │   └── types.ts                  ← Zod schema + TypeScript type for AiDecision
│       │
│       ├── services/
│       │   ├── send.ts                   ← Sends reply via Meta or logs in DEMO_MODE
│       │   ├── notify.ts                 ← Alerts admin/staff via WhatsApp or push
│       │   ├── media.ts                  ← Downloads Meta media URLs immediately on arrival
│       │   └── meta/
│       │       ├── webhook.ts            ← Handshake verify + X-Hub-Signature-256
│       │       ├── instagram.ts          ← Instagram API: send message, refresh token
│       │       └── whatsapp.ts           ← WhatsApp Cloud API: send message, send template
│       │
│       └── lib/
│           ├── errors.ts                 ← AppError class and Fastify error handler
│           ├── logger.ts                 ← Pino logger instance
│           └── crypto.ts                 ← AES-256-GCM encrypt/decrypt for stored tokens
│
├── dashboard/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.ts
│   ├── index.html
│   │
│   └── src/
│       ├── main.tsx                      ← React entry. Wraps in QueryClient, Router, AuthProvider.
│       ├── App.tsx                       ← Route definitions with role-based guards
│       │
│       ├── context/
│       │   └── AuthContext.tsx           ← Current user, role, login(), logout()
│       │
│       ├── api/
│       │   ├── client.ts                 ← Base fetch. Attaches JWT. Handles 401 → logout.
│       │   ├── auth.ts                   ← login, me, logout
│       │   ├── conversations.ts          ← All conversation endpoints
│       │   ├── escalations.ts            ← All escalation endpoints
│       │   ├── users.ts                  ← Admin: list, create, deactivate staff
│       │   ├── settings.ts               ← pause, channel status
│       │   ├── knowledge-base.ts         ← read, update
│       │   ├── analytics.ts              ← analytics data
│       │   └── audit-log.ts              ← audit log
│       │
│       ├── hooks/
│       │   ├── useAuth.ts                ← useContext(AuthContext)
│       │   ├── useConversations.ts       ← TanStack Query hooks
│       │   ├── useEscalations.ts
│       │   ├── useUsers.ts               ← Admin only
│       │   ├── useSettings.ts
│       │   ├── useAnalytics.ts           ← Admin only
│       │   └── useSocket.ts              ← Socket.io, role-aware subscriptions
│       │
│       ├── guards/
│       │   ├── RequireAuth.tsx           ← Redirect to /login if not authenticated
│       │   └── RequireAdmin.tsx          ← Redirect to /escalations if role is staff
│       │
│       ├── pages/
│       │   ├── Login.tsx                 ← Email + password form. Both roles use this.
│       │   │
│       │   │   ── Admin-only pages ──
│       │   ├── AdminInbox.tsx            ← Full inbox: all conversations + chat view
│       │   ├── Analytics.tsx             ← Message counts, auto-reply rate, response times
│       │   ├── KnowledgeBase.tsx         ← Edit products, policies, tone examples
│       │   ├── UserManagement.tsx        ← Create/deactivate staff accounts
│       │   ├── AuditLog.tsx              ← Full action history
│       │   ├── Settings.tsx              ← Pause switch, Meta channels, templates
│       │   │
│       │   │   ── Staff pages ──
│       │   ├── StaffEscalations.tsx      ← Staff's assigned + unassigned escalations only
│       │   └── StaffChat.tsx             ← Chat view for one escalated conversation
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AdminSidebar.tsx      ← Inbox, Escalations, KB, Analytics, Users, Audit, Settings
│       │   │   ├── StaffSidebar.tsx      ← Escalations only
│       │   │   └── TopBar.tsx            ← Page title, pause shortcut (admin), connection dot
│       │   │
│       │   ├── inbox/                    ← Admin only
│       │   │   ├── ConversationList.tsx  ← All conversations, filterable by state/tag/channel
│       │   │   ├── ConversationItem.tsx  ← Row: state badge, tag, channel icon, last message
│       │   │   ├── ChatView.tsx          ← Full message thread + reply box
│       │   │   ├── MessageBubble.tsx     ← customer / ai / owner / staff / system colours
│       │   │   ├── ReplyBox.tsx          ← Textarea + Send + Resolve buttons
│       │   │   └── WindowCountdown.tsx   ← Time left in 24-hour window, red when < 2h
│       │   │
│       │   ├── escalations/
│       │   │   ├── EscalationCard.tsx    ← Reason, countdown, assign button (admin), reply button (staff)
│       │   │   ├── EscalationBadge.tsx   ← Colour-coded reason tag
│       │   │   └── AssignModal.tsx       ← Admin: pick a staff member to assign (admin only)
│       │   │
│       │   ├── admin/
│       │   │   ├── StaffForm.tsx         ← Create staff: name, email, password
│       │   │   ├── StaffRow.tsx          ← Staff list row: name, email, active toggle
│       │   │   ├── AnalyticsCard.tsx     ← Single metric card
│       │   │   └── PauseButton.tsx       ← Big prominent pause/resume toggle
│       │   │
│       │   └── ui/
│       │       ├── Badge.tsx             ← State, tag and role badges
│       │       ├── Button.tsx            ← primary / ghost / danger variants
│       │       ├── Input.tsx
│       │       ├── Textarea.tsx
│       │       ├── Modal.tsx
│       │       ├── Spinner.tsx
│       │       ├── Toast.tsx
│       │       └── EmptyState.tsx
│       │
│       ├── types/
│       │   └── index.ts                  ← All shared TypeScript types
│       │
│       └── lib/
│           ├── cn.ts                     ← clsx + tailwind-merge helper
│           └── format.ts                 ← Date formatting with dayjs
│
└── docs/
    ├── contracts.md                      ← Agreed API, DB and AI output spec
    ├── knowledge-base.json               ← Sample resin art data for demo
    └── demo-scenarios.md                 ← 10 demo scenarios + expected results
```

---

## Environment variables (backend/.env.example)

```bash
# Server
PORT=3001
NODE_ENV=development
DEMO_MODE=true

# Auth
JWT_SECRET=change_this_to_64_random_chars_minimum
JWT_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Meta (leave empty in demo mode)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# WhatsApp Cloud API
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# Owner alerts
OWNER_ALERT_PHONE=
OWNER_WHATSAPP_TOKEN=

# Token encryption
ENCRYPTION_KEY=                        # 32-byte hex: openssl rand -hex 32

# Demo business (fixed ID for single-client demo)
BUSINESS_ID=resin-art-demo-business-01
```

---

## Database schema (backend/src/db/schema.ts)

Use Drizzle ORM with Postgres dialect. All IDs use `nanoid()`. All tables have `business_id`. Always add indexes on FK columns and WHERE clause columns.

```typescript
import {
  pgTable, pgEnum, text, boolean,
  jsonb, timestamp, uniqueIndex, index
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

// Helpers
const now = () => new Date();
const id = () => text("id").primaryKey().$defaultFn(() => nanoid());
const businessId = () => text("business_id").notNull();
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () => timestamp("updated_at").notNull().defaultNow().$onUpdate(now);

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["admin", "staff"]);

export const channelTypeEnum = pgEnum("channel_type", ["instagram", "whatsapp"]);

export const convStateEnum = pgEnum("conv_state", [
  "ai_active", "escalated", "owner_handling", "paused"
]);

export const convTagEnum = pgEnum("conv_tag", [
  "new_lead", "custom_order", "payment_pending",
  "order_confirmed", "follow_up"
]);

export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);

export const senderTypeEnum = pgEnum("sender_type", [
  "customer", "ai", "owner", "staff", "system"
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued", "sent", "delivered", "read", "failed"
]);

export const escalationReasonEnum = pgEnum("escalation_reason", [
  "intent_complaint", "intent_refund", "intent_unknown",
  "missing_facts", "always_escalate_phrase",
  "payment_claim", "unapproved_intent", "parse_error", "manual"
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

// One row per business (SaaS-ready)
export const businesses = pgTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  metaConfig: jsonb("meta_config").default({}),
  settings: jsonb("settings").default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Admin and staff users
export const users = pgTable("users", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),       // argon2id hash
  role: roleEnum("role").notNull(),                    // "admin" | "staff"
  active: boolean("active").notNull().default(true),   // false = deactivated
  lastLoginAt: timestamp("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("users_email_idx").on(t.email),
  index("users_business_idx").on(t.businessId),
]);

// WhatsApp numbers and Instagram accounts connected to the business
export const channels = pgTable("channels", {
  id: id(),
  businessId: businessId(),
  type: channelTypeEnum("type").notNull(),
  identifier: text("identifier").notNull(),
  encryptedToken: text("encrypted_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("channels_unique_idx").on(t.businessId, t.type, t.identifier),
]);

// One customer per channel (same person on WA and IG = two customer rows)
export const customers = pgTable("customers", {
  id: id(),
  businessId: businessId(),
  channelId: text("channel_id").notNull(),
  name: text("name"),
  handleOrPhone: text("handle_or_phone").notNull(),
  language: text("language").default("english"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("customers_business_idx").on(t.businessId),
  index("customers_channel_idx").on(t.channelId),
]);

// One conversation per customer (ongoing thread)
export const conversations = pgTable("conversations", {
  id: id(),
  businessId: businessId(),
  customerId: text("customer_id").notNull(),
  channelId: text("channel_id").notNull(),
  state: convStateEnum("state").notNull().default("ai_active"),
  tag: convTagEnum("tag"),
  lastCustomerMessageAt: timestamp("last_customer_message_at"),
  windowClosesAt: timestamp("window_closes_at"),       // 24h after lastCustomerMessageAt
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("conversations_business_state_idx").on(t.businessId, t.state),
  index("conversations_customer_idx").on(t.customerId),
]);

// Every message in every conversation
export const messages = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull(),
  businessId: businessId(),
  direction: directionEnum("direction").notNull(),
  senderType: senderTypeEnum("sender_type").notNull(),
  senderId: text("sender_id"),                         // user.id for staff/admin, null for AI
  content: text("content"),
  mediaUrls: jsonb("media_urls").default([]),          // stored copies, not Meta CDN
  metaMessageId: text("meta_message_id"),              // unique per channel
  deliveryStatus: deliveryStatusEnum("delivery_status").default("queued"),
  metadata: jsonb("metadata").default({}),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("messages_meta_id_idx").on(t.metaMessageId),
  index("messages_conversation_idx").on(t.conversationId),
]);

// AI decision for every processed message
export const aiDecisions = pgTable("ai_decisions", {
  id: id(),
  messageId: text("message_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  businessId: businessId(),
  intent: text("intent").notNull(),
  replyDraft: text("reply_draft").notNull(),
  factsUsed: jsonb("facts_used").default([]),
  missingFacts: jsonb("missing_facts").default([]),
  escalate: boolean("escalate").notNull(),
  escalateReason: escalationReasonEnum("escalate_reason"),
  suggestedTag: text("suggested_tag"),
  languageDetected: text("language_detected"),
  sent: boolean("sent").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  index("ai_decisions_conversation_idx").on(t.conversationId),
]);

// Open escalations waiting for a human
export const escalations = pgTable("escalations", {
  id: id(),
  businessId: businessId(),
  conversationId: text("conversation_id").notNull(),
  reason: escalationReasonEnum("reason").notNull(),
  assignedToUserId: text("assigned_to_user_id"),       // null = unassigned, any staff can pick up
  assignedByUserId: text("assigned_by_user_id"),       // admin who assigned it
  assignedAt: timestamp("assigned_at"),
  alertedAt: timestamp("alerted_at"),
  remindedAt: timestamp("reminded_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id"),       // who resolved it
  createdAt: createdAt(),
}, (t) => [
  index("escalations_business_resolved_idx").on(t.businessId, t.resolvedAt),
  index("escalations_assigned_idx").on(t.assignedToUserId),
]);

// Business knowledge base (products, policies, tone examples)
export const knowledgeBase = pgTable("knowledge_base", {
  id: id(),
  businessId: businessId(),
  data: jsonb("data").notNull(),
  updatedByUserId: text("updated_by_user_id"),         // admin who last edited
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("kb_business_idx").on(t.businessId),
]);

// Full audit trail of every action
export const auditLog = pgTable("audit_log", {
  id: id(),
  businessId: businessId(),
  actorId: text("actor_id"),                           // user.id, or null for system/AI
  actorType: text("actor_type").notNull(),             // "admin" | "staff" | "ai" | "system"
  action: text("action").notNull(),                    // e.g. "reply_sent", "escalation_assigned"
  conversationId: text("conversation_id"),
  escalationId: text("escalation_id"),
  targetUserId: text("target_user_id"),                // for user management actions
  details: jsonb("details").default({}),
  createdAt: createdAt(),
}, (t) => [
  index("audit_business_created_idx").on(t.businessId, t.createdAt),
  index("audit_actor_idx").on(t.actorId),
]);
```

---

## Auth system (backend/src/routes/auth.ts)

Use `@fastify/jwt` and `argon2` for password hashing. Never use bcrypt; argon2 is the current standard.

### Password hashing

```typescript
import argon2 from "argon2";

// Hash (on user creation or password change)
const hash = await argon2.hash(password, { type: argon2.argon2id });

// Verify (on login)
const valid = await argon2.verify(storedHash, password);
```

### JWT payload

```typescript
interface JwtPayload {
  sub: string;          // user.id
  businessId: string;
  role: "admin" | "staff";
  name: string;
}
```

### Login flow

```
POST /auth/login { email, password }
  → find user by email in users table
  → check active === true, else 403 "Account deactivated"
  → verify password with argon2.verify
  → if invalid, 401 "Invalid credentials"
  → sign JWT with payload above, expires in JWT_EXPIRES_IN
  → update users.last_login_at
  → return { token, user: { id, name, email, role } }
```

### Middleware: authenticate.ts

```typescript
// Attach to every route except /health, /webhook, /auth/login
// 1. Read Authorization: Bearer <token>
// 2. Verify with fastify.jwt.verify()
// 3. Attach decoded payload to request.user
// 4. If missing or invalid → 401
```

### Middleware: requireAdmin.ts

```typescript
// Use after authenticate
// If request.user.role !== "admin" → 403 "Admin access required"
```

### Middleware: requireStaffOrAdmin.ts

```typescript
// Use after authenticate
// If role is neither "admin" nor "staff" → 403
// (In practice all valid users are one or the other, but be explicit)
```

---

## API endpoints (full spec)

Base URL (dev): `http://localhost:3001`

All responses: `Content-Type: application/json`
All errors: `{ "error": "message", "code": "ERROR_CODE" }`
Auth header: `Authorization: Bearer <token>` on every route except noted

### Public routes (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Returns `{ ok: true, mode: "demo"\|"live" }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/webhook` | Meta verify handshake |
| POST | `/webhook` | Meta events. Returns 200 immediately. |

### Auth routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/me` | Any | Returns current user from JWT |
| POST | `/auth/logout` | Any | Client-side only; clears token |

### Conversation routes

| Method | Path | Admin | Staff | Notes |
|---|---|---|---|---|
| GET | `/conversations` | All conversations | ❌ forbidden | Query: `state`, `tag`, `channel`, `page`, `limit` |
| GET | `/conversations/:id` | Any conversation | Only if assigned escalation | Full thread with messages |
| POST | `/conversations/:id/reply` | Any conversation | Only if assigned escalation | `{ text }` |
| POST | `/conversations/:id/resolve` | Any conversation | Only if assigned escalation | Returns conv to ai_active |

### Escalation routes

| Method | Path | Admin | Staff | Notes |
|---|---|---|---|---|
| GET | `/escalations` | All escalations | Only assigned to them + unassigned | Query: `resolved` |
| POST | `/escalations/:id/assign` | ✅ | ❌ | `{ userId }` assigns to staff |

### User management routes (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | List all staff (not admin). Returns `id, name, email, active, lastLoginAt` |
| POST | `/users` | Create staff: `{ name, email, password }`. Role always set to "staff". |
| PATCH | `/users/:id` | Update: `{ active }` to deactivate/reactivate. Cannot change role here. |

### Settings routes

| Method | Path | Admin | Staff | Notes |
|---|---|---|---|---|
| GET | `/settings` | ✅ | ❌ | Returns `{ paused, channels }` |
| POST | `/settings/pause` | ✅ | ❌ | `{ paused: boolean }` |

### Knowledge base routes (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/knowledge-base` | Returns full KB |
| PUT | `/knowledge-base` | Replace full KB. Records `updatedByUserId`. |

### Analytics routes (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/analytics` | Query: `from`, `to`. Returns message counts, auto-reply rate, escalation rate, avg response time |

### Audit log routes (admin only)

| Method | Path | Notes |
|---|---|---|
| GET | `/audit-log` | Query: `page`, `limit`, `actorId`, `action`. Returns paginated log. |

### Demo only

| Method | Path | Notes |
|---|---|---|
| POST | `/simulate/message` | `{ customerName, channel, text, imageUrl? }`. Only works when `DEMO_MODE=true`. |

---

## Role-based access: how to enforce it

### Backend enforcement (never trust the frontend)

Every protected route checks role in this order:
1. `authenticate` → verify JWT, attach `request.user`
2. `requireAdmin` OR `requireStaffOrAdmin` → check role
3. For staff: filter queries to only return allowed data

**Staff query filters (apply these in route handlers):**

```typescript
// GET /escalations for staff:
WHERE escalations.business_id = user.businessId
  AND (escalations.assigned_to_user_id = user.id
       OR escalations.assigned_to_user_id IS NULL)
  AND escalations.resolved_at IS NULL

// GET /conversations/:id for staff:
// First check: does an open escalation exist for this conversation
// that is assigned to this staff or unassigned?
// If no → 403 "Not assigned to you"
```

**Audit every reply and resolve:**

```typescript
// When staff or admin sends a reply:
await db.insert(auditLog).values({
  businessId: user.businessId,
  actorId: user.id,
  actorType: user.role,           // "admin" or "staff"
  action: "reply_sent",
  conversationId: conv.id,
  details: { messageId, preview: text.slice(0, 100) }
});
```

### Frontend enforcement (for UX only, never for security)

Use guards and role-aware routing:

```typescript
// App.tsx routing structure
<Routes>
  <Route path="/login" element={<Login />} />

  <Route element={<RequireAuth />}>
    {/* Admin-only routes */}
    <Route element={<RequireAdmin />}>
      <Route path="/inbox" element={<AdminInbox />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/knowledge-base" element={<KnowledgeBase />} />
      <Route path="/users" element={<UserManagement />} />
      <Route path="/audit-log" element={<AuditLog />} />
      <Route path="/settings" element={<Settings />} />
    </Route>

    {/* Staff + admin routes */}
    <Route path="/escalations" element={
      user.role === "admin" ? <AdminEscalations /> : <StaffEscalations />
    } />
    <Route path="/conversations/:id" element={<StaffChat />} />

    {/* Redirect root based on role */}
    <Route path="/" element={
      <Navigate to={user.role === "admin" ? "/inbox" : "/escalations"} />
    } />
  </Route>
</Routes>
```

---

## AI pipeline (backend/src/ai/)

### AiDecision type (types.ts)

```typescript
import { z } from "zod";

export const intentEnum = z.enum([
  "price", "delivery", "care", "custom_order",
  "payment", "complaint", "refund", "unknown", "off_topic"
]);

export const aiDecisionSchema = z.object({
  intent: intentEnum,
  reply: z.string().min(1).max(2000),
  facts_used: z.array(z.string()),
  missing_facts: z.array(z.string()),
  escalate: z.boolean(),
  escalate_reason: z.string().nullable(),
  suggested_tag: z.enum([
    "new_lead", "custom_order", "payment_pending",
    "order_confirmed", "follow_up"
  ]).nullable(),
  language_detected: z.enum(["english", "malayalam", "manglish"]),
});

export type AiDecision = z.infer<typeof aiDecisionSchema>;
```

### Escalation rules (rules.ts — always applied after LLM)

```typescript
export const ALWAYS_ESCALATE_INTENTS = [
  "complaint", "refund", "unknown", "off_topic", "payment"
];

export const ALWAYS_ESCALATE_PHRASES = [
  "i paid", "already paid", "payment done", "sent money",
  "where is my order", "not received", "damaged", "broken",
  "want refund", "cancel my order", "cheated", "fraud",
  "police", "consumer court",
];

export const AUTO_REPLY_ALLOWED_INTENTS = [
  "price", "delivery", "care", "custom_order"
];

export function applyRules(decision: AiDecision, rawText: string): AiDecision {
  if (ALWAYS_ESCALATE_INTENTS.includes(decision.intent)) {
    return { ...decision, escalate: true,
             escalate_reason: `intent_${decision.intent}` };
  }
  const lower = rawText.toLowerCase();
  const phrase = ALWAYS_ESCALATE_PHRASES.find(p => lower.includes(p));
  if (phrase) {
    return { ...decision, escalate: true,
             escalate_reason: "always_escalate_phrase" };
  }
  if (decision.missing_facts.length > 0) {
    return { ...decision, escalate: true,
             escalate_reason: "missing_facts" };
  }
  if (!AUTO_REPLY_ALLOWED_INTENTS.includes(decision.intent)) {
    return { ...decision, escalate: true,
             escalate_reason: "unapproved_intent" };
  }
  return decision;
}
```

### processMessage.ts — main job flow

```
1. Load conversation. If state !== "ai_active" → stop and return.
2. Check window_closes_at. If expired → escalate with reason "window_closed".
3. Wait 10 seconds for message batching. Load all messages in this batch.
4. Call pipeline.ts → get AiDecision
5. Call rules.ts with the decision and raw message text
6. If escalate:
   a. Set conversation.state = "escalated"
   b. Insert into escalations (assigned_to_user_id = null)
   c. Call notify.ts (alert admin + any on-duty staff via push/WhatsApp)
   d. Insert into audit_log: action = "escalation_created", actorType = "ai"
7. If auto-reply:
   a. Insert outbound message: sender_type = "ai", sender_id = null
   b. Call send.ts (logs in DEMO_MODE)
   c. Update conversation.tag if suggested_tag present
   d. Insert into ai_decisions with sent = true
   e. Insert into audit_log: action = "auto_reply_sent", actorType = "ai"
```

---

## Conversation state machine

```
[new conversation] ──► ai_active
        │
        ├── rule triggers ──────────────────────────► escalated
        │                                                 │
        ├── owner/admin replies directly ──► owner_handling│
        │                                       │         │
        │                                  staff assigned ──► staff replies
        │                                       │         │
        │   ◄──────── marked resolved ──────────┘─────────┘
        │
        └── admin pauses ──► paused ──► admin resumes ──► ai_active
```

**Rules:**
- Worker checks state BEFORE calling AI. Only run if `ai_active`.
- Echo detection (owner/staff reply from phone app) must set state to `owner_handling` BEFORE any AI job runs for that conversation.
- State changes always written to `audit_log`.
- Staff cannot pause/resume; only admin can.

---

## Webhook handling

### Verification (GET /webhook)

```typescript
// Check hub.mode === "subscribe" && hub.verify_token === META_VERIFY_TOKEN
// Return hub.challenge as plain text with status 200
```

### Signature validation (POST /webhook)

```typescript
import crypto from "node:crypto";

function validateSignature(rawBody: Buffer, sig: string, secret: string): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(rawBody)          // raw bytes before JSON.parse
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
// Reject if false. Always return 200. Process in queue async.
```

### Echo detection

- **WhatsApp:** message where `from === WHATSAPP_PHONE_NUMBER_ID` → echo
- **Instagram:** message where `sender.id === INSTAGRAM_ACCOUNT_ID` → echo
- Echo → insert as `direction: inbound, sender_type: "owner"`, set `conversation.state = "owner_handling"`. Do NOT add to AI queue.

### Duplicate prevention

Unique index on `messages.meta_message_id`. Before inserting, check existence. If already exists, return 200 silently.

---

## Dashboard UI patterns

### State badge colours

```typescript
const stateColors: Record<string, string> = {
  ai_active:      "bg-emerald-100 text-emerald-800",
  escalated:      "bg-red-100 text-red-800",
  owner_handling: "bg-amber-100 text-amber-800",
  paused:         "bg-gray-100 text-gray-500",
};
```

### Message bubble colours

```typescript
const bubbleStyles: Record<string, string> = {
  customer: "bg-gray-100 text-gray-900 self-start rounded-tr-2xl rounded-b-2xl",
  ai:       "bg-blue-50 text-blue-900 self-end border border-blue-200 rounded-tl-2xl rounded-b-2xl",
  owner:    "bg-emerald-500 text-white self-end rounded-tl-2xl rounded-b-2xl",
  staff:    "bg-violet-500 text-white self-end rounded-tl-2xl rounded-b-2xl",
  system:   "text-gray-400 text-xs text-center self-center bg-transparent",
};
```

### Role badge colours

```typescript
const roleColors = {
  admin: "bg-emerald-100 text-emerald-800",
  staff: "bg-violet-100 text-violet-800",
};
```

### Real-time (Socket.io events)

Admin subscribes to all:
- `conversation:updated` — any state or tag change
- `escalation:new` — show alert toast
- `escalation:assigned` — update escalation queue
- `message:new` — append to open chat view

Staff subscribes to:
- `escalation:new` — show alert toast
- `escalation:assigned:${userId}` — assigned to this staff member specifically
- `message:new:${conversationId}` — only for their open conversations

If socket disconnects → poll every 5 seconds as fallback.

### cn helper (src/lib/cn.ts)

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

---

## Knowledge base format (docs/knowledge-base.json)

```json
{
  "business_name": "Asha Resin Art",
  "products": [
    { "id": "ocean-coaster-set-4", "name": "Ocean Coaster Set of 4",
      "price": 1200, "sizes": ["10cm round"], "lead_time_days": 5,
      "customizable": true, "custom_options": ["colour", "name_engraving"] },
    { "id": "resin-clock-12in", "name": "12 inch Resin Wall Clock",
      "price": 2800, "sizes": ["12 inch"], "lead_time_days": 7,
      "customizable": true, "custom_options": ["colour", "dried_flowers", "name", "theme"] },
    { "id": "resin-tray-large", "name": "Large Resin Serving Tray",
      "price": 1800, "sizes": ["30cm x 20cm"], "lead_time_days": 6,
      "customizable": true, "custom_options": ["colour", "dried_flowers", "gold_foil"] },
    { "id": "keychain-set-3", "name": "Resin Keychain Set of 3",
      "price": 450, "lead_time_days": 3,
      "customizable": true, "custom_options": ["colour", "name", "shape"] },
    { "id": "photo-frame-5x7", "name": "Resin Photo Frame 5x7",
      "price": 950, "lead_time_days": 5,
      "customizable": true, "custom_options": ["colour", "dried_flowers"] },
    { "id": "bookmarks-set-4", "name": "Resin Bookmark Set of 4",
      "price": 380, "lead_time_days": 3,
      "customizable": true, "custom_options": ["colour", "name", "pressed_flowers"] }
  ],
  "custom_orders": {
    "note": "All products can be customised. Bulk orders of 10+ pieces get 10% off.",
    "lead_time_extra_days": 2,
    "items_not_in_catalogue": "escalate_to_owner"
  },
  "delivery": {
    "zones": [
      { "area": "Thrissur city", "days": "1-2", "charge": 0 },
      { "area": "Kerala (other districts)", "days": "3-5", "charge": 60 },
      { "area": "Rest of India", "days": "7-10", "charge": 120 },
      { "area": "International", "available": false }
    ],
    "courier": "Shiprocket (DTDC / Delhivery)"
  },
  "payment": {
    "methods": ["Google Pay", "PhonePe", "Bank transfer", "UPI"],
    "advance_percent": 50,
    "balance": "before dispatch",
    "upi_id": "asharesins@okaxis"
  },
  "policies": {
    "returns": "No returns on custom orders. Exchange only for transit damage with photo proof within 24h.",
    "cancellation": "Cancel within 24h of order. Advance refunded in 3 working days.",
    "care": "Away from direct sunlight and heat. Wipe with dry cloth. Do not soak.",
    "warranty": "No warranty on colour fading from sunlight."
  },
  "tone_examples": [
    { "customer": "How much is the ocean coaster set?",
      "reply": "Hi! 😊 The Ocean Coaster Set of 4 is ₹1,200. We can customise colours and add a name too! Lead time is about 5 days. Interested?" },
    { "customer": "Do you deliver to Bangalore?",
      "reply": "Yes, we deliver all over India! 🚚 Bangalore takes 7-10 days, shipping is ₹120. Want to place an order?" },
    { "customer": "How do I take care of resin products?",
      "reply": "Easy! Keep away from direct sunlight and heat, wipe with a dry cloth, don't soak in water. They'll last for years 🌸" },
    { "customer": "Can I get a clock with my daughter's name?",
      "reply": "Of course! 💕 The 12 inch clock with her name is ₹2,800. Which colours does she like? I'll send some options!" },
    { "customer": "എത്ര രൂപ കൊടുക്കണം coaster set ന്?",
      "reply": "Ocean Coaster Set of 4 ₹1,200 ആണ് 😊 Colour customise ചെയ്യാം, name കൂടി add ചെയ്യാം. Interest ഉണ്ടോ?" }
  ],
  "escalate_always": [
    "refund", "return", "complaint", "damaged", "broken",
    "payment issue", "wrong item", "legal"
  ]
}
```

---

## Demo scenarios (all 10 must pass before demo is done)

| # | Input | Expected |
|---|---|---|
| 1 | "How much is the ocean coaster set?" | Auto-reply with ₹1,200 |
| 2 | "I want a custom clock with my daughter's name" | Auto-reply asking for colour choice |
| 3 | "Do you deliver to Bangalore?" | Auto-reply: 7-10 days, ₹120 |
| 4 | "How much for a 6 foot resin table?" | Escalate: missing_facts |
| 5 | "I want a refund" | Escalate: intent_refund |
| 6 | "I paid already, where is my order?" | Escalate: always_escalate_phrase |
| 7 | Three messages in 5 seconds | One combined reply after 10s |
| 8 | Admin/staff replies from dashboard | State → owner_handling, AI stops |
| 9 | "എത്ര രൂപ കൊടുക്കണം keychain ന്?" | Auto-reply in Malayalam, ₹450 |
| 10 | Pause automation, then simulate message | Stored, no AI reply |

---

## Build order (follow this exactly)

```
1.  backend/src/config.ts                 env validation
2.  backend/src/db/schema.ts              all tables including users
3.  npm run db:generate && db:migrate     create tables
4.  backend/src/index.ts + health.ts      server starts
5.  backend/src/routes/auth.ts            login, me endpoints
6.  backend/src/middleware/               authenticate, requireAdmin
7.  backend/src/routes/simulate.ts        fake message endpoint
8.  backend/src/queue/                    pg-boss + worker skeleton
9.  backend/src/ai/                       pipeline, rules, prompt
10. backend/src/queue/jobs/processMessage.ts  wire it together
11. backend/src/services/send.ts          demo mode logging
12. Test scenarios 1-3 via curl
13. dashboard/src/context/AuthContext.tsx auth state
14. dashboard/src/pages/Login.tsx         login form
15. dashboard/src/pages/AdminInbox.tsx    full inbox (admin)
16. dashboard/src/pages/StaffEscalations.tsx escalation queue (staff)
17. dashboard/src/components/inbox/      ChatView, MessageBubble, ReplyBox
18. Test all 10 demo scenarios
19. Create one admin user and one staff user in the DB directly
20. Verify staff cannot access /inbox, /settings, /users
21. Client demo and sign-off
22. Meta integration (real WhatsApp + Instagram)
```

---

## Seed data (run once after migrations)

```typescript
// Create the demo business
await db.insert(businesses).values({
  id: process.env.BUSINESS_ID,
  name: "Asha Resin Art",
});

// Create admin user (owner)
await db.insert(users).values({
  businessId: process.env.BUSINESS_ID,
  name: "Asha",
  email: "asha@asharesins.com",
  passwordHash: await argon2.hash("changeme123"),
  role: "admin",
});

// Create one staff user for testing
await db.insert(users).values({
  businessId: process.env.BUSINESS_ID,
  name: "Priya",
  email: "priya@asharesins.com",
  passwordHash: await argon2.hash("staffpass123"),
  role: "staff",
});

// Insert the knowledge base
await db.insert(knowledgeBase).values({
  businessId: process.env.BUSINESS_ID,
  data: JSON.parse(fs.readFileSync("../docs/knowledge-base.json", "utf-8")),
});
```

---

## Security rules (never break these)

- Never commit `.env` or any real credentials
- Never log full message content in production (log IDs only)
- Never store Meta tokens in plain text — use `lib/crypto.ts` (AES-256-GCM)
- Never skip webhook signature validation
- Never send an auto-reply if `conversation.state !== "ai_active"`
- Never allow a staff user to access admin routes — check at the route level, not just in the frontend
- Never trust role from the request body — always use the role from the verified JWT
- Never expose `password_hash` in any API response

---

## Commands reference

```bash
# Backend
cd backend && npm run dev          # start with hot reload
cd backend && npm run db:generate  # after schema changes
cd backend && npm run db:migrate   # apply migrations
cd backend && npm run db:studio    # visual DB browser
cd backend && npm test             # run all tests

# Dashboard
cd dashboard && npm run dev        # start Vite dev server

# Test login (demo)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"asha@asharesins.com","password":"changeme123"}'

# Test simulate (use token from login)
curl -X POST http://localhost:3001/simulate/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"customerName":"Test","channel":"whatsapp","text":"How much is the ocean coaster set?"}'

# Test staff access (should return 403)
curl http://localhost:3001/inbox \
  -H "Authorization: Bearer <staff_token>"
```

---

## TypeScript config (backend/tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

## Drizzle config (backend/drizzle.config.ts)

```typescript
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config();
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

## Backend package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:eval": "vitest run tests/ai/evaluation.test.ts"
  }
}
```

---

## DEMO PHASE ADDITIONS

These five things are added to the demo. Build them alongside the core system. Do not build anything in the Phase 2 section until the demo is signed off by the client.

---

## Sentry (error tracking)

**What it does:** catches every unhandled error and promise rejection in the backend and dashboard, and sends it to your Sentry dashboard with a full stack trace, request context and user info. You know about errors before the client messages you.

**Backend package:** `@sentry/node@11.0.0`
**Dashboard package:** `@sentry/react@11.0.0`

### Backend setup (backend/src/index.ts — add at the very top, before anything else)

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,          // "development" | "production"
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.2,                      // capture 20% of transactions
  integrations: [
    Sentry.fastifyIntegration(),
  ],
});
```

Add `SENTRY_DSN` to `.env.example`:
```bash
SENTRY_DSN=                                   # from sentry.io project settings
```

### How to capture errors in route handlers

```typescript
// In any try/catch block:
try {
  // ...
} catch (err) {
  Sentry.captureException(err, {
    extra: { conversationId, businessId },
    user: { id: request.user?.sub, role: request.user?.role },
  });
  throw err;   // still let Fastify handle the HTTP response
}
```

### Dashboard setup (dashboard/src/main.tsx — before ReactDOM.createRoot)

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect: React.useEffect,
    }),
  ],
  tracesSampleRate: 0.2,
});
```

Add to dashboard `.env.example`:
```bash
VITE_SENTRY_DSN=
```

Wrap the React app in `Sentry.ErrorBoundary` in `App.tsx`:

```typescript
import * as Sentry from "@sentry/react";

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. The team has been notified.</p>}>
      <Router>
        {/* routes */}
      </Router>
    </Sentry.ErrorBoundary>
  );
}
```

### Where to set it up

1. Go to sentry.io → create a free account
2. Create two projects: `resin-art-backend` (Node.js) and `resin-art-dashboard` (React)
3. Copy the DSN for each into your `.env` files
4. In demo mode (`NODE_ENV=development`), Sentry is disabled. Errors still log to the console.

---

## BetterStack (uptime monitoring)

**What it does:** pings `GET /health` every minute and alerts you by email and push notification if the server goes down. No code needed. Set up takes 5 minutes on betterstack.com.

**No npm package.** This is entirely external.

### Setup steps

1. Go to betterstack.com → create a free account
2. Click "New monitor" → HTTP monitor
3. URL: `https://your-replit-or-railway-url/health`
4. Check interval: 1 minute
5. Alert contacts: your email and phone number
6. Save

That's it. When your server is down, BetterStack calls you before the client notices. Keep the monitor URL updated every time you change hosting.

### The health endpoint must return this (already in the plan)

```typescript
// GET /health
app.get("/health", async () => ({
  ok: true,
  mode: process.env.DEMO_MODE === "true" ? "demo" : "live",
  timestamp: new Date().toISOString(),
}));
```

BetterStack checks that the response is HTTP 200. As long as the server is up and the DB connection is alive, return 200.

---

## Resend (email notifications)

**What it does:** sends transactional emails. Used for two things in the demo:

1. **Escalation email backup:** when a new escalation comes in, email the admin (and the assigned staff member if assigned) in case they miss the WhatsApp alert.
2. **Staff welcome email:** when the admin creates a new staff account, email the staff member their login credentials.

**Package:** `resend@6.30.0`

### Setup

```typescript
// backend/src/services/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEscalationAlert(opts: {
  to: string;
  staffName: string;
  reason: string;
  conversationId: string;
  customerName: string;
  lastMessage: string;
  dashboardUrl: string;
}) {
  await resend.emails.send({
    from: "Resin Art Assistant <alerts@yourdomain.com>",
    to: opts.to,
    subject: `⚠️ New escalation: ${opts.customerName}`,
    html: `
      <h2>Human attention required</h2>
      <p>Hi ${opts.staffName},</p>
      <p>A conversation needs your attention.</p>
      <table>
        <tr><td><b>Customer:</b></td><td>${opts.customerName}</td></tr>
        <tr><td><b>Reason:</b></td><td>${opts.reason}</td></tr>
        <tr><td><b>Last message:</b></td><td>${opts.lastMessage}</td></tr>
      </table>
      <p><a href="${opts.dashboardUrl}/escalations">Open in dashboard →</a></p>
    `,
  });
}

export async function sendStaffWelcome(opts: {
  to: string;
  name: string;
  email: string;
  temporaryPassword: string;
  dashboardUrl: string;
}) {
  await resend.emails.send({
    from: "Resin Art Assistant <noreply@yourdomain.com>",
    to: opts.to,
    subject: "Your dashboard access",
    html: `
      <h2>Welcome, ${opts.name}!</h2>
      <p>You have been added to the Resin Art dashboard.</p>
      <p><b>Login URL:</b> ${opts.dashboardUrl}/login</p>
      <p><b>Email:</b> ${opts.email}</p>
      <p><b>Password:</b> ${opts.temporaryPassword}</p>
      <p>Please change your password after first login.</p>
    `,
  });
}
```

### Where to call it

In `backend/src/services/notify.ts`, after creating the escalation record:

```typescript
import { sendEscalationAlert } from "./email.ts";

// Call after creating escalation
await sendEscalationAlert({
  to: adminEmail,
  staffName: "Asha",
  reason: escalation.reason,
  conversationId: escalation.conversationId,
  customerName: customer.name ?? customer.handleOrPhone,
  lastMessage: lastMessage.content?.slice(0, 200) ?? "",
  dashboardUrl: process.env.DASHBOARD_URL,
});
```

In `backend/src/routes/users.ts`, after creating a staff user:

```typescript
await sendStaffWelcome({
  to: newUser.email,
  name: newUser.name,
  email: newUser.email,
  temporaryPassword: rawPassword,   // the unhashed one, before argon2
  dashboardUrl: process.env.DASHBOARD_URL,
});
```

### Environment variables to add

```bash
RESEND_API_KEY=re_...              # from resend.com API keys
RESEND_FROM_DOMAIN=yourdomain.com  # must be a verified domain in Resend
DASHBOARD_URL=https://your-demo-url.replit.app
```

### Setup steps

1. Go to resend.com → create a free account (100 emails/day free)
2. Add and verify your domain, or use the Resend test address for the demo
3. Create an API key → paste into `.env`
4. For the demo, the "from" address can use Resend's shared domain: `onboarding@resend.dev`

---

## Upstash Redis (rate limiting and KB caching)

**What it does:** two jobs in this project:

1. **Rate limit `/auth/login`:** maximum 5 attempts per IP per 15 minutes. Prevents brute-force attacks on the admin password.
2. **Cache the knowledge base:** the KB is read on every single AI call. Caching it in Redis means one DB read per hour instead of one per message.

**Packages:** `@upstash/redis@1.39.0`, `@upstash/ratelimit@2.2.0`

### Setup (backend/src/lib/redis.ts)

```typescript
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// 5 requests per 15 minutes per IP, for login
export const loginRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:login",
  analytics: true,
});

// 10 requests per second per IP, for all other routes
export const apiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 s"),
  prefix: "rl:api",
  analytics: true,
});
```

### Apply rate limit in the login route (backend/src/routes/auth.ts)

```typescript
import { loginRatelimit } from "../lib/redis.ts";

// Inside POST /auth/login handler, before any DB call:
const ip = request.ip ?? "unknown";
const { success, remaining, reset } = await loginRatelimit.limit(ip);

if (!success) {
  const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
  reply.header("Retry-After", String(retryAfterSeconds));
  throw new AppError(429, "Too many login attempts. Try again in a few minutes.", "RATE_LIMITED");
}
```

### Cache the knowledge base (backend/src/ai/prompt.ts)

```typescript
import { redis } from "../lib/redis.ts";
import { db } from "../db/index.ts";
import { knowledgeBase } from "../db/schema.ts";
import { eq } from "drizzle-orm";

const KB_CACHE_KEY = (businessId: string) => `kb:${businessId}`;
const KB_CACHE_TTL = 60 * 60; // 1 hour in seconds

export async function getKnowledgeBase(businessId: string) {
  // Try cache first
  const cached = await redis.get<object>(KB_CACHE_KEY(businessId));
  if (cached) return cached;

  // Miss: read from DB and cache
  const [row] = await db
    .select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.businessId, businessId));

  if (!row) throw new Error(`No knowledge base for business ${businessId}`);

  await redis.setex(KB_CACHE_KEY(businessId), KB_CACHE_TTL, JSON.stringify(row.data));
  return row.data;
}

// Call this whenever the KB is updated via PUT /knowledge-base:
export async function invalidateKBCache(businessId: string) {
  await redis.del(KB_CACHE_KEY(businessId));
}
```

In `backend/src/routes/knowledge-base.ts`, call `invalidateKBCache` after every successful PUT.

### Environment variables to add

```bash
UPSTASH_REDIS_URL=https://...upstash.io  # from upstash.com console
UPSTASH_REDIS_TOKEN=...                  # from upstash.com console
```

### Setup steps

1. Go to upstash.com → create a free account
2. Create a Redis database → choose a region close to your server (Singapore for India)
3. Copy the REST URL and token → paste into `.env`
4. Free tier: 10,000 commands/day. More than enough for the demo.

---

## PWA — Progressive Web App (dashboard)

**What it does:** makes the dashboard installable on the owner's phone like an app. She taps "Add to Home Screen" and it sits on her home screen, opens full screen with no browser chrome, and can receive push notifications for escalations without needing the App Store or Play Store.

**Packages:** `vite-plugin-pwa@1.3.0`, `workbox-window@7.4.1`

### Vite config (dashboard/vite.config.ts)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Resin Art Assistant",
        short_name: "Resin Art",
        description: "Customer messaging dashboard",
        theme_color: "#10b981",          // emerald-500, matches your UI
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            // Cache API GET requests for 5 minutes
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,   // disable PWA in dev to avoid caching confusion
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
```

### Push notifications for escalations

When an escalation is created, the backend sends a Web Push notification to all subscribed admin and staff browsers.

**Backend:** `npm install web-push@4.x @types/web-push`

```typescript
// backend/src/services/push.ts
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:" + process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

// subscriptions stored in a simple push_subscriptions table in Postgres
export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; url: string }
) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // subscription expired → delete it from DB
    if ((err as any).statusCode === 410) {
      await deletePushSubscription(subscription.endpoint);
    }
  }
}
```

**Generate VAPID keys once:**
```bash
npx web-push generate-vapid-keys
```

**Add to `.env.example`:**
```bash
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=your@email.com
```

**Dashboard: subscribe on login (dashboard/src/hooks/usePushNotifications.ts)**

```typescript
import { useEffect } from "react";
import { useAuth } from "./useAuth.ts";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;

    async function subscribe() {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return;   // already subscribed

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });

      // Save subscription to backend
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(sub),
      });
    }

    Notification.requestPermission().then((perm) => {
      if (perm === "granted") subscribe();
    });
  }, [user]);
}
```

Call `usePushNotifications()` in `App.tsx` after auth is loaded.

**New backend route needed: `POST /push/subscribe`**
Saves the push subscription (endpoint, keys) to a `push_subscriptions` table. Tied to the user ID from JWT.

**New DB table:**
```typescript
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull(),
  businessId: businessId(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("push_user_endpoint_idx").on(t.userId, t.endpoint),
]);
```

### Icons to create

Create two PNG icons and put them in `dashboard/public/`:
- `icon-192.png` — 192×192px, your logo or initials on emerald background
- `icon-512.png` — 512×512px, same

Use any image editor or a free tool like realfavicongenerator.net.

**Add to dashboard `.env.example`:**
```bash
VITE_VAPID_PUBLIC_KEY=             # the public key from generate-vapid-keys
```

---

## Updated package lists (backend and dashboard)

Add these to the existing packages in the package.json sections above:

### Backend — add to dependencies

```json
"resend": "6.30.0",
"@sentry/node": "11.0.0",
"@upstash/redis": "1.39.0",
"@upstash/ratelimit": "2.2.0",
"web-push": "4.0.0"
```

### Backend — add to devDependencies

```json
"@types/web-push": "3.6.4"
```

### Dashboard — add to dependencies

```json
"@sentry/react": "11.0.0",
"workbox-window": "7.4.1"
```

### Dashboard — add to devDependencies

```json
"vite-plugin-pwa": "1.3.0"
```

---

## Updated environment variables (.env.example — full list)

```bash
# Server
PORT=3001
NODE_ENV=development
DEMO_MODE=true
DASHBOARD_URL=https://your-demo-url.replit.app

# Auth
JWT_SECRET=change_this_to_64_random_chars_minimum
JWT_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Meta (leave empty in demo mode)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=

# Instagram
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=

# WhatsApp Cloud API
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# Owner alerts
OWNER_ALERT_PHONE=
OWNER_WHATSAPP_TOKEN=

# Token encryption
ENCRYPTION_KEY=                    # openssl rand -hex 32

# Demo business
BUSINESS_ID=resin-art-demo-business-01

# Sentry
SENTRY_DSN=                        # from sentry.io

# Upstash Redis
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Resend email
RESEND_API_KEY=re_...
RESEND_FROM_DOMAIN=yourdomain.com

# Push notifications (VAPID)
VAPID_PUBLIC_KEY=                  # from: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_EMAIL=your@email.com
```

```bash
# dashboard/.env (Vite reads VITE_ prefix only)
VITE_SENTRY_DSN=
VITE_VAPID_PUBLIC_KEY=
VITE_API_URL=http://localhost:3001
```

---

## Updated build order (with demo additions)

```
1.  backend/src/config.ts                    env validation (all new vars included)
2.  backend/src/db/schema.ts                 add push_subscriptions table
3.  npm run db:generate && db:migrate
4.  backend/src/lib/redis.ts                 Upstash Redis + rate limiters
5.  backend/src/index.ts + health.ts         Sentry init at very top
6.  backend/src/routes/auth.ts               login with rate limit
7.  backend/src/middleware/                  authenticate, requireAdmin
8.  backend/src/services/email.ts            Resend: escalation alert + staff welcome
9.  backend/src/services/push.ts             web-push: VAPID setup + send function
10. backend/src/routes/push.ts               POST /push/subscribe
11. backend/src/routes/simulate.ts           fake message endpoint
12. backend/src/queue/                       pg-boss + worker
13. backend/src/ai/                          pipeline (uses getKnowledgeBase with Redis cache)
14. backend/src/queue/jobs/processMessage.ts wire together: AI + rules + email + push
15. backend/src/services/send.ts             demo mode logging
16. Test scenarios 1–3 end to end
17. dashboard: Sentry init in main.tsx
18. dashboard: PWA setup in vite.config.ts + icons
19. dashboard: usePushNotifications hook in App.tsx
20. dashboard: Login, AdminInbox, StaffEscalations, ChatView
21. Test all 10 demo scenarios
22. Test rate limit: 6 wrong logins → 429 response
23. Test push: escalation triggers browser notification
24. Test email: escalation sends email to admin inbox
25. Seed admin + staff, verify staff cannot access admin routes
26. Client demo and sign-off → then Meta integration
```

---

## PHASE 2 — DO NOT BUILD UNTIL DEMO IS SIGNED OFF

These are planned for after the client approves the demo. Claude Code must not implement any of these during the demo phase. They are listed here so the architecture does not block them later.

| Technology | Purpose | When |
|---|---|---|
| Cloudflare R2 | Store customer photos from Meta (CDN links expire) | Before Meta integration |
| Trigger.dev | Replace pg-boss with a visual job dashboard | After live pilot |
| Posthog | Product analytics: feature usage, response times | After first live week |
| Stripe / Razorpay | Subscription billing for SaaS | Before second client |
| Cloudflare Workers | Edge webhook receiver, globally distributed | Scaling phase |
| OpenTelemetry + Axiom | Distributed tracing for slow requests | When SLA matters |
| Embedded Signup (Meta) | Let other businesses connect their own WhatsApp | SaaS onboarding |

