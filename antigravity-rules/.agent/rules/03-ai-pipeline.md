---
description: AI pipeline rules, output format, escalation logic and what the LLM must never do. Active when editing ai/ folder files.
globs: "**/ai/**"
---

# AI Pipeline Rules

## The AI output format — always return this exact JSON
```json
{
  "intent": "price | delivery | care | custom_order | payment | complaint | refund | unknown | off_topic",
  "reply": "the reply text, max 2000 chars",
  "facts_used": ["product:ocean-coaster-set-4", "policy:delivery-kerala"],
  "missing_facts": ["product:6ft-resin-table"],
  "escalate": false,
  "escalate_reason": null,
  "suggested_tag": "new_lead | custom_order | payment_pending | order_confirmed | follow_up | null",
  "language_detected": "english | malayalam | manglish"
}
```
No preamble. No markdown. No explanation. Pure JSON only.

## Escalation rules (applied AFTER the LLM — these always win)

### Always escalate these intents
```typescript
const ALWAYS_ESCALATE_INTENTS = [
  "complaint", "refund", "unknown", "off_topic", "payment"
];
```

### Always escalate if message contains these phrases
```typescript
const ALWAYS_ESCALATE_PHRASES = [
  "i paid", "already paid", "payment done", "sent money",
  "where is my order", "not received", "damaged", "broken",
  "want refund", "cancel my order", "cheated", "fraud",
  "police", "consumer court",
];
```

### Auto-reply allowed ONLY for these intents
```typescript
const AUTO_REPLY_ALLOWED_INTENTS = [
  "price", "delivery", "care", "custom_order"
];
```

### Additional escalation triggers
- `missing_facts.length > 0` → escalate (never guess a missing fact)
- Intent not in AUTO_REPLY_ALLOWED_INTENTS → escalate
- Photo sent and intent is not in AUTO_REPLY_ALLOWED_INTENTS → escalate

## What the LLM must NEVER do
- Invent a price, delivery date or policy not in the knowledge base
- Confirm an order is placed or a payment received
- Make a promise about delivery dates not in the knowledge base
- Reply to off-topic questions (homework, coding, general knowledge)
- Say anything about returns or refunds (always escalate these)
- Reply if conversation.state !== "ai_active"

## processMessage.ts job flow (follow this order)
```
1. Load conversation
2. If state !== "ai_active" → stop, return
3. Check window_closes_at → if expired → escalate with reason "parse_error", return
4. Wait 10 seconds for message batching
5. Load all messages in batch
6. Call pipeline.ts → AiDecision
7. Call rules.ts with decision + raw text → final decision
8. If escalate:
   a. Set state = "escalated"
   b. Insert into escalations (assigned_to_user_id = null)
   c. Call notify.ts (push + email + WhatsApp alert)
   d. Write audit_log
9. If auto-reply:
   a. Insert outbound message (sender_type = "ai")
   b. Call send.ts
   c. Update conversation tag if suggested_tag present
   d. Insert ai_decisions with sent = true
   e. Write audit_log
```

## Knowledge base caching
The KB is read from Redis cache first (TTL 1 hour), then Postgres on cache miss.
Call `invalidateKBCache(businessId)` after every PUT /knowledge-base.
Use `getKnowledgeBase(businessId)` from `ai/prompt.ts`. Never query the KB table directly in the pipeline.

## Pipeline error handling
- If LLM returns invalid JSON: retry once with a stricter instruction
- If retry fails: return safe escalation `{ escalate: true, escalate_reason: "parse_error" }`
- Never throw from pipeline.ts. Always return an AiDecision.

## Languages
Detect English, Malayalam and Manglish. Reply in the same language as the customer.
Match the owner's tone from the knowledge base tone_examples.

See CLAUDE.md for the full Zod schema (AiDecision), full rules.ts implementation and full prompt design.
