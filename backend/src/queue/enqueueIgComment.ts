import { logger } from "../lib/logger.ts";
import type { EnqueueResult } from "./enqueue.ts";
import { boss, isQueueRunning, QUEUES } from "./index.ts";
import { processIgCommentJob, type ProcessIgCommentParams } from "./jobs/processIgComment.ts";

const inFlight = new Set<string>();

function runInline(params: ProcessIgCommentParams): EnqueueResult {
  if (inFlight.has(params.commentId)) return { mode: "batched", jobId: null };
  inFlight.add(params.commentId);
  setImmediate(() => {
    processIgCommentJob(params)
      .catch((err) => {
        logger.error({ err, commentId: params.commentId }, "Inline process-ig-comment failed");
      })
      .finally(() => inFlight.delete(params.commentId));
  });
  return { mode: "inline", jobId: null };
}

/** Enqueue processing for an incoming or simulated Instagram comment. */
export async function enqueueProcessIgComment(params: ProcessIgCommentParams): Promise<EnqueueResult> {
  if (!isQueueRunning()) return runInline(params);

  try {
    const jobId = await boss.send(QUEUES.processIgComment, params, { singletonKey: params.commentId });
    return { mode: jobId ? "queued" : "batched", jobId };
  } catch (err) {
    logger.error({ err, commentId: params.commentId }, "Failed to enqueue process-ig-comment, running in-process");
    return runInline(params);
  }
}
