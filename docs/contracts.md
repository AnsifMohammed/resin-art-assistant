# API contracts (dashboard ⇄ backend)

Source of truth for request/response shapes the dashboard relies on.
TypeScript mirror: `dashboard/src/types/index.ts`. Keep both in sync.

Every endpoint below is implemented in `backend/src/routes`; shapes are copied from the code.

## Conventions

- Base URL: the dashboard calls `/api/*`; the Vite dev proxy strips `/api` and forwards to `http://localhost:3001`.
  Backend routes are therefore mounted **without** an `/api` prefix (as in CLAUDE.md).
- JSON everywhere. Keys are **camelCase** (Drizzle row keys), except the knowledge-base `data` blob, which is stored
  and returned verbatim (snake_case, see `docs/knowledge-base.json`).
- Timestamps: ISO-8601 strings.
- Auth: `Authorization: Bearer <jwt>` on every route except `/health`, `/auth/login`, `/webhook`.
- Errors: `{ "error": string, "code": string }`; validation errors may add `details: [{ path, message }]`.
  - A 401 on any authenticated call makes the dashboard drop the token and go to `/login`.
  - 429 responses should send `Retry-After: <seconds>`. If the dashboard is ever served cross-origin
    (i.e. `VITE_API_URL` set to another origin), CORS must include `exposedHeaders: ["Retry-After"]`.
- Never return `passwordHash` or `encryptedToken`.
- Pagination envelope (list endpoints that page): `{ <items>: [...], pagination: { page, limit, total } }`.
  Defaults: `page=1`, `limit=20`, max `limit=100`.

## Entities (JSON form of schema.ts rows)

```ts
User        { id, businessId, name, email, role: "admin"|"staff", active, lastLoginAt|null, createdAt, updatedAt }
Channel     { id, businessId, type: "instagram"|"whatsapp", identifier, tokenExpiresAt|null, status, createdAt, updatedAt }
Customer    { id, businessId, channelId, name|null, handleOrPhone, language|null, notes|null, city|null,
              isFavourite, isPriority, optedOut, optedOutAt|null, optOutSource: "keyword"|"admin"|null,
              createdAt, updatedAt }
Conversation{ id, businessId, customerId, channelId, state, tag|null, lastCustomerMessageAt|null, windowClosesAt|null,
              lastMessageAt|null, adminLastReadAt|null, createdAt, updatedAt }
Message     { id, conversationId, businessId, direction, senderType, senderId|null, content|null, mediaUrls: string[],
              metaMessageId|null, deliveryStatus|null, metadata: object, createdAt }
Escalation  { id, businessId, conversationId, reason, assignedToUserId|null, assignedByUserId|null, assignedAt|null,
              alertedAt|null, remindedAt|null, resolvedAt|null, resolvedByUserId|null, createdAt }
MessageTemplate { id, name, category: "delivery"|"festive"|"custom_order"|"payment"|"general",
              channel: "whatsapp"|"instagram"|"both", body, variables: string[], isActive,
              metaTemplateName|null, metaStatus: "not_submitted"|"pending"|"approved"|"rejected",
              createdByUserId|null, updatedByUserId|null, createdAt, updatedAt }
AiDecisionSummary { intent, escalate, escalateReason|null, factsUsed: string[], missingFacts: string[],
              languageDetected|null, suggestedTag|null, sent, createdAt }
AuditLogEntry { id, businessId, actorId|null, actorType, action, conversationId|null, escalationId|null,
                targetUserId|null, details: object, createdAt, actorName?: string|null }

UserRef     { id, name }
CustomerRef { id, name|null, handleOrPhone }
MessagePreview { content|null, senderType, createdAt }
```

## Public

### GET /health
`200 { ok: true, mode: "demo"|"live", timestamp }`

### POST /auth/login
Body `{ email, password }`
`200 { token, user: { id, name, email, role, businessId } }`
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DEACTIVATED`, `429 RATE_LIMITED` (+ `Retry-After`).

## Auth

### GET /auth/me
`200 { user: { id, name, email, role, businessId } }` (read from the users row).
Deactivated user → `403 ACCOUNT_DEACTIVATED`; every authenticated route performs the same account check.

### POST /auth/logout
`200 { ok: true }` (stateless).

## Conversations

### GET /conversations (admin only; staff → 403)
Query: `state?`, `tag?`, `channel?` (`instagram|whatsapp`), `page?`, `limit?`,
`search?` (trimmed, max 100; empty is ignored; case-insensitive substring of customer name, customer handle/phone or the
last message's content; `%`/`_` match literally), `unread?` (`"true"|"false"`; `"true"` → unread only, `"false"` → no filter).
Sort: `lastMessageAt desc nulls last`, then `createdAt desc`.
`lastMessageAt` is set on every stored message (customer, AI, owner/staff reply, echo); existing rows were backfilled
by migration 0002.
`unread` = `lastCustomerMessageAt` is set AND (`adminLastReadAt` is null OR `lastCustomerMessageAt > adminLastReadAt`).
```ts
200 {
  conversations: Array<Conversation & {
    customer: CustomerRef;
    channelType: "instagram"|"whatsapp";
    lastMessage: MessagePreview | null;
    openEscalation: { id, reason, assignedToUserId, createdAt } | null;
    unread: boolean;
  }>;
  pagination: { page, limit, total };
}
```
Errors: `400 VALIDATION_ERROR` (bad enum, `search` > 100 chars, ...).

### GET /conversations/:id
Admin: any conversation in the business. Staff: only when an **open** escalation exists for it that is assigned to them
or unassigned, else `403 "Not assigned to you"`. Unknown/other business → `404`.
```ts
200 {
  conversation: Conversation & {
    customer: Customer;
    channelType: "instagram"|"whatsapp";
    messages: Array<Message & { aiDecision?: AiDecisionSummary }>;   // oldest first
    openEscalation: (Escalation & { assignedTo: UserRef | null }) | null;
  }
}
```
`aiDecision` (admin only, never for staff): present on inbound `customer` messages that have an `ai_decisions` row with
that `messageId` (latest row wins). The AI links its decision to the **last** message of a batch, so earlier messages of
the same batch have none.

### POST /conversations/:id/read (admin only)
Sets `adminLastReadAt = now()`. `204` (no body). Errors: `403 FORBIDDEN` (staff), `404 NOT_FOUND`.

### POST /conversations/:id/pause (admin only)
`ai_active` | `owner_handling` → `paused` (the AI worker skips any conversation that is not `ai_active`).
Already `paused` → returned unchanged (no audit, no event). Audit `conversation_paused` `{ from, to }`, emits
`conversation:updated`.
`200 { conversation: { id, state: "paused", tag } }`
Errors: `409 ESCALATION_OPEN` ("Resolve the escalation before pausing") when `escalated`, `409 STATE_CONFLICT` if the
state changed concurrently, `403` staff, `404 NOT_FOUND`.

### POST /conversations/:id/resume (admin only)
`paused` → `ai_active`. Audit `conversation_resumed` `{ from, to }`, emits `conversation:updated`.
Messages that arrived while paused are not re-processed; the AI answers the next customer message.
`200 { conversation: { id, state: "ai_active", tag } }`
Errors: `409 NOT_PAUSED` when the conversation is not paused, `403` staff, `404 NOT_FOUND`.

### POST /conversations/:id/reply
Same access rule as GET /conversations/:id. Body is exactly one of:
- `{ text }` (1..4096 chars), or
- `{ templateId, variables?: Record<string, string> }` — renders an **active** template of the business.
  `customerName` is pre-filled with the customer's name (or handle/phone); values in `variables` win.

Sending both or neither (or extra keys) → `400 VALIDATION_ERROR`.
Effects: inserts outbound message (`senderType` = `"owner"` for admin, `"staff"` for staff; `senderId` = user id;
template replies also store `metadata: { templateId, templateName }`), sends via `send.ts` (templates are sent as their
rendered text; live mode will send the approved Meta template by `metaTemplateName`), sets `state = "owner_handling"`
and `lastMessageAt`, writes `audit_log` `reply_sent` `{ messageId, preview }` or `template_reply_sent`
`{ messageId, templateId, preview }`.
```ts
201 { message: Message, conversation: { id, state } }
```
Errors (in check order):
- `400 VALIDATION_ERROR` — bad body.
- `404 NOT_FOUND` — conversation; `403 FORBIDDEN` — staff not assigned.
- `404 TEMPLATE_NOT_FOUND` — unknown, inactive or other business's template.
- `400 TEMPLATE_CHANNEL_MISMATCH` — template `channel` is `whatsapp`/`instagram` and differs from the conversation's.
- `409 WINDOW_CLOSED` — `windowClosesAt` has passed: always for `text`; for a template unless it has
  `metaTemplateName` set **and** `metaStatus = "approved"` (message "Only approved WhatsApp templates can be sent
  after 24 hours").
- `409 CHANNEL_NOT_FOUND` — conversation has no channel/customer.
- `400 TEMPLATE_VARIABLES_MISSING` — `error: "Missing template variables: a, b"`,
  `details: [{ path: "<variable>", message: "required" }]` (empty/blank values count as missing).
- `400 TEMPLATE_TOO_LONG` — rendered text over the conversation channel's limit (WhatsApp 1024, Instagram 1000).
- `501`/`502` send failures as before.

### POST /conversations/:id/resolve
Same access rule. Sets `state = "ai_active"`, sets `resolvedAt/resolvedByUserId` on the open escalation, writes
`audit_log` `conversation_resolved` (+ state change).
```ts
200 { conversation: { id, state: "ai_active" }, escalation: Escalation | null }
```

### GET /conversations/:id/orders (admin + staff)
Admin: any conversation of the business; staff: only if assigned to an open escalation or unassigned
(`staffCanAccessConversation`), else `403 FORBIDDEN` ("Not assigned to you").
Returns non-deleted orders for that conversation's customer (`orders.customerId = conversation.customerId`), newest first. Read-only.
```ts
200 {
  orders: Array<{
    id: string,
    orderNo: string,
    status: OrderStatus,
    totalAmount: number,
    createdAt: string,
    expectedDeliveryDate: string | null,
    items: Array<{ productName: string, quantity: number }>
  }>
}
```

## Message templates

Ready-made messages inserted into replies. `{variableName}` placeholders (`\w+`); `variables` is always computed from
`body` on the server (unique, first-seen order; a client-sent `variables` is ignored). Body length limit per channel:
`whatsapp` 1024, `instagram` 1000, `both` 1000. All routes are scoped to the caller's business.
Not-found anywhere below → `404 TEMPLATE_NOT_FOUND`. Validation errors → `400 VALIDATION_ERROR` with
`details: [{ path, message }]`.

### GET /templates (admin + staff)
Query: `category?`, `channel?` (`whatsapp|instagram` → templates for that channel **or** `both`),
`active?` (`true|false|all`, default `all`). Staff always get active templates only (`active` is ignored).
Sort: `category`, then `name`.
`200 { templates: MessageTemplate[] }`

### GET /templates/:id (admin + staff)
`200 { template: MessageTemplate }`. Staff get `404` for an inactive template.

### POST /templates (admin only)
Body `{ name, category, channel?, body, isActive?, metaTemplateName?, metaStatus? }`
- `name` trimmed 1..80, unique per business (`409 TEMPLATE_NAME_TAKEN`)
- `channel` default `"both"`; `body` trimmed, 1..limit for `channel`
- `isActive` default `true`; `metaTemplateName` `null` or `/^[a-z0-9_]{1,512}$/` (default `null`);
  `metaStatus` default `"not_submitted"`

Sets `createdByUserId`/`updatedByUserId`. Audit `template_created` `{ templateId, name }`.
`201 { template: MessageTemplate }`

### PATCH /templates/:id (admin only)
Body: any subset of the POST fields. `variables` recomputed when `body` changes; the resulting body is re-checked
against the resulting channel's limit. Renaming onto another template's name → `409 TEMPLATE_NAME_TAKEN`.
Sets `updatedByUserId`. Audit `template_updated` `{ templateId, name }`.
`200 { template: MessageTemplate }`

### DELETE /templates/:id (admin only)
Hard delete. Audit `template_deleted` `{ templateId, name }`. `204` (no body).

### POST /templates/:id/duplicate (admin only)
Copies the template as `"<name> (Copy)"`, or `"(Copy 2)"`, `"(Copy 3)"`… (first free name), with
`metaTemplateName: null`, `metaStatus: "not_submitted"`. Audit `template_duplicated` `{ templateId, name }` (the copy).
`201 { template: MessageTemplate }`

Staff calling POST/PATCH/DELETE/duplicate → `403 FORBIDDEN`.

## Customers (admin only)

Staff calling any route below → `403 FORBIDDEN`. All routes are scoped to the caller's business.

### Segments (shared with broadcasts, `backend/src/lib/segments.ts`)

"Orders" = the customer's `orders` rows with `isDeleted = false` and `status <> "cancelled"`.

| Segment | Rule |
|---|---|
| `all` | every customer |
| `favourites` | `isFavourite` |
| `priority` | `isPriority` |
| `previous_buyers` | ≥ 1 order |
| `repeat_buyers` | ≥ 2 orders |
| `new` | customer `createdAt` within the last 14 days (`NEW_DAYS`) |
| `never_ordered` | 0 orders |
| `inactive` | ≥ 1 order and the latest order is older than 90 days (`INACTIVE_DAYS`) |

Filters (AND-ed with the segment): `city` (trimmed, case-insensitive exact match), `language` (exact),
`excludeComplaints` (drop customers with **any** escalation, open or resolved, whose reason is `intent_complaint` or
`intent_refund`).

```ts
CustomerSegment = "favourites"|"priority"|"previous_buyers"|"repeat_buyers"|"new"|"never_ordered"|"inactive"
Segment         = "all" | CustomerSegment

CustomerListItem {
  id, name|null, handleOrPhone, channel: "whatsapp"|"instagram", city|null, language|null, notes|null,
  isFavourite, isPriority, optedOut, optedOutAt|null, createdAt,
  conversationId|null,            // latest conversation (by lastMessageAt, then createdAt)
  conversationState|null,         // its state
  lastMessageAt|null,             // its lastMessageAt
  ordersCount: number, totalSpend: number /* rupees */, lastOrderAt|null,
  segments: CustomerSegment[]     // every segment (except "all") this customer is in
}
```

### GET /customers
Query: `segment?` (default `all`), `search?` (trimmed, ≤ 100; ILIKE on name, handleOrPhone and city; `%`, `_`, `\`
match literally; empty = ignored), `city?`, `language?`, `channel?` (`whatsapp|instagram`),
`sort?` (`recent` = latest conversation's `lastMessageAt` desc, nulls last — default; `spend` = totalSpend desc;
`orders` = ordersCount desc; `name` = name asc, nulls last), `page?` (default 1), `limit?` (default **24**, max 100).

`200 { customers: CustomerListItem[], pagination: { page, limit, total }, counts: Record<Segment, number> }`

`counts` are per segment for the **whole business**; `search`, `city`, `language` and `channel` are not applied to
them. `total` is the filtered total. Invalid query → `400 VALIDATION_ERROR` (`details`).

### GET /customers/:id
`200 { customer: CustomerListItem }`. Unknown / other business → `404 NOT_FOUND`.

### PATCH /customers/:id
Body (strict, all optional): `name` (trimmed 1..100 | null), `city` (trimmed ≤ 80 | null; `""` → null),
`notes` (trimmed ≤ 2000 | null; `""` → null), `isFavourite`, `isPriority`, `optedOut`.
- `optedOut: true` → `optedOutAt = now`, `optOutSource = "admin"`; `false` → both cleared.
- Fields equal to the current value are ignored; nothing changed → no write, no audit, no event.
- Audit `customer_updated` `{ customerId, fields: string[] }` (profile/flag fields) and `customer_opted_out` /
  `customer_opted_in` `{ customerId, source: "admin" }` when `optedOut` changes. Emits `customer:updated`.

`200 { customer: CustomerListItem }`. Errors: `400 VALIDATION_ERROR` (incl. unknown keys), `404 NOT_FOUND`.

### GET /customers/:id/orders
Newest first, deleted orders excluded (cancelled orders are included).
`200 { orders: [{ id, orderNo, status, totalAmount: number, createdAt, itemsCount: number }] }`. `404 NOT_FOUND`.

### Opt-out by message (STOP / START)
Inbound customer messages (Meta webhook on WhatsApp **and** Instagram, and `POST /simulate/message`) are checked after
being stored. The text is trimmed, lowercased, inner whitespace collapsed and trailing punctuation stripped; only a
message that is **exactly** a keyword counts.
- `stop`, `unsubscribe`, `stop all`, `நிறுத்து` → `optedOut = true`, `optedOutAt = now`, `optOutSource = "keyword"`
  (a repeated STOP keeps the original time), audit `customer_opted_out` (`actorType: "system"`,
  `details: { customerId, source: "keyword", messageId }`), `customer:updated`, and an outbound **system** message
  `"You won't receive offers from us anymore. Reply START to subscribe again."` (`metadata.kind = "opt_out_ack"`).
- `start` from an **opted-out** customer → opt-out cleared, audit `customer_opted_in`, ack `"You're subscribed again 😊"`
  (`metadata.kind = "opt_in_ack"`). From a subscribed customer `start` is a normal message.
- In both cases the AI is **not** queued for that message. The ack is a normal `message:new`.

## Broadcasts (admin only)

One WhatsApp template sent to a customer segment. Staff → `403 FORBIDDEN`. Business-scoped.
Not found / other business → `404 NOT_FOUND`.

Audience = customers matching `segment` + `filters` whose channel is **whatsapp** and `optedOut = false`.
Limit: `BROADCAST_MAX_RECIPIENTS` (env, default 250). Sending pace: `BROADCAST_RATE_PER_SEC` (env, default 10).

Status flow: `draft → scheduled → sending → sent | failed`; `scheduled | sending → cancelled`.
`failed` = every recipient failed, or the job could not start (`error` says why: `template_not_approved`,
`template_variables_missing`, `empty_audience`, `audience_too_large`, `all_recipients_failed`).

```ts
BroadcastStatus  = "draft"|"scheduled"|"sending"|"sent"|"cancelled"|"failed"
BroadcastFilters { city?: string, language?: string, excludeComplaints?: boolean }
BroadcastStats   { pending, sent, delivered, read, failed }   // recipient counts by status
BroadcastSummary {
  id, name, templateId, templateName|null, segment: Segment, filters: BroadcastFilters,
  variables: Record<string, string>, status: BroadcastStatus, scheduledAt|null, startedAt|null, completedAt|null,
  recipientCount,            // audience snapshot size (0 until sending starts)
  error|null, stats: BroadcastStats, createdAt, createdByUserId|null
}
BroadcastRecipient {
  id, customerId, customerName|null, phone,
  status: "pending"|"sent"|"delivered"|"read"|"failed",
  error|null,                // e.g. "opted_out", "customer_not_found", send error, Meta error "131026: …"
  sentAt|null, deliveredAt|null, readAt|null
}
```

### GET /broadcasts/audience
Query: `segment?` (default `all`), `city?`, `language?`, `excludeComplaints?` (`true|false`).
`200 { count: number, max: number }` (`max` = `BROADCAST_MAX_RECIPIENTS`).

### GET /broadcasts
Query: `status?`, `page?` (default 1), `limit?` (default 20, max 100). Newest first.
`200 { broadcasts: BroadcastSummary[], pagination: { page, limit, total } }`

### GET /broadcasts/:id
Query: `page?` (default 1), `limit?` (default 50, max 200) — pages the recipients (snapshot order).
`200 { broadcast: BroadcastSummary, recipients: BroadcastRecipient[], pagination: { page, limit, total } }`

### POST /broadcasts
Body (strict):
```ts
{ name: string /* trimmed 1..100 */, templateId: string, segment: Segment,
  filters?: BroadcastFilters /* strict; city ≤ 80, language ≤ 40 */,
  variables?: Record<string, string /* ≤ 1000 */>,
  scheduledAt?: string /* ISO with offset */ | null,
  action: "draft" | "schedule" | "send_now" }
```
Checks, in order:
1. Payload → `400 VALIDATION_ERROR` (`details`).
2. `action: "schedule"` needs `scheduledAt` ≥ now + 1 min → otherwise `400 VALIDATION_ERROR`
   (`details: [{ path: "scheduledAt", … }]`). A draft may carry a `scheduledAt` (same rule); `send_now` ignores it.
3. Template must be this business's, active, channel `whatsapp|both`, with `metaTemplateName` set and
   `metaStatus: "approved"` → otherwise `400 TEMPLATE_NOT_APPROVED` ("Broadcasts need a WhatsApp template approved by
   Meta"; also for an unknown template id).
4. Every template variable except `customerName` needs a non-blank value in `variables` →
   `400 TEMPLATE_VARIABLES_MISSING`, `details: [{ path: "<variable>", message: "required" }]`.
   `{customerName}` is always filled per recipient (customer name, else phone).
5. Audience count: `0` → `400 EMPTY_AUDIENCE`; `> max` → `409 AUDIENCE_TOO_LARGE`, `details: { count, max }`.

Result: `draft` → status `draft`; `schedule` → `scheduled`; `send_now` → `sending` (`startedAt = now`) and the send job
is queued. Audit `broadcast_created` `{ broadcastId, name, segment, status }`, plus `broadcast_scheduled` or
`broadcast_started`. Emits `broadcast:updated`. `201 { broadcast: BroadcastSummary }`

### PATCH /broadcasts/:id
Only `draft` or `scheduled` → otherwise `409 BROADCAST_LOCKED`.
Body (strict, all optional): `name`, `templateId`, `segment`, `filters`, `variables`, `scheduledAt`,
`action?: "schedule" | "send_now"` (move forward; without `action` the status is kept). Template, variables and
audience are re-validated on the merged values (same errors as POST); a scheduled broadcast's `scheduledAt` must stay
≥ now + 1 min. If the dispatcher started it meanwhile → `409 BROADCAST_LOCKED`.
Audit `broadcast_updated` (+ `broadcast_scheduled` / `broadcast_started`). `200 { broadcast: BroadcastSummary }`

### POST /broadcasts/:id/cancel
`scheduled` or `sending` → `cancelled` (`completedAt = now`), atomically (guarded on the status read). A sending job
stops before its next batch of 50, so up to one batch may still go out; unsent recipients stay `pending`.
Any other status → `409 BROADCAST_LOCKED`. Audit `broadcast_cancelled` `{ broadcastId, name, from }`.
`200 { broadcast: BroadcastSummary }`

### DELETE /broadcasts/:id
Drafts only (`409 BROADCAST_LOCKED` otherwise). Audit `broadcast_deleted`. `204`.

### Sending (queue)
- `dispatch-broadcasts` (cron, every minute): `UPDATE … SET status='sending', startedAt=now WHERE status='scheduled'
  AND scheduledAt <= now RETURNING id` → one `send-broadcast` job each (also re-queues `sending` broadcasts started
  > 5 min ago, in case a job was lost). Without pg-boss the same check runs in-process every minute.
- `send-broadcast` (`singletonKey = broadcastId`): snapshots the audience into recipients once (re-checked: empty or
  over the limit → `failed`), then sends pending recipients in batches of 50 at `BROADCAST_RATE_PER_SEC`. Each send
  re-checks opt-out (`failed`, `error: "opted_out"`). If the customer has a conversation, the rendered text is also
  stored there as an outbound message (`senderType: "system"`, `metadata: { kind: "broadcast", broadcastId,
  templateId }`, `message:new` emitted; `conversation.lastMessageAt` is not bumped); no conversation is ever created.
  Ends `sent` (≥ 1 recipient reached) or `failed`; audit `broadcast_sent` `{ broadcastId, name, status, ...stats }`.
  Retries only touch `pending` recipients.
- Delivery receipts: WhatsApp webhook `statuses[]` (`sent|delivered|read|failed`) update recipients and
  `messages.deliveryStatus` by Meta message id, forward-only (`pending < sent < delivered < read`; `failed` only from
  `pending`/`sent`). Note: `sendMessage` returns `metaMessageId: null` in DEMO_MODE (live sending is not implemented
  yet), so receipts only apply once live sending stores Meta ids.

## Escalations

### GET /escalations
Query: `resolved?` (`true|false`; default `false` = open only).
Admin: all in the business. Staff: always open only, `assignedToUserId = me OR NULL` (ignore `resolved=true`).
Sort: oldest open first (most urgent).
```ts
200 {
  escalations: Array<Escalation & {
    assignedTo: UserRef | null;
    conversation: { id, state, tag, windowClosesAt, lastCustomerMessageAt,
                    channelType, customer: CustomerRef, lastMessage: MessagePreview | null };
  }>
}
```

### POST /escalations/:id/assign (admin only)
Body `{ userId: string | null }` — `null` un-assigns (back to the shared queue). `userId` must be an active staff user in
the same business, else `400`. Sets `assignedByUserId`, `assignedAt`; audit `escalation_assigned`.
```ts
200 { escalation: Escalation & { assignedTo: UserRef | null } }
```

## Users (admin only)

### GET /users
Staff users only (never admins).
`StaffUser = { id, name, email, role: "staff", active, lastLoginAt: string|null, createdAt }`
`200 { users: StaffUser[] }`

### POST /users
Body `{ name, email, password }` (password ≥ 8). Role is always `"staff"`. Duplicate email → `409 EMAIL_TAKEN`.
Sends the welcome email. Audit `user_created` with `targetUserId`.
`201 { user: StaffUser }`

### PATCH /users/:id
Body `{ active: boolean }`. Cannot target an admin (`403`). Audit `user_deactivated` / `user_reactivated`.
Deactivation takes effect immediately: the user's cached account status is dropped and their open WebSocket
connections are closed with code `4403` (on every API process).
`200 { user: StaffUser }`

## Settings (admin only)

### GET /settings
```ts
200 {
  paused: boolean,                       // businesses.settings.automation_paused
  channels: Array<{ id, type, identifier, status, tokenExpiresAt }>,
  businessHours: {
    enabled: boolean,                    // default false
    open: "HH:mm",                       // 24h, default "09:00"
    close: "HH:mm",                      // 24h, default "21:00"; always after open
    days: Array<"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun">  // default all 7; returned in week order
  },
  awayMessage: {
    enabled: boolean,                    // default false
    text: string                         // 1–500 chars, default "Hi! We're closed right now 🌙 We'll reply as soon as we're back."
  },
  windowAlerts: {
    enabled: boolean,                    // default false
    thresholdMinutes: 60 | 120 | 240,    // default 120
    target: "push" | "whatsapp"          // default "push"
  }
}
```
Missing (or unreadable) stored sections are returned with the defaults above, field by field.
Storage: `businesses.settings` jsonb keys `business_hours`, `away_message`, `window_alerts` (values camelCase as above),
next to `automation_paused`.

> **Stored only.** Business hours, the away message and window alerts are saved and returned, but nothing acts on them
> yet: no away message is sent outside business hours and no 24h-window alerts are sent.

### PATCH /settings
Body (strict — unknown keys → 400): `{ businessHours?, awayMessage?, windowAlerts? }`, at least one section.
Each section may be partial; it is merged onto the current (or default) value and the **merged** result is validated:
`open`/`close` must be `HH:mm` 24h (`00:00`–`23:59`) with `close > open`; `days` non-empty, unique, from the 7 day codes;
`text` trimmed, 1–500 chars; `thresholdMinutes` ∈ {60, 120, 240}; `target` ∈ {"push", "whatsapp"}.
Errors: `400 { error: "Validation failed", code: "VALIDATION_ERROR", details: [{ path: "businessHours.close", message }] }`.
Only the changed sections are written (atomic jsonb `||` merge), so `automation_paused` and any other keys are kept.
Audit `settings_updated` with `details: { changed: ["businessHours", ...], <section>: <new value> }`.
Emits `settings:updated` `{ paused }` to admins (payload unchanged; refetch `GET /settings` on it).
`200` → the full `GET /settings` shape.

### POST /settings/pause
Body `{ paused: boolean }`. Audit `automation_paused` / `automation_resumed`. Emits `settings:updated` to admins.
`200 { ok: true, paused: boolean }`

## Knowledge base (admin only)

### GET /knowledge-base
`200 { data: KnowledgeBaseData, updatedAt, updatedByUserId | null }`

### PUT /knowledge-base
Body `{ data: KnowledgeBaseData }` (full replace; wrapped in `data` so metadata can be added later).
Sets `updatedByUserId`, invalidates the Redis KB cache, audit `knowledge_base_updated`.
`200 { data, updatedAt, updatedByUserId }`

`KnowledgeBaseData` = the exact shape of `docs/knowledge-base.json`.

## Analytics (admin only)

### GET /analytics
Query: `from?`, `to?` (ISO-8601; default `to = now`, `from = now − 7 days`; `from > to` → 400),
`channel?`: `"whatsapp" | "instagram"` (anything else → 400).

Channel filter (when set): messages by their conversation's channel type, escalations by their conversation's channel
type, orders by `orders.channel`. It applies to every field **except** `channels`, which is always computed for both
channels. `byChannel` follows the filter (the other channel reads 0). `attention` and `orders.pending` are filtered too.

Previous period = the same length immediately before `from`: `[from − (to − from), from)`.
Days are IST calendar days (`Asia/Kolkata`), `"YYYY-MM-DD"`, one entry for **every** day from `from` to `to`
(inclusive, zero-filled). Money is in whole rupees (rounded numbers).
```ts
200 {
  from: string, to: string,
  messages: { total, inbound, outbound },
  autoReplies: number,                 // messages with senderType "ai"
  escalations: number,                 // escalations created in range
  autoReplyRate: number,               // 0..1 = autoReplies / (autoReplies + escalations); 0 when both are 0
  escalationRate: number,              // 0..1 = escalations / (autoReplies + escalations); 0 when both are 0
  avgResponseTimeSeconds: number | null, // average escalation RESOLUTION time (createdAt → resolvedAt) of escalations
                                         // created in range and resolved; null when none resolved
  byChannel: { whatsapp: { inbound, outbound }, instagram: { inbound, outbound } },
  byReason: { [reason]: number },

  messagesDaily: Array<{ date: "YYYY-MM-DD", inbound: number, outbound: number }>,
  revenue: {
    total: number,                     // sum(orders.totalAmount): createdAt in range, not deleted, status <> cancelled
    previous: number,                  // same, previous period
    daily: Array<{ date: "YYYY-MM-DD", revenue: number, orders: number }>  // orders = count of those orders
  },
  orders: {
    total: number,                     // count of non-deleted, non-cancelled orders created in range (same rule as revenue.daily)
    previousTotal: number,             // same, previous period
    confirmed: number,                 // orders in range with status confirmed|in_production|ready|dispatched|delivered
    previousConfirmed: number,         // same, previous period
    pending: number                    // CURRENT non-deleted orders with status pending (not range-bound)
  },
  channels: {                          // in range, both channels regardless of ?channel
    whatsapp:  { messages: number, revenue: number, orders: number },
    instagram: { messages: number, revenue: number, orders: number }
  },                                   // messages = inbound + outbound; revenue/orders as in `revenue`
  topProducts: Array<{                 // ALL items sold in range (no limit), sorted by revenue desc
    productId: string | null,          // grouped by productId, or by productName when productId is null
    name: string,                      // current product name, else the order item's productName
    imageUrl: string | null,           // products.images[0] when productId matches a product
    units: number,                     // sum(quantity)
    revenue: number                    // sum(quantity × unitPrice)
  }>,                                  // (non-deleted items of non-deleted, non-cancelled orders in range)
  attention: {                         // CURRENT values, not range-bound
    openEscalations: number,           // unresolved escalations
    oldestOpenEscalationAt: string | null, // ISO timestamp of the oldest unresolved escalation (or null)
    windowsClosingSoon: number,        // conversations in escalated|owner_handling with windowClosesAt in [now, now + 2h]
    pendingOrders: number,             // = orders.pending
    unpaidBalance: number              // Σ over non-deleted, non-cancelled orders of max(0, totalAmount − Σ paid payments)
  },
  trends: Record<"revenue" | "orders" | "messages" | "autoReplyRate" | "avgResponseTimeSeconds",
                 { current: number, previous: number, changePct: number | null }>,
    // revenue = revenue.total/previous; orders = orders.total/previousTotal;
    // messages = messages.total vs previous period; autoReplyRate = rate (0..1) vs previous period rate;
    // avgResponseTimeSeconds: null → 0 in current/previous, changePct null if either is null.
    // changePct = round((current − previous) / previous × 100); null when previous is 0 (or null).
  repliesBySender: { ai: number, owner: number, staff: number, system: number },  // outbound messages in range
  delivery: { failed: number, read: number }   // outbound messages in range with deliveryStatus failed / read
}
```

## Audit log (admin only)

### GET /audit-log
Query: `page?`, `limit?`, `actorId?`, `action?` (exact), `actorType?` (`"admin"|"staff"|"ai"|"system"`),
`actionPrefix?` (1–100 chars, e.g. `order_` or `payment_` → `action LIKE 'order\_%'`; `%`, `_` and `\` are escaped).
All filters combine with AND. Newest first.
`200 { entries: AuditLogEntry[], pagination: { page, limit, total } }` — include `actorName` (joined from users) if cheap.

## Push

### POST /push/subscribe
Body = `PushSubscription.toJSON()`: `{ endpoint, expirationTime?, keys: { p256dh, auth } }` → `200 { ok: true }`.
The service worker (`dashboard/public/push-sw.js`) expects push payload `{ title, body, url }` (matches `services/push.ts`).

### DELETE /push/subscribe
Body `{ endpoint }` → `200 { ok: true }` (only deletes the caller's own subscription).
The dashboard does not call it yet: on logout it calls `PushSubscription.unsubscribe()` locally, so the next send
returns 410 and the backend deletes the row.

## Simulate (DEMO_MODE only)

### POST /simulate/message
Admin only. Body `{ customerName, channel?: "whatsapp"|"instagram" (default whatsapp), text, imageUrl? }` →
`202 { ok: true, messageId: string|null, conversationId, state, queued: "queued"|"batched"|"inline"|"skipped",
optAction: "opt_out"|"opt_in"|null, decision: null }`
`queued: "skipped"` + `optAction` set: the text was a STOP/START keyword (see "Opt-out by message"); the AI was not queued.
The AI runs after the 10 s batching window; the outcome arrives over the WebSocket (`message:new`,
`conversation:updated`, `escalation:new`) and via `GET /conversations/:id`.

## Real-time (WebSocket)

Transport: raw WebSocket (`@fastify/websocket`). The dashboard selects it with `REALTIME_TRANSPORT = "websocket"` in
`dashboard/src/lib/realtime/index.ts` (`socket.io-client` from the CLAUDE.md package list is not used: a socket.io client
cannot talk to a raw WebSocket server). Whenever the socket is not connected the dashboard invalidates its mounted
queries every 5 s (polling fallback), and it refetches once after a reconnect.

### Connection

- `GET /ws?token=<jwt>` (through the Vite proxy: `/api/ws`, proxy has `ws: true`).
- Close codes: `4401` missing/invalid token or unknown account, `4403` deactivated account (also sent later if the admin
  deactivates the user), `1011` account check failed.
- Heartbeat: the server pings every 30 s and terminates sockets that did not answer the previous ping
  (browsers answer pings automatically).

### Frames

- Server → client: `{ "event": "<name>", "data": <payload> }`
- Client → server: `{ "type": "subscribe" | "unsubscribe", "event": "message:new:<conversationId>" }`.
  Only `message:new:<conversationId>` is subscribable; every other event is pushed by role.
  - Admin: allowed for any conversation id (events are business-scoped anyway).
  - Staff: allowed only while the conversation has an **open** escalation assigned to them or unassigned
    (same rule as `GET /conversations/:id`).
  - Replies: `subscribed { event }` on success, `subscription:denied { event, reason: "forbidden"|"unknown_event" }`
    otherwise. Subscriptions are re-sent by the dashboard after every reconnect.

### Events

| Event | Who receives it | Payload | Emitted when |
|---|---|---|---|
| `message:new` | admins | `{ conversationId, message: Message }` | every stored message: inbound customer (simulate, webhook), AI auto-reply (incl. a failed send, `deliveryStatus: "failed"`), owner/staff reply (incl. failed), owner echo from the phone app, `system` messages (STOP/START acknowledgements, broadcast sends into an existing conversation) |
| `message:new:<conversationId>` | subscribers of that topic (staff re-authorized at delivery) | same as `message:new` | same as `message:new` |
| `conversation:updated` | admins | `{ conversationId, state, tag }` | escalation (AI rule, window closed, processing failure), auto-reply (tag), owner/staff reply (`owner_handling`), resolve (`ai_active`), echo (`owner_handling`), pause (`paused`) / resume (`ai_active`) |
| `escalation:new` | admins + all staff | `{ escalationId, conversationId, reason, customerName }` | every escalation creation path (AI decision, `window_closed`, `parse_error` after failures / dead letter) |
| `escalation:assigned` | admins | `{ escalationId, conversationId, assignedToUserId: string\|null }` | `POST /escalations/:id/assign` (assign, reassign, unassign) |
| `escalation:assigned:<userId>` | that staff member only | same as `escalation:assigned` | when they become the assignee, and when they stop being it (reassign/unassign) |
| `settings:updated` | admins | `{ paused: boolean }` | `POST /settings/pause`, `PATCH /settings` |
| `customer:updated` | admins | `{ customerId }` | `PATCH /customers/:id` (when something changed), STOP/START keyword opt-out/in |
| `broadcast:updated` | admins | `{ broadcastId, status: BroadcastStatus, stats: BroadcastStats }` | every status change (create, schedule, send, dispatch, cancel, finish, fail) and sending/receipt progress (progress throttled to ≤ 1 per 2 s per broadcast, with a trailing emit) |
| `subscription:revoked` | the affected staff member | `{ event: "message:new:<id>", conversationId }` | their access ended (resolved, reassigned to someone else); the subscription is dropped |

`reason` is one of the `escalation_reason` enum values: `intent_complaint`, `intent_refund`, `intent_unknown`,
`intent_off_topic`, `intent_payment`, `missing_facts`, `always_escalate_phrase`, `payment_claim`, `unapproved_intent`,
`window_closed`, `parse_error`, `manual`.

### Scoping rules (enforced in `backend/src/realtime/websocket.ts`)

- Every event is delivered only to sockets whose JWT `businessId` matches the event's business.
- Staff never receive `message:new`, `conversation:updated`, `escalation:assigned`, `settings:updated`,
  `customer:updated` or `broadcast:updated`.
- Staff `message:new:<id>` delivery is re-checked against the escalation table at delivery time; on resolve or reassign
  the server also re-checks immediately and sends `subscription:revoked`, so a stale subscription never leaks messages.
- Events can originate in any API process (e.g. the pg-boss worker). `backend/src/realtime/bus.ts` delivers each event
  locally and broadcasts it with Postgres `NOTIFY realtime_events`; every process `LISTEN`s and applies the same scoping
  to its own sockets. Messages too large for a NOTIFY payload are sent by id and re-read from the database.

### Dashboard handling (`dashboard/src/context/RealtimeContext.tsx`)

| Event | Admin | Staff |
|---|---|---|
| `escalation:new` | toast (reason label) + invalidate escalations and conversations | toast + invalidate escalations |
| `conversation:updated` | invalidate conversations + escalations | not received |
| `escalation:assigned` | invalidate escalations + that conversation | not received |
| `escalation:assigned:<me>` | not received | invalidate escalations + that conversation |
| `message:new` | append to the cached thread, invalidate conversation lists + escalations | not received |
| `message:new:<id>` | append (open chat) | append (open chat) |
| `settings:updated` | update + invalidate `settings` | not received |
| `customer:updated` | invalidate `customers` + broadcast audience counts | not received |
| `broadcast:updated` | invalidate `broadcasts` (history, detail, audience) | not received |
| `subscription:revoked` | not received | invalidate escalations + that conversation (chat then shows "not assigned to you") |
