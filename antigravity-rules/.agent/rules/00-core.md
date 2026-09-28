---
description: Core project identity, roles, demo mode and rules that never change.
alwaysApply: true
---

# Resin Art AI Messaging Assistant — Core Rules

## What this project is
An AI messaging assistant for a Kerala resin art business. Customers message on WhatsApp or Instagram. The AI auto-replies to routine questions and escalates sensitive ones to a human. The owner and staff use a dashboard to handle escalations.

## The single most important rule
**Read CLAUDE.md in the repo root before writing any code in a new session.** It is the full source of truth for architecture, schema, endpoints, AI format and build order. These rule files are summaries only. CLAUDE.md wins on any conflict.

## Two users, two access levels

### Admin (business owner) — full access
- All conversations, all channels, all states
- Edit knowledge base, pause/resume automation
- Create and deactivate staff accounts
- Analytics, audit log, settings, Meta channels

### Staff (hired helper) — limited access
- ONLY escalated conversations assigned to them or unassigned
- Reply and resolve those conversations only
- Nothing else: no KB editor, no settings, no analytics, no audit log

**Backend enforces this. Never trust role from request body. Always read role from the verified JWT.**

## Demo mode
`DEMO_MODE=true` in .env means:
- Replies are logged to console, never sent to Meta
- `POST /simulate/message` endpoint is active
- No real WhatsApp or Instagram accounts needed

Never call Meta APIs when DEMO_MODE=true.

## Non-negotiable rules
- Every DB table has `business_id`. No exceptions.
- Never send an auto-reply if `conversation.state !== "ai_active"`. Check state first, always.
- Never invent a price, date or policy not in the knowledge base. Flag it as missing_facts and escalate.
- Never store Meta tokens in plain text. Encrypt with AES-256-GCM via `lib/crypto.ts`.
- Never commit .env or any file with real credentials.
- Never expose `password_hash` in any API response.
- Never trust role from request body. Read from verified JWT only.
- argon2id for password hashing. Never bcrypt.
- TypeScript strict mode. No `any` without a `// reason:` comment.

## Conversation states (never skip this logic)
```
ai_active → escalated → owner_handling → ai_active (on resolve)
ai_active → paused → ai_active (on resume)
```
Worker checks state BEFORE calling AI. Only runs AI if state is `ai_active`.
Echo detection sets state to `owner_handling` BEFORE any AI job runs.
State changes always written to `audit_log`.

## Phase 2 — do not build yet
Cloudflare R2, Trigger.dev, Posthog, Stripe, Cloudflare Workers.
Build these only after the client signs off the demo.
