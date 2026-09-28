---
description: Exact tech stack, package versions, folder structure and commands for the resin art assistant.
alwaysApply: true
---

# Stack and Structure

## Package versions — use these exactly

### Backend (backend/package.json)
```json
{
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
  "pino-pretty": "13.1.3",
  "resend": "6.30.0",
  "@sentry/node": "11.0.0",
  "@upstash/redis": "1.39.0",
  "@upstash/ratelimit": "2.2.0",
  "web-push": "4.0.0"
}
```

### Dashboard (dashboard/package.json)
```json
{
  "react": "19.3.0",
  "react-dom": "19.3.0",
  "react-router-dom": "7.18.4",
  "@tanstack/react-query": "5.104.0",
  "socket.io-client": "4.8.4",
  "lucide-react": "1.48.0",
  "dayjs": "1.11.23",
  "clsx": "2.1.1",
  "tailwind-merge": "3.7.0",
  "class-variance-authority": "0.7.1",
  "@sentry/react": "11.0.0",
  "workbox-window": "7.4.1"
}
```

## Key folder locations
```
backend/src/
  config.ts          ← env validation (Zod)
  db/schema.ts       ← all Drizzle tables
  routes/            ← one file per route group
  middleware/        ← authenticate.ts, requireAdmin.ts
  queue/jobs/        ← processMessage.ts (main job)
  ai/                ← pipeline.ts, rules.ts, prompt.ts, types.ts
  services/          ← send.ts, notify.ts, email.ts, push.ts, media.ts
  lib/               ← errors.ts, logger.ts, crypto.ts, redis.ts

dashboard/src/
  context/AuthContext.tsx
  guards/            ← RequireAuth.tsx, RequireAdmin.tsx
  pages/             ← AdminInbox, StaffEscalations, Login, etc.
  components/        ← layout/, inbox/, escalations/, admin/, ui/
  api/               ← typed fetch wrappers per endpoint group
  hooks/             ← useConversations, useEscalations, useSocket, useAuth
```

## Commands
```bash
cd backend && npm run dev           # start backend (tsx watch)
cd dashboard && npm run dev         # start dashboard (Vite)
cd backend && npm run db:generate   # after schema changes
cd backend && npm run db:migrate    # apply migrations
cd backend && npm run db:seed       # create demo business + users
cd backend && npm test              # run all tests
```

## Auth quick reference
- JWT payload: `{ sub, businessId, role, name }`
- Password hash: argon2id via `argon2.hash(password, { type: argon2.argon2id })`
- Login rate limit: 5 attempts / 15 min / IP via Upstash Redis
- Every route except `/health`, `/webhook`, `/auth/login` requires Bearer JWT

## UI colour conventions
```typescript
// State badges
ai_active: "bg-emerald-100 text-emerald-800"
escalated: "bg-red-100 text-red-800"
owner_handling: "bg-amber-100 text-amber-800"
paused: "bg-gray-100 text-gray-500"

// Message bubbles
customer: "bg-gray-100 text-gray-900 self-start"
ai:       "bg-blue-50 text-blue-900 self-end border border-blue-200"
owner:    "bg-emerald-500 text-white self-end"
staff:    "bg-violet-500 text-white self-end"
system:   "text-gray-400 text-xs text-center"

// Role badges
admin: "bg-emerald-100 text-emerald-800"
staff: "bg-violet-100 text-violet-800"
```

## cn helper (dashboard/src/lib/cn.ts)
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

See CLAUDE.md for full environment variables, TypeScript config and drizzle config.
