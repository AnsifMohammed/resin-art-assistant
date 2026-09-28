import type { FastifyInstance } from "fastify";
import { config } from "../config.ts";
import { sql } from "../db/index.ts";

// Generous enough for a cold serverless (Neon) connection, short enough for uptime monitors.
const DB_CHECK_TIMEOUT_MS = 5000;

async function pingDatabase(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DB health check timed out")), DB_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([sql`select 1`, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request, reply) => {
    const ok = await pingDatabase();
    const body = {
      ok,
      mode: config.DEMO_MODE ? "demo" : "live",
      timestamp: new Date().toISOString(),
    };
    if (!ok) {
      request.log.warn("Health check: database unreachable");
      return reply.status(503).send(body);
    }
    return body;
  });
}
