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
Conversation{ id, businessId, customerId, channelId, state, tag|null, lastCustomerMessageAt|null, windowClosesAt|null, createdAt, updatedAt }
Message     { id, conversationId, businessId, direction, senderType, senderId|null, content|null, mediaUrls: string[],
              metaMessageId|null, deliveryStatus|null, metadata: object, createdAt }
Escalation  { id, businessId, conversationId, reason, assignedToUserId|null, assignedByUserId|null, assignedAt|null,
              alertedAt|null, remindedAt|null, resolvedAt|null, resolvedByUserId|null, createdAt }
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
Query: `state?`, `tag?`, `channel?` (`instagram|whatsapp`), `page?`, `limit?`
Sort: most recent activity first (`lastCustomerMessageAt`/last message desc).
```ts
200 {
  conversations: Array<Conversation & {
    customer: CustomerRef;
    channelType: "instagram"|"whatsapp";
    lastMessage: MessagePreview | null;
    openEscalation: { id, reason, assignedToUserId, createdAt } | null;
  }>;
  pagination: { page, limit, total };
}
```

### GET /conversations/:id
Admin: any conversation in the business. Staff: only when an **open** escalation exists for it that is assigned to them
or unassigned, else `403 "Not assigned to you"`. Unknown/other business → `404`.
```ts
200 {
  conversation: Conversation & {
    customer: Customer;
    channelType: "instagram"|"whatsapp";
    messages: Message[];                                   // oldest first
    openEscalation: (Escalation & { assignedTo: UserRef | null }) | null;
  }
}
```

### POST /conversations/:id/reply
Same access rule as GET /conversations/:id. Body `{ text }` (1..4096 chars).
Effects: inserts outbound message (`senderType` = `"owner"` for admin, `"staff"` for staff; `senderId` = user id),
sends via `send.ts`, sets `state = "owner_handling"`, writes `audit_log` `reply_sent`.
```ts
201 { message: Message, conversation: { id, state } }
```
Errors: `409 WINDOW_CLOSED` if `windowClosesAt` has passed (template required).

### POST /conversations/:id/resolve
Same access rule. Sets `state = "ai_active"`, sets `resolvedAt/resolvedByUserId` on the open escalation, writes
`audit_log` `conversation_resolved` (+ state change).
```ts
200 { conversation: { id, state: "ai_active" }, escalation: Escalation | null }
```

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
| `conversation:updated` | admins | `{ conversationId, state, tag }` | escalation (AI rule, window closed, processing failure), auto-reply (tag), owner/staff reply (`owner_handling`), resolve (`ai_active`), echo (`owner_handling`) |
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
