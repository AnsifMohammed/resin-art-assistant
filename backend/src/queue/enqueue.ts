import { logger } from "../lib/logger.ts";
import { BATCH_WINDOW_SECONDS, boss, isQueueRunning, QUEUES } from "./index.ts";
import { processMessageJob, type ProcessMessageParams } from "./jobs/processMessage.ts";

export interface EnqueueResult {
  /** "queued" = new pg-boss job; "batched" = collapsed into an already-queued job; "inline" = in-process fallback */
  mode: "queued" | "batched" | "inline";
  jobId: string | null;
}

// In-process fallback (pg-boss unavailable): debounce per conversation with a
// timer so bursts still collapse into one pipeline run after the batch window.
const pendingTimers = new Map<string, NodeJS.Timeout>();

function scheduleInline(params: ProcessMessageParams): EnqueueResult {
  if (pendingTimers.has(params.conversationId)) {
    return { mode: "batched", jobId: null };
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(params.conversationId);
    processMessageJob(params, { finalAttempt: true }).catch((err) => {
      logger.error({ err, conversationId: params.conversationId }, "Inline processMessageJob failed");
    });
  }, BATCH_WINDOW_SECONDS * 1000);
  timer.unref();
  pendingTimers.set(params.conversationId, timer);

  return { mode: "inline", jobId: null };
}

/**
 * Schedule AI processing for a conversation after the batch window.
 *
 * The process-message queue uses the `stately` policy keyed by conversationId,
 * so while a job is already queued for this conversation, pg-boss rejects the
 * new one (send returns null) and the queued job picks up every message that
 * arrived in the meantime.
 */
export async function enqueueProcessMessage(params: ProcessMessageParams): Promise<EnqueueResult> {
  if (!isQueueRunning()) {
    return scheduleInline(params);
  }

  try {
    const jobId = await boss.send(QUEUES.processMessage, params, {
      singletonKey: params.conversationId,
      startAfter: BATCH_WINDOW_SECONDS,
    });
    return { mode: jobId ? "queued" : "batched", jobId };
  } catch (err) {
    logger.error({ err, conversationId: params.conversationId }, "Failed to enqueue process-message job, running in-process");
    return scheduleInline(params);
  }
}

/** Clear pending in-process timers (used on shutdown). */
export function clearInlineTimers(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
}
