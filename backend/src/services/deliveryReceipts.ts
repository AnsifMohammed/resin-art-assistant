import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { broadcastRecipients, messages } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { emitBroadcastProgress } from "./broadcastProgress.ts";

export type ReceiptStatus = "sent" | "delivered" | "read" | "failed";
type RecipientStatus = (typeof broadcastRecipients.$inferSelect)["status"];
type MessageStatus = NonNullable<(typeof messages.$inferSelect)["deliveryStatus"]>;

/**
 * Statuses a row may move FROM for each receipt. Receipts only move forward
 * (pending < sent < delivered < read); failed only replaces pending/sent, so a
 * late or out-of-order receipt never downgrades a row.
 */
export const RECIPIENT_FORWARD_FROM: Record<ReceiptStatus, RecipientStatus[]> = {
  sent: ["pending"],
  delivered: ["pending", "sent"],
  read: ["pending", "sent", "delivered"],
  failed: ["pending", "sent"],
};

/** Same rule for messages.delivery_status ("queued" plays the role of "pending"). */
export const MESSAGE_FORWARD_FROM: Record<ReceiptStatus, MessageStatus[]> = {
  sent: ["queued"],
  delivered: ["queued", "sent"],
  read: ["queued", "sent", "delivered"],
  failed: ["queued", "sent"],
};

const RECEIPT_STATUSES = new Set<string>(["sent", "delivered", "read", "failed"]);

/** Whether a receipt may move a recipient row from `from` to `to`. */
export function canAdvance(from: RecipientStatus, to: ReceiptStatus): boolean {
  return RECIPIENT_FORWARD_FROM[to].includes(from);
}

/** Meta's unix-seconds timestamp → Date (now when missing/invalid). */
function receiptTime(raw: unknown): Date {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function receiptError(errors: unknown): string {
  const first = Array.isArray(errors) ? errors[0] : undefined;
  if (!first || typeof first !== "object") return "failed";
  const e = first as { code?: unknown; title?: unknown; message?: unknown };
  const text = [e.code, e.title ?? e.message].filter((v) => v !== undefined && v !== null && v !== "").join(": ");
  return (text || "failed").slice(0, 500);
}

/**
 * Apply one WhatsApp `value.statuses[]` entry ({ id, status, timestamp, errors })
 * to broadcast_recipients and messages matched by meta message id. Forward-only.
 */
export async function applyWhatsAppStatus(raw: unknown): Promise<void> {
  const st = (raw ?? {}) as { id?: unknown; status?: unknown; timestamp?: unknown; errors?: unknown };
  const metaMessageId = typeof st.id === "string" ? st.id : "";
  const status = typeof st.status === "string" ? st.status : "";
  if (!metaMessageId || !RECEIPT_STATUSES.has(status)) return;
  const next = status as ReceiptStatus;
  const at = receiptTime(st.timestamp);

  const recipientSet =
    next === "delivered"
      ? { status: next, deliveredAt: at }
      : next === "read"
        ? { status: next, readAt: at }
        : next === "failed"
          ? { status: next, error: receiptError(st.errors) }
          : { status: next, sentAt: at };

  const updated = await db
    .update(broadcastRecipients)
    .set(recipientSet)
    .where(
      and(
        eq(broadcastRecipients.metaMessageId, metaMessageId),
        inArray(broadcastRecipients.status, RECIPIENT_FORWARD_FROM[next]),
      ),
    )
    .returning({ broadcastId: broadcastRecipients.broadcastId, businessId: broadcastRecipients.businessId });

  await db
    .update(messages)
    .set({ deliveryStatus: next })
    .where(and(eq(messages.metaMessageId, metaMessageId), inArray(messages.deliveryStatus, MESSAGE_FORWARD_FROM[next])));

  const seen = new Set<string>();
  for (const row of updated ?? []) {
    if (seen.has(row.broadcastId)) continue;
    seen.add(row.broadcastId);
    await emitBroadcastProgress(row.businessId, row.broadcastId);
  }

  logger.info({ metaMessageId, status: next, recipients: updated?.length ?? 0 }, "Applied WhatsApp delivery receipt");
}
