# Resin Art AI Messaging Assistant

AI messaging assistant for a small resin art business. Customer messages from WhatsApp and Instagram are auto-replied to or escalated to a human, and admin and staff handle escalations in a dashboard.

`CLAUDE.md` is the full spec and the single source of truth.

## Layout

- `backend/`: Fastify + Drizzle (Postgres) + pg-boss + Anthropic API
- `dashboard/`: React + Vite (not built yet)
- `docs/`: API contracts, sample knowledge base, demo scenarios

## Backend quick start

```bash
cd backend
cp .env.example .env        # then fill in values (DEMO_MODE=true for local work)
npm install
npm run db:generate         # after schema changes
npm run db:migrate          # needs a reachable DATABASE_URL
npm run db:seed             # demo business, admin, staff and knowledge base
npm run dev                 # http://localhost:3001/health
npm test
```

Node 22.x is the target runtime.
