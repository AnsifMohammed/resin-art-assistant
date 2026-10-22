import { and, asc, eq, lt, lte } from "drizzle-orm";
import { config } from "../../config.ts";
import { db } from "../../db/index.ts";
import {
  auditLog,
  broadcastRecipients,
  broadcasts,
  customers,
  messages,
  messageTemplates,
} from "../../db/schema.ts";
import { isBroadcastableTemplate, missingBroadcastVariables } from "../../lib/broadcasts.ts";
import { logger } from "../../lib/logger.ts";
import { renderTemplate } from "../../lib/templates.ts";
import { emitMessageNew } from "../../realtime/events.ts";
import { listAudience } from "../../services/audience.ts";
import { broadcastStats, emitBroadcastProgress, emptyStats } from "../../services/broadcastProgress.ts";
import { sendMessage } from "../../services/send.ts";

export interface SendBroadcastParams {
  broadcastId: string;
  businessId: string;
}

/** Recipients are processed in batches; the broadcast status is re-read between batches (cancel). */
export const BROADCAST_BATCH_SIZE = 50;

/** A "sending" broadcast whose job has not finished after this long is re-enqueued by the dispatcher. */
export const STUCK_SENDING_MS = 5 * 60 * 1000;

export interface SendBroadcastOptions {
  /** Pause between sends (pacing). Defaults to a real timer, and to no wait under NODE_ENV=test. */
  sleep?: (ms: number) => Promise<void>;
}

export type SendBroadcastOutcome = "skipped" | "cancelled" | "sent" | "failed";

type BroadcastRow = typeof broadcasts.$inferSelect;
type TemplateRow = typeof messageTemplates.$inferSelect;
type RecipientRow = typeof broadcastRecipients.$inferSelect;

const defaultSleep = (ms: number): Promise<void> =>
  config.NODE_ENV === "test" || ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/** Mark a still-"sending" broadcast as failed (e.g. template no longer approved). */
async function failBroadcast(b: BroadcastRow, error: string): Promise<SendBroadcastOutcome> {
  const [failed] = await db
    .update(broadcasts)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, "sending")))
    .returning({ id: broadcasts.id });

  if (failed) {
    await db.insert(auditLog).values({
      businessId: b.businessId,
      actorId: null,
      actorType: "system",
      action: "broadcast_failed",
      details: { broadcastId: b.id, name: b.name, error },
    });
    logger.warn({ broadcastId: b.id, error }, "Broadcast failed");
  }
  await emitBroadcastProgress(b.businessId, b.id, { force: true });
  return failed ? "failed" : "skipped";
}

/**
 * Freeze the audience into broadcast_recipients (only once: a retried job keeps
 * the original snapshot). Returns an error code when the broadcast cannot go out.
 */
async function snapshotRecipients(b: BroadcastRow): Promise<string | null> {
  const [existing] = await db
    .select({ id: broadcastRecipients.id })
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, b.id))
    .limit(1);
  if (existing) return null;

  const audience = await listAudience({ businessId: b.businessId, segment: b.segment, filters: b.filters });
  if (audience.length === 0) return "empty_audience";
  if (audience.length > config.BROADCAST_MAX_RECIPIENTS) return "audience_too_large";

  // One statement: the snapshot is all-or-nothing.
  await db
    .insert(broadcastRecipients)
    .values(
      audience.map((a) => ({
        businessId: b.businessId,
        broadcastId: b.id,
        customerId: a.customerId,
        conversationId: a.conversationId,
        phone: a.phone,
        status: "pending" as const,
      })),
    )
    .onConflictDoNothing();

  await db.update(broadcasts).set({ recipientCount: audience.length }).where(eq(broadcasts.id, b.id));
  return null;
}

/** Recipient update guarded on "pending", so a retry or a receipt never gets overwritten. */
async function markRecipient(id: string, set: Partial<RecipientRow>): Promise<void> {
  await db
    .update(broadcastRecipients)
    .set(set)
    .where(and(eq(broadcastRecipients.id, id), eq(broadcastRecipients.status, "pending")));
}

interface PendingRow {
  recipient: RecipientRow;
  customerId: string | null;
  customerName: string | null;
  optedOut: boolean | null;
}

async function sendToRecipient(b: BroadcastRow, template: TemplateRow, row: PendingRow): Promise<void> {
  const r = row.recipient;

  // Re-checked at send time: a STOP after the snapshot still wins.
  if (!row.customerId) {
    await markRecipient(r.id, { status: "failed", error: "customer_not_found" });
    return;
  }
  if (row.optedOut) {
    await markRecipient(r.id, { status: "failed", error: "opted_out" });
    return;
  }

  // The recipient's own name always fills {customerName}.
  const { text, missing } = renderTemplate(template.body, {
    ...b.variables,
    customerName: row.customerName ?? r.phone,
  });
  if (missing.length > 0) {
    await markRecipient(r.id, { status: "failed", error: `missing_variables: ${missing.join(", ")}` });
    return;
  }

  // Show the broadcast in the customer's thread when they have one; never create a conversation.
  let msg: typeof messages.$inferSelect | undefined;
  if (r.conversationId) {
    [msg] = await db
      .insert(messages)
      .values({
        conversationId: r.conversationId,
        businessId: b.businessId,
        direction: "outbound",
        senderType: "system",
        content: text,
        deliveryStatus: "queued",
        metadata: { kind: "broadcast", broadcastId: b.id, templateId: template.id },
      })
      .returning();
  }

  try {
    // TODO(live): send the approved Meta template by template.metaTemplateName
    // with its parameters instead of the rendered text.
    const result = await sendMessage({
      channelType: "whatsapp",
      recipient: r.phone,
      text,
      businessId: b.businessId,
      conversationId: r.conversationId,
    });
    const metaMessageId = result?.metaMessageId ?? null;

    await markRecipient(r.id, { status: "sent", sentAt: new Date(), messageId: msg?.id ?? null, metaMessageId });
    if (msg) {
      await db
        .update(messages)
        .set({ deliveryStatus: "sent", ...(metaMessageId ? { metaMessageId } : {}) })
        .where(eq(messages.id, msg.id));
      emitMessageNew({ ...msg, deliveryStatus: "sent", metaMessageId });
    }
  } catch (err) {
    logger.warn({ err, broadcastId: b.id, recipientId: r.id }, "Broadcast send failed for recipient");
    await markRecipient(r.id, { status: "failed", error: errorText(err), messageId: msg?.id ?? null });
    if (msg) {
      await db.update(messages).set({ deliveryStatus: "failed" }).where(eq(messages.id, msg.id));
      emitMessageNew({ ...msg, deliveryStatus: "failed" });
    }
  }
}

async function currentStatus(id: string): Promise<BroadcastRow["status"] | null> {
  const [row] = await db.select({ status: broadcasts.status }).from(broadcasts).where(eq(broadcasts.id, id));
  return row?.status ?? null;
}

/**
 * Send a broadcast whose status is "sending" (set by POST /broadcasts send_now
 * or the dispatcher). Safe to retry: the audience is snapshotted once and only
 * pending recipients are sent. Stops between batches when cancelled.
 */
export async function sendBroadcastJob(
  params: SendBroadcastParams,
  opts: SendBroadcastOptions = {},
): Promise<{ outcome: SendBroadcastOutcome }> {
  const sleep = opts.sleep ?? defaultSleep;
  const [b] = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.id, params.broadcastId), eq(broadcasts.businessId, params.businessId)));

  if (!b || b.status !== "sending") {
    logger.info({ broadcastId: params.broadcastId, status: b?.status }, "send-broadcast skipped: not sending");
    return { outcome: "skipped" };
  }

  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, b.templateId), eq(messageTemplates.businessId, b.businessId)));
  if (!template || !isBroadcastableTemplate(template)) {
    return { outcome: await failBroadcast(b, "template_not_approved") };
  }
  if (missingBroadcastVariables(template.body, b.variables).length > 0) {
    return { outcome: await failBroadcast(b, "template_variables_missing") };
  }

  const snapshotError = await snapshotRecipients(b);
  if (snapshotError) return { outcome: await failBroadcast(b, snapshotError) };
  await emitBroadcastProgress(b.businessId, b.id, { force: true, status: "sending" });

  const gapMs = 1000 / config.BROADCAST_RATE_PER_SEC;
  const attempted = new Set<string>();

  for (;;) {
    const status = await currentStatus(b.id);
    if (status !== "sending") {
      logger.info({ broadcastId: b.id, status }, "Broadcast stopped before finishing");
      await emitBroadcastProgress(b.businessId, b.id, { force: true });
      return { outcome: status === "cancelled" ? "cancelled" : "skipped" };
    }

    const batch: PendingRow[] = await db
      .select({
        recipient: broadcastRecipients,
        customerId: customers.id,
        customerName: customers.name,
        optedOut: customers.optedOut,
      })
      .from(broadcastRecipients)
      .leftJoin(customers, eq(customers.id, broadcastRecipients.customerId))
      .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, "pending")))
      .orderBy(asc(broadcastRecipients.createdAt), asc(broadcastRecipients.id))
      .limit(BROADCAST_BATCH_SIZE);

    // Never spin on rows that stayed pending after an attempt.
    const fresh = batch.filter((row) => !attempted.has(row.recipient.id));
    if (fresh.length === 0) break;

    for (const row of fresh) {
      attempted.add(row.recipient.id);
      await sendToRecipient(b, template, row);
      await emitBroadcastProgress(b.businessId, b.id, { status: "sending" });
      await sleep(gapMs);
    }
  }

  const stats = (await broadcastStats([b.id])).get(b.id) ?? emptyStats();
  const reached = stats.sent + stats.delivered + stats.read;
  const finalStatus = reached > 0 ? "sent" : "failed";

  // Guarded: a cancel during the last batch wins.
  const [done] = await db
    .update(broadcasts)
    .set({
      status: finalStatus,
      completedAt: new Date(),
      error: finalStatus === "failed" ? "all_recipients_failed" : null,
    })
    .where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, "sending")))
    .returning({ id: broadcasts.id });

  if (!done) {
    await emitBroadcastProgress(b.businessId, b.id, { force: true });
    return { outcome: "cancelled" };
  }

  await db.insert(auditLog).values({
    businessId: b.businessId,
    actorId: null,
    actorType: "system",
    action: "broadcast_sent",
    details: { broadcastId: b.id, name: b.name, status: finalStatus, ...stats },
  });
  await emitBroadcastProgress(b.businessId, b.id, { force: true, status: finalStatus });
  logger.info({ broadcastId: b.id, status: finalStatus, ...stats }, "Broadcast finished");
  return { outcome: finalStatus };
}

/**
 * Move due scheduled broadcasts to "sending" (atomic UPDATE … RETURNING, so two
 * dispatchers never claim the same one) and return them for enqueueing. Also
 * returns "sending" broadcasts that look stuck (job lost) so they are re-enqueued;
 * the send-broadcast queue's singletonKey keeps that from running twice.
 */
export async function claimDueBroadcasts(now: Date = new Date()): Promise<SendBroadcastParams[]> {
  const due = await db
    .update(broadcasts)
    .set({ status: "sending", startedAt: now })
    .where(and(eq(broadcasts.status, "scheduled"), lte(broadcasts.scheduledAt, now)))
    .returning({ broadcastId: broadcasts.id, businessId: broadcasts.businessId });

  const stuck = await db
    .select({ broadcastId: broadcasts.id, businessId: broadcasts.businessId })
    .from(broadcasts)
    .where(
      and(eq(broadcasts.status, "sending"), lt(broadcasts.startedAt, new Date(now.getTime() - STUCK_SENDING_MS))),
    );

  for (const d of due) {
    await emitBroadcastProgress(d.businessId, d.broadcastId, { force: true, status: "sending" });
  }
  return [...due, ...stuck];
}
