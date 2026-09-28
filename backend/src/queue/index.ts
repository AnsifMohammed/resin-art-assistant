import { readFileSync } from "node:fs";
import { PgBoss } from "pg-boss";
import { config, DATABASE_CA_CERT_PATH } from "../config.ts";
import { logger } from "../lib/logger.ts";

// Queue names (pg-boss v12 requires createQueue() before send/work/schedule).
export const QUEUES = {
  processMessage: "process-message",
  processMessageFailed: "process-message-failed",
  sendReminder: "send-reminder",
  refreshTokens: "refresh-tokens",
} as const;

/** Seconds to wait after the first message of a burst before running the AI (message batching). */
export const BATCH_WINDOW_SECONDS = 10;

/** Retry policy for the process-message queue. */
export const PROCESS_MESSAGE_RETRY_LIMIT = 2;
export const PROCESS_MESSAGE_RETRY_DELAY_SECONDS = 5;

// IMPORTANT: do not pass `connectionString` to pg-boss. The `pg` driver merges
// the parsed connection string over explicit options, so `?sslmode=require` on
// DATABASE_URL would silently replace our CA-verified `ssl` object (same issue
// as drizzle.config.ts). Pass the individual fields instead.
function connectionOptions() {
  const parsed = new URL(config.DATABASE_URL);
  const ssl = DATABASE_CA_CERT_PATH
    ? { ca: readFileSync(DATABASE_CA_CERT_PATH, "utf8"), rejectUnauthorized: true }
    : parsed.searchParams.get("sslmode") === "disable"
      ? false
      : { rejectUnauthorized: false }; // encrypted but unverified, matching sslmode=require

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ssl,
    max: 5,
  };
}

export const boss = new PgBoss(connectionOptions());

boss.on("error", (err) => {
  logger.error({ err }, "pg-boss error");
});

let running = false;

/** True once pg-boss has started and its queues exist. */
export function isQueueRunning(): boolean {
  return running;
}

export async function initQueue(): Promise<PgBoss | null> {
  if (config.NODE_ENV === "test") return null;

  try {
    await boss.start();

    await boss.createQueue(QUEUES.processMessageFailed, {
      retryLimit: 3,
      retryDelay: 30,
    });
    // `stately` + singletonKey=conversationId: at most one queued and one active
    // job per conversation. Extra sends during the batch window are collapsed
    // into the already-queued job, and a queued job never runs concurrently
    // with an active one for the same conversation.
    await boss.createQueue(QUEUES.processMessage, {
      policy: "stately",
      retryLimit: PROCESS_MESSAGE_RETRY_LIMIT,
      retryDelay: PROCESS_MESSAGE_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      expireInSeconds: 120,
      deadLetter: QUEUES.processMessageFailed,
    });
    await boss.createQueue(QUEUES.sendReminder);
    await boss.createQueue(QUEUES.refreshTokens);

    running = true;
    logger.info("pg-boss background job queue initialized");
    return boss;
  } catch (err) {
    logger.warn({ err }, "Could not connect to pg-boss queue (falling back to in-process execution)");
    return null;
  }
}

export async function stopQueue(): Promise<void> {
  if (!running) return;
  running = false;
  try {
    await boss.stop({ graceful: true, timeout: 15_000 });
    logger.info("pg-boss stopped");
  } catch (err) {
    logger.error({ err }, "Error stopping pg-boss");
  }
}
