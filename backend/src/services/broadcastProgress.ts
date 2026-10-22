import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { broadcastRecipients, broadcasts } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { emitBroadcastUpdated } from "../realtime/events.ts";
import type { BroadcastStats } from "../realtime/websocket.ts";

export type { BroadcastStats };

/** Progress events for one broadcast are sent at most this often (status changes are not throttled). */
export const PROGRESS_THROTTLE_MS = 2_000;

export const emptyStats = (): BroadcastStats => ({ pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 });

/** Recipient counts per status for each broadcast: one grouped query. */
export async function broadcastStats(broadcastIds: string[]): Promise<Map<string, BroadcastStats>> {
  const out = new Map<string, BroadcastStats>();
  if (broadcastIds.length === 0) return out;
  for (const id of broadcastIds) out.set(id, emptyStats());

  const rows = await db
    .select({
      broadcastId: broadcastRecipients.broadcastId,
      status: broadcastRecipients.status,
      count: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(broadcastRecipients)
    .where(inArray(broadcastRecipients.broadcastId, broadcastIds))
    .groupBy(broadcastRecipients.broadcastId, broadcastRecipients.status);

  for (const row of rows) {
    const stats = out.get(row.broadcastId);
    if (stats && row.status in stats) stats[row.status] = Number(row.count) || 0;
  }
  return out;
}

const lastEmitAt = new Map<string, number>();
const trailing = new Map<string, NodeJS.Timeout>();

async function emitNow(businessId: string, broadcastId: string, status?: string): Promise<void> {
  lastEmitAt.set(broadcastId, Date.now());
  let current = status;
  if (!current) {
    const [row] = await db
      .select({ status: broadcasts.status })
      .from(broadcasts)
      .where(and(eq(broadcasts.id, broadcastId), eq(broadcasts.businessId, businessId)));
    if (!row) return;
    current = row.status;
  }
  const stats = (await broadcastStats([broadcastId])).get(broadcastId) ?? emptyStats();
  emitBroadcastUpdated(businessId, { broadcastId, status: current, stats });
}

/**
 * Emit `broadcast:updated` with fresh stats. `force` (status changes) always
 * emits; progress emits are throttled to one per PROGRESS_THROTTLE_MS per
 * broadcast, with a trailing emit so the last progress is never lost. Never throws.
 */
export async function emitBroadcastProgress(
  businessId: string,
  broadcastId: string,
  opts: { force?: boolean; status?: string } = {},
): Promise<void> {
  try {
    const pending = trailing.get(broadcastId);
    if (opts.force) {
      if (pending) clearTimeout(pending);
      trailing.delete(broadcastId);
      await emitNow(businessId, broadcastId, opts.status);
      return;
    }

    const wait = (lastEmitAt.get(broadcastId) ?? 0) + PROGRESS_THROTTLE_MS - Date.now();
    if (wait <= 0) {
      await emitNow(businessId, broadcastId, opts.status);
      return;
    }
    if (pending) return; // a trailing emit is already scheduled
    const timer = setTimeout(() => {
      trailing.delete(broadcastId);
      emitNow(businessId, broadcastId).catch((err) => {
        logger.error({ err, broadcastId }, "Failed to emit broadcast progress");
      });
    }, wait);
    timer.unref();
    trailing.set(broadcastId, timer);
  } catch (err) {
    logger.error({ err, broadcastId }, "Failed to emit broadcast progress");
  }
}

/** Test helper: forget throttle state and cancel trailing emits. */
export function resetBroadcastProgressThrottle(): void {
  for (const t of trailing.values()) clearTimeout(t);
  trailing.clear();
  lastEmitAt.clear();
}
