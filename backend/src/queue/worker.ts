import type { Job } from "pg-boss";
import { logger } from "../lib/logger.ts";
import { clearInlineTimers } from "./enqueue.ts";
import { boss, initQueue, PROCESS_MESSAGE_RETRY_LIMIT, QUEUES, stopQueue } from "./index.ts";
import { escalateAfterFailure, processMessageJob, type ProcessMessageParams } from "./jobs/processMessage.ts";
import { checkAndRefreshInstagramTokens } from "./jobs/refreshTokens.ts";
import { checkAndSendReminders } from "./jobs/sendReminder.ts";

export async function startWorkers(): Promise<void> {
  const queue = await initQueue();
  if (!queue) return;

  try {
    // 1. Process message worker. Queues are created in initQueue() (required by pg-boss v12).
    // localConcurrency: different conversations are processed in parallel; the
    // stately queue policy still prevents two active jobs for the same conversation.
    await boss.work<ProcessMessageParams>(
      QUEUES.processMessage,
      { localConcurrency: 5, pollingIntervalSeconds: 1 },
      async (jobs: Job<ProcessMessageParams>[]) => {
        for (const job of jobs) {
          // On the last attempt, failures become a parse_error escalation instead of a retry.
          const finalAttempt = job.retryCount >= PROCESS_MESSAGE_RETRY_LIMIT;
          await processMessageJob(job.data, { finalAttempt });
        }
      },
    );

    // 1b. Dead letter safety net (e.g. a job expired or the worker crashed mid-job):
    //     never leave the conversation silently ai_active.
    await boss.work<ProcessMessageParams>(QUEUES.processMessageFailed, async (jobs: Job<ProcessMessageParams>[]) => {
      for (const job of jobs) {
        logger.error({ conversationId: job.data.conversationId }, "process-message job dead-lettered");
        await escalateAfterFailure(job.data, new Error("process-message job failed permanently"));
      }
    });

    // 2. Escalation reminder worker (runs every 15 minutes)
    await boss.schedule(QUEUES.sendReminder, "*/15 * * * *");
    await boss.work(QUEUES.sendReminder, async () => {
      await checkAndSendReminders();
    });

    // 3. Instagram token refresh worker (runs daily at 3:00 AM)
    await boss.schedule(QUEUES.refreshTokens, "0 3 * * *");
    await boss.work(QUEUES.refreshTokens, async () => {
      await checkAndRefreshInstagramTokens();
    });

    logger.info("All pg-boss background workers registered");
  } catch (err) {
    logger.error({ err }, "Error registering background workers");
  }
}

export async function stopWorkers(): Promise<void> {
  clearInlineTimers();
  await stopQueue();
}
