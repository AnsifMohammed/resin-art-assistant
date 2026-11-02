import type { Job } from "pg-boss";
import { config, isInstagramLive } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { clearInlineTimers } from "./enqueue.ts";
import {
  dispatchBroadcasts,
  startInlineBroadcastDispatcher,
  stopInlineBroadcastDispatcher,
} from "./enqueueBroadcast.ts";
import { boss, initQueue, PROCESS_MESSAGE_RETRY_LIMIT, QUEUES, stopQueue } from "./index.ts";
import { escalateAfterFailure, processMessageJob, type ProcessMessageParams } from "./jobs/processMessage.ts";
import { checkAndRefreshInstagramTokens } from "./jobs/refreshTokens.ts";
import { sendBroadcastJob, type SendBroadcastParams } from "./jobs/sendBroadcast.ts";
import { checkAndSendReminders } from "./jobs/sendReminder.ts";
import { processIgCommentJob, type ProcessIgCommentParams } from "./jobs/processIgComment.ts";

export async function startWorkers(): Promise<void> {
  const queue = await initQueue();
  if (!queue) {
    // No pg-boss: scheduled broadcasts are still dispatched, in-process.
    startInlineBroadcastDispatcher();
    startInlineTokenRefresh();
    return;
  }

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
    // Live Instagram: also run once at startup, so a token seeded from
    // INSTAGRAM_ACCESS_TOKEN gets stored (encrypted) with its expiry right away.
    if (isInstagramLive(config)) {
      await boss.send(QUEUES.refreshTokens, {});
    }

    // 4. Broadcasts: every minute, claim due scheduled broadcasts and enqueue their send job.
    await boss.schedule(QUEUES.dispatchBroadcasts, "* * * * *");
    await boss.work(QUEUES.dispatchBroadcasts, async () => {
      await dispatchBroadcasts();
    });
    await boss.work<SendBroadcastParams>(
      QUEUES.sendBroadcast,
      { localConcurrency: 2 },
      async (jobs: Job<SendBroadcastParams>[]) => {
        for (const job of jobs) {
          await sendBroadcastJob(job.data);
        }
      },
    );

    // 5. Instagram comment auto-reply worker
    await boss.work<ProcessIgCommentParams>(
      QUEUES.processIgComment,
      { localConcurrency: 3 },
      async (jobs: Job<ProcessIgCommentParams>[]) => {
        for (const job of jobs) {
          await processIgCommentJob(job.data);
        }
      },
    );

    logger.info("All pg-boss background workers registered");
  } catch (err) {
    logger.error({ err }, "Error registering background workers");
  }
}

let inlineTokenRefreshTimer: NodeJS.Timeout | null = null;

/** Without pg-boss: refresh live Instagram tokens at startup and then daily, in-process. */
function startInlineTokenRefresh(): void {
  if (!isInstagramLive(config) || config.NODE_ENV === "test" || inlineTokenRefreshTimer) return;
  const run = () =>
    checkAndRefreshInstagramTokens().catch((err: unknown) => logger.error({ err }, "Inline Instagram token refresh failed"));
  void run();
  inlineTokenRefreshTimer = setInterval(run, 24 * 60 * 60 * 1000);
  inlineTokenRefreshTimer.unref();
}

export async function stopWorkers(): Promise<void> {
  clearInlineTimers();
  stopInlineBroadcastDispatcher();
  if (inlineTokenRefreshTimer) {
    clearInterval(inlineTokenRefreshTimer);
    inlineTokenRefreshTimer = null;
  }
  await stopQueue();
}
