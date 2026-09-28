---
description: Database schema conventions, table names, enums and index rules. Active when editing any TypeScript file.
globs: "**/*.ts"
---

# Database Rules

## ORM and dialect
Drizzle ORM, Postgres dialect. All IDs use `nanoid()`. Never use uuid() or auto-increment.

## All table names (memorise these)
```
businesses          ← one per client (SaaS-ready)
users               ← admin and staff, with role enum
channels            ← instagram or whatsapp connections
customers           ← one per channel per person
conversations       ← one thread per customer
messages            ← every message, inbound and outbound
ai_decisions        ← LLM output for every processed message
escalations         ← open human-attention items
knowledge_base      ← products, policies, tone examples
audit_log           ← every action by AI, admin or staff
push_subscriptions  ← web push endpoints per user
```

## All enums
```typescript
roleEnum:             "admin" | "staff"
channelTypeEnum:      "instagram" | "whatsapp"
convStateEnum:        "ai_active" | "escalated" | "owner_handling" | "paused"
convTagEnum:          "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up"
directionEnum:        "inbound" | "outbound"
senderTypeEnum:       "customer" | "ai" | "owner" | "staff" | "system"
deliveryStatusEnum:   "queued" | "sent" | "delivered" | "read" | "failed"
escalationReasonEnum: "intent_complaint" | "intent_refund" | "intent_unknown" |
                      "missing_facts" | "always_escalate_phrase" |
                      "payment_claim" | "unapproved_intent" | "parse_error" | "manual"
```

## Schema conventions (apply to every table)
```typescript
// Standard helpers — use these, don't rewrite them
const id = () => text("id").primaryKey().$defaultFn(() => nanoid());
const businessId = () => text("business_id").notNull();
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () => timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date());
```

## Index rules
- Always index foreign key columns
- Always index columns used in WHERE clauses
- Use `uniqueIndex` for unique constraints (not `unique()` on the column)
- Unique constraint on `messages.meta_message_id` — this prevents duplicate webhook delivery

## Key relationships
```
businesses 1──n users
businesses 1──n channels
businesses 1──n customers (via channel)
customers  1──n conversations
conversations 1──n messages
conversations 1──1 escalations (when escalated)
messages   1──1 ai_decisions (when AI processed)
users      1──n push_subscriptions
escalations.assigned_to_user_id → users.id (nullable = unassigned)
escalations.resolved_by_user_id → users.id (nullable = unresolved)
```

## Staff access filter (always apply for staff role)
```typescript
// Escalations visible to staff:
WHERE business_id = user.businessId
  AND (assigned_to_user_id = user.id OR assigned_to_user_id IS NULL)
  AND resolved_at IS NULL

// Conversations visible to staff:
// Only if an open escalation exists for that conversation
// matching the filter above. Otherwise 403.
```

## After every schema change
```bash
cd backend && npm run db:generate && npm run db:migrate
```
Never edit migration files manually.

See CLAUDE.md for the full Drizzle schema with all columns.
