import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { auditLog, customers, messages } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { OPT_IN_ACK, OPT_OUT_ACK, optKeywordAction, type OptKeywordAction } from "../lib/optOut.ts";
import { emitCustomerUpdated, emitMessageNew } from "../realtime/events.ts";
import { sendMessage } from "./send.ts";

export interface InboundOptKeyword {
  businessId: string;
  customer: { id: string; optedOut?: boolean | null };
  conversationId: string;
  channelType: "whatsapp" | "instagram";
  /** customers.handleOrPhone */
  recipient: string;
  text: string;
  /** The stored inbound message (for the audit trail). */
  messageId: string;
}

/**
 * Handle STOP / START after an inbound customer message was stored.
 * Updates the customer's opt-out flags, audits, sends an acknowledgement and
 * returns the action. Returns null for any other message (caller continues to
 * the AI). The caller must NOT enqueue the AI when this returns an action.
 */
export async function handleOptKeyword(m: InboundOptKeyword): Promise<OptKeywordAction | null> {
  const wasOptedOut = Boolean(m.customer.optedOut);
  const action = optKeywordAction(m.text, wasOptedOut);
  if (!action) return null;

  // A repeated STOP is acknowledged again but keeps the original opt-out time.
  const changed = action === "opt_out" ? !wasOptedOut : wasOptedOut;
  if (changed) {
    await db
      .update(customers)
      .set(
        action === "opt_out"
          ? { optedOut: true, optedOutAt: new Date(), optOutSource: "keyword" }
          : { optedOut: false, optedOutAt: null, optOutSource: null },
      )
      .where(eq(customers.id, m.customer.id));

    await db.insert(auditLog).values({
      businessId: m.businessId,
      actorId: null,
      actorType: "system",
      action: action === "opt_out" ? "customer_opted_out" : "customer_opted_in",
      conversationId: m.conversationId,
      details: { customerId: m.customer.id, source: "keyword", messageId: m.messageId },
    });

    emitCustomerUpdated(m.businessId, { customerId: m.customer.id });
  }

  await sendAck(m, action === "opt_out" ? OPT_OUT_ACK : OPT_IN_ACK, action);
  return action;
}

/** Store + send the acknowledgement as an outbound system message. Never throws. */
async function sendAck(m: InboundOptKeyword, text: string, action: OptKeywordAction): Promise<void> {
  try {
    const [queued] = await db
      .insert(messages)
      .values({
        conversationId: m.conversationId,
        businessId: m.businessId,
        direction: "outbound",
        senderType: "system",
        content: text,
        deliveryStatus: "queued",
        metadata: { kind: action === "opt_out" ? "opt_out_ack" : "opt_in_ack" },
      })
      .returning();

    let status: "sent" | "failed" = "sent";
    let metaMessageId: string | null = null;
    try {
      const result = await sendMessage({
        channelType: m.channelType,
        recipient: m.recipient,
        text,
        businessId: m.businessId,
        conversationId: m.conversationId,
      });
      metaMessageId = result?.metaMessageId ?? null;
    } catch (err) {
      status = "failed";
      logger.error({ err, conversationId: m.conversationId }, "Failed to send opt-out acknowledgement");
    }

    if (queued) {
      await db
        .update(messages)
        .set({ deliveryStatus: status, ...(metaMessageId ? { metaMessageId } : {}) })
        .where(eq(messages.id, queued.id));
      emitMessageNew({ ...queued, deliveryStatus: status, metaMessageId: metaMessageId ?? queued.metaMessageId });
    }
  } catch (err) {
    logger.error({ err, conversationId: m.conversationId }, "Failed to store opt-out acknowledgement");
  }
}
