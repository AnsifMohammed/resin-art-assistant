import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "../db/index.ts";
import { messages } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { deliverLocal, type RealtimeEnvelope } from "./websocket.ts";

/**
 * Fan-out of realtime envelopes across API processes.
 *
 * Events can originate in any process (e.g. a pg-boss worker running in a
 * different instance than the one holding the admin's socket), so every
 * envelope is delivered locally right away and also broadcast with Postgres
 * NOTIFY; each other process LISTENs and delivers it to its own sockets.
 * Role scoping always happens at delivery time (websocket.ts), never here.
 *
 * Until startRealtimeBus() succeeds (tests, DB unavailable), delivery is local only.
 */

const CHANNEL = "realtime_events";
/** Postgres NOTIFY payloads must be < 8000 bytes. */
const MAX_NOTIFY_BYTES = 7_900;
const INSTANCE_ID = randomUUID();

type Wire =
  | { origin: string; env: RealtimeEnvelope }
  /** Oversized message:new: receivers load the row themselves. */
  | { origin: string; ref: { businessId: string; conversationId: string; messageId: string } };

let unlisten: (() => Promise<void>) | null = null;

function deliver(env: RealtimeEnvelope): void {
  deliverLocal(env).catch((err) => {
    logger.error({ err, kind: env.kind, businessId: env.businessId }, "Realtime delivery failed");
  });
}

function encode(env: RealtimeEnvelope): string | null {
  const full = JSON.stringify({ origin: INSTANCE_ID, env } satisfies Wire);
  if (Buffer.byteLength(full, "utf8") <= MAX_NOTIFY_BYTES) return full;
  if (env.kind === "message:new") {
    return JSON.stringify({
      origin: INSTANCE_ID,
      ref: { businessId: env.businessId, conversationId: env.conversationId, messageId: env.message.id },
    } satisfies Wire);
  }
  logger.warn({ kind: env.kind }, "Realtime envelope too large to broadcast; delivered locally only");
  return null;
}

/** Deliver an envelope on this process and broadcast it to the others. Never throws. */
export function publish(env: RealtimeEnvelope): void {
  deliver(env);
  if (!unlisten) return;
  const body = encode(env);
  if (!body) return;
  sql.notify(CHANNEL, body).catch((err: unknown) => {
    logger.error({ err, kind: env.kind }, "Failed to broadcast realtime event");
  });
}

async function onNotify(raw: string): Promise<void> {
  let wire: Wire;
  try {
    wire = JSON.parse(raw) as Wire;
  } catch {
    logger.warn("Malformed realtime notification ignored");
    return;
  }
  if (wire.origin === INSTANCE_ID) return; // already delivered locally

  if ("env" in wire) {
    deliver(wire.env);
    return;
  }

  const [message] = await db.select().from(messages).where(eq(messages.id, wire.ref.messageId));
  if (!message || message.businessId !== wire.ref.businessId) return;
  deliver({ kind: "message:new", businessId: message.businessId, conversationId: message.conversationId, message });
}

/** LISTEN for envelopes from other processes. Safe to call more than once. */
export async function startRealtimeBus(): Promise<void> {
  if (unlisten) return;
  const listener = await sql.listen(CHANNEL, (payload: string) => {
    onNotify(payload).catch((err) => logger.error({ err }, "Failed to handle realtime notification"));
  });
  unlisten = listener.unlisten;
  logger.info("Realtime bus listening (Postgres NOTIFY)");
}

export async function stopRealtimeBus(): Promise<void> {
  const stop = unlisten;
  unlisten = null;
  if (stop) await stop().catch((err: unknown) => logger.error({ err }, "Failed to stop realtime bus"));
}
