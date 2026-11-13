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

/**
 * The commit this process is running, so "is my change deployed?" is a question
 * the server answers rather than one inferred from whether a feature appears to
 * work. Render sets RENDER_GIT_COMMIT on every deploy; the others cover common
 * hosts, and "unknown" simply means none were present.
 */
const COMMIT =
  process.env.RENDER_GIT_COMMIT ??
  process.env.GIT_COMMIT ??
  process.env.SOURCE_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "unknown";

/** Set once at import, so it also reveals how long the instance has been up. */
const STARTED_AT = new Date().toISOString();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request, reply) => {
    const ok = await pingDatabase();
    const body = {
      ok,
      mode: config.DEMO_MODE ? "demo" : "live",
      commit: COMMIT.slice(0, 7),
      startedAt: STARTED_AT,
      timestamp: new Date().toISOString(),
    };
    if (!ok) {
      request.log.warn("Health check: database unreachable");
      return reply.status(503).send(body);
    }
    return body;
  });
}
