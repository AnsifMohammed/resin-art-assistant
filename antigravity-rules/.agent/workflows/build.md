---
description: Full 26-step demo build order. Run this workflow at the start of every build session.
---

# Build Workflow

Read CLAUDE.md fully before starting any step. Follow this order exactly. Complete each step and verify it works before moving to the next. Tell me which step you are on before writing any code.

## Setup (do once)
```bash
# Generate VAPID keys (copy output to .env)
npx web-push generate-vapid-keys

# Create folder structure
mkdir -p backend/src/{db/migrations,routes,middleware,queue/jobs,ai,services/meta,lib}
mkdir -p dashboard/src/{context,api,hooks,guards,pages,components/{layout,inbox,escalations,admin,ui},types,lib}
mkdir -p docs .agent/rules .agent/workflows
```

## Step 1: config.ts
`backend/src/config.ts` — read all env vars with Zod. Throw on missing required vars. Export typed config object.

## Step 2: Database schema
`backend/src/db/schema.ts` — all 11 tables including push_subscriptions. All enums. All indexes.
Then: `npm run db:generate && npm run db:migrate`

## Step 3: lib files
`backend/src/lib/errors.ts` — AppError class + Fastify error handler
`backend/src/lib/logger.ts` — Pino logger
`backend/src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt
`backend/src/lib/redis.ts` — Upstash Redis instance + loginRatelimit + apiRatelimit

## Step 4: Fastify server + health
`backend/src/index.ts` — Sentry.init at very top, then Fastify setup, plugins, routes, queue start
`backend/src/routes/health.ts` — GET /health returns `{ ok, mode, timestamp }`
Verify: `curl http://localhost:3001/health`

## Step 5: Auth routes
`backend/src/routes/auth.ts` — POST /auth/login (with login rate limit), GET /auth/me, POST /auth/logout
`backend/src/middleware/authenticate.ts` — verify JWT, attach request.user
`backend/src/middleware/requireAdmin.ts` — 403 if role !== "admin"
`backend/src/middleware/requireStaffOrAdmin.ts`

## Step 6: Email and push services
`backend/src/services/email.ts` — sendEscalationAlert + sendStaffWelcome via Resend
`backend/src/services/push.ts` — VAPID setup, sendPushNotification, deletePushSubscription
`backend/src/routes/push.ts` — POST /push/subscribe (saves to push_subscriptions)

## Step 7: Simulate endpoint
`backend/src/routes/simulate.ts` — POST /simulate/message
Guard with: `if (config.DEMO_MODE !== "true") return reply.status(404).send()`

## Step 8: Queue setup
`backend/src/queue/index.ts` — pg-boss instance
`backend/src/queue/worker.ts` — register all job handlers
`backend/src/queue/jobs/sendReminder.ts` — escalation reminder
`backend/src/queue/jobs/refreshTokens.ts` — daily Instagram token refresh

## Step 9: AI pipeline
`backend/src/ai/types.ts` — AiDecision Zod schema + TypeScript type
`backend/src/ai/rules.ts` — applyRules function
`backend/src/ai/prompt.ts` — buildPrompt + getKnowledgeBase (with Redis cache) + invalidateKBCache
`backend/src/ai/pipeline.ts` — call Gemini API, validate JSON, retry once on failure

## Step 10: processMessage job
`backend/src/queue/jobs/processMessage.ts` — full job flow (9 steps from the AI pipeline rules)

## Step 11: Send service
`backend/src/services/send.ts` — DEMO_MODE=true logs to console, live mode calls Meta
`backend/src/services/notify.ts` — push + email + WhatsApp alert, calls both email.ts and push.ts

## Step 12: All remaining routes
conversations.ts, reply.ts, resolve.ts, escalations.ts (with staff filter), users.ts (admin only), settings.ts (admin only), knowledge-base.ts (admin only, invalidates cache), analytics.ts (admin only), audit-log.ts (admin only), webhooks.ts (verify + signature)

## Step 13: Seed data
`backend/src/db/seed.ts` — demo business, admin user (asha@asharesins.com), staff user (priya@asharesins.com), knowledge base
Run: `npm run db:seed`

## Step 14: Test scenarios 1–3
```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"asha@asharesins.com","password":"changeme123"}'

# Simulate price question (use token from login)
curl -X POST http://localhost:3001/simulate/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"customerName":"Test","channel":"whatsapp","text":"How much is the ocean coaster set?"}'
```
Expected: auto-reply with ₹1,200 logged to console

## Step 15: Sentry dashboard setup
Go to sentry.io, create backend + dashboard projects, add DSNs to .env

## Step 16: BetterStack setup
Go to betterstack.com, add monitor for GET /health, 1-minute interval

## Step 17: Upstash setup
Go to upstash.com, create Redis DB (Singapore region), add URL + token to .env
Test: login 6 times with wrong password → 6th should return 429

## Step 18: Resend setup
Go to resend.com, create account, verify domain or use onboarding@resend.dev for demo, add API key to .env
Test: create an escalation → check admin email inbox

## Step 19: Dashboard auth
`dashboard/src/context/AuthContext.tsx`
`dashboard/src/pages/Login.tsx`
`dashboard/src/guards/RequireAuth.tsx`
`dashboard/src/guards/RequireAdmin.tsx`
`dashboard/src/App.tsx` — routes with guards

## Step 20: PWA setup
`dashboard/vite.config.ts` — VitePWA plugin
Create `dashboard/public/icon-192.png` and `dashboard/public/icon-512.png`
`dashboard/src/hooks/usePushNotifications.ts`
Call usePushNotifications() in App.tsx

## Step 21: Admin dashboard
`AdminInbox.tsx` — conversation list + chat view side by side
`ChatView.tsx` + `MessageBubble.tsx` + `ReplyBox.tsx` + `WindowCountdown.tsx`
`ConversationList.tsx` + `ConversationItem.tsx`

## Step 22: Staff dashboard
`StaffEscalations.tsx` — only assigned + unassigned escalations
`StaffChat.tsx` — chat view for one escalated conversation
`StaffSidebar.tsx` — escalations link only

## Step 23: Admin-only pages
`UserManagement.tsx` + `StaffForm.tsx`
`KnowledgeBase.tsx`
`Analytics.tsx`
`AuditLog.tsx`
`Settings.tsx` (pause switch, channel status)

## Step 24: Real-time (Socket.io)
`useSocket.ts` — connect, subscribe to events based on role
Admin: all events. Staff: only assigned escalation events.
Fallback: poll every 5 seconds on disconnect.

## Step 25: Run all 10 demo scenarios
```
1. "How much is the ocean coaster set?" → auto-reply ₹1,200
2. "I want a custom clock with my daughter's name" → auto-reply asking colour
3. "Do you deliver to Bangalore?" → auto-reply 7-10 days ₹120
4. "How much for a 6 foot resin table?" → escalate: missing_facts
5. "I want a refund" → escalate: intent_refund
6. "I paid already, where is my order?" → escalate: phrase
7. Three messages in 5 seconds → one combined reply
8. Admin replies → state becomes owner_handling
9. "എത്ര രൂപ കൊടുക്കണം keychain ന്?" → auto-reply Malayalam ₹450
10. Pause automation → message stored, no reply
```
All 10 must pass before calling demo done.

## Step 26: Role access verification
Login as priya@asharesins.com (staff password: staffpass123)
These must return 403:
- GET /conversations (full inbox)
- GET /settings
- GET /users
- GET /analytics
- GET /audit-log
- GET /knowledge-base (PUT)
These must work:
- GET /escalations (filtered to assigned + unassigned only)

Demo is done when all 26 steps are complete and verified.
