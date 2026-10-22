import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import type { EnqueueResult } from "./enqueue.ts";
import { boss, isQueueRunning, QUEUES } from "./index.ts";
import { claimDueBroadcasts, sendBroadcastJob, type SendBroadcastParams } from "./jobs/sendBroadcast.ts";

// In-process fallback (pg-boss unavailable): run the job right away, at most
// one run per broadcast at a time (the queue's singletonKey does this otherwise).
const inFlight = new Set<string>();

function runInline(params: SendBroadcastParams): EnqueueResult {
  if (inFlight.has(params.broadcastId)) return { mode: "batched", jobId: null };
  inFlight.add(params.broadcastId);
  setImmediate(() => {
    sendBroadcastJob(params)
      .catch((err) => {
        logger.error({ err, broadcastId: params.broadcastId }, "Inline send-broadcast failed");
      })
      .finally(() => inFlight.delete(params.broadcastId));
  });
  return { mode: "inline", jobId: null };
}

/** Queue the send-broadcast job for a broadcast that is already in status "sending". */
export async function enqueueSendBroadcast(params: SendBroadcastParams): Promise<EnqueueResult> {
  if (!isQueueRunning()) return runInline(params);

  try {
    const jobId = await boss.send(QUEUES.sendBroadcast, params, { singletonKey: params.broadcastId });
    return { mode: jobId ? "queued" : "batched", jobId };
  } catch (err) {
    logger.error({ err, broadcastId: params.broadcastId }, "Failed to enqueue send-broadcast, running in-process");
    return runInline(params);
  }
}

/** dispatch-broadcasts job: claim due scheduled broadcasts and enqueue a send for each. */
export async function dispatchBroadcasts(): Promise<number> {
  const claimed = await claimDueBroadcasts();
  for (const params of claimed) await enqueueSendBroadcast(params);
  if (claimed.length > 0) logger.info({ count: claimed.length }, "Dispatched broadcasts");
  return claimed.length;
}

let inlineDispatcher: NodeJS.Timeout | null = null;

/** Without pg-boss, check for due broadcasts every minute in this process. */
export function startInlineBroadcastDispatcher(): void {
  if (inlineDispatcher || config.NODE_ENV === "test") return;
  inlineDispatcher = setInterval(() => {
    dispatchBroadcasts().catch((err) => logger.error({ err }, "Inline broadcast dispatch failed"));
  }, 60_000);
  inlineDispatcher.unref();
}

export function stopInlineBroadcastDispatcher(): void {
  if (inlineDispatcher) clearInterval(inlineDispatcher);
  inlineDispatcher = null;
}
