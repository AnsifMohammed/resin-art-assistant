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
Customer    { id, businessId, channelId, name|null, handleOrPhone, language|null, notes|null, createdAt, updatedAt }
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
`200 { paused: boolean, channels: Array<{ id, type, identifier, status, tokenExpiresAt }> }`
(`paused` is stored as `businesses.settings.automation_paused`.)

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
Query: `from?`, `to?` (ISO; default last 7 days).
```ts
200 {
  from, to,
  messages: { total, inbound, outbound },
  autoReplies: number,
  escalations: number,
  autoReplyRate: number,            // 0..1
  escalationRate: number,           // 0..1
  avgResponseTimeSeconds: number | null,
  avgHumanResponseTimeSeconds?: number | null,
  byChannel?: { instagram: { inbound, outbound }, whatsapp: { inbound, outbound } },
  byReason?: { [reason]: number },
  daily?: Array<{ date: "YYYY-MM-DD", inbound, autoReplies, escalations }>
}
```

## Audit log (admin only)

### GET /audit-log
Query: `page?`, `limit?`, `actorId?`, `action?`. Newest first.
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
`202 { ok: true, messageId: string|null, conversationId, state, queued: "queued"|"batched"|"inline", decision: null }`
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
| `message:new` | admins | `{ conversationId, message: Message }` | every stored message: inbound customer (simulate, webhook), AI auto-reply (incl. a failed send, `deliveryStatus: "failed"`), owner/staff reply (incl. failed), owner echo from the phone app (a `system` message would go through the same helper; none are created today) |
| `message:new:<conversationId>` | subscribers of that topic (staff re-authorized at delivery) | same as `message:new` | same as `message:new` |
| `conversation:updated` | admins | `{ conversationId, state, tag }` | escalation (AI rule, window closed, processing failure), auto-reply (tag), owner/staff reply (`owner_handling`), resolve (`ai_active`), echo (`owner_handling`), pause (`paused`) / resume (`ai_active`) |
| `escalation:new` | admins + all staff | `{ escalationId, conversationId, reason, customerName }` | every escalation creation path (AI decision, `window_closed`, `parse_error` after failures / dead letter) |
| `escalation:assigned` | admins | `{ escalationId, conversationId, assignedToUserId: string\|null }` | `POST /escalations/:id/assign` (assign, reassign, unassign) |
| `escalation:assigned:<userId>` | that staff member only | same as `escalation:assigned` | when they become the assignee, and when they stop being it (reassign/unassign) |
| `settings:updated` | admins | `{ paused: boolean }` | `POST /settings/pause` |
| `subscription:revoked` | the affected staff member | `{ event: "message:new:<id>", conversationId }` | their access ended (resolved, reassigned to someone else); the subscription is dropped |

`reason` is one of the `escalation_reason` enum values: `intent_complaint`, `intent_refund`, `intent_unknown`,
`intent_off_topic`, `intent_payment`, `missing_facts`, `always_escalate_phrase`, `payment_claim`, `unapproved_intent`,
`window_closed`, `parse_error`, `manual`.

### Scoping rules (enforced in `backend/src/realtime/websocket.ts`)

- Every event is delivered only to sockets whose JWT `businessId` matches the event's business.
- Staff never receive `message:new`, `conversation:updated`, `escalation:assigned` or `settings:updated`.
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
| `subscription:revoked` | not received | invalidate escalations + that conversation (chat then shows "not assigned to you") |
