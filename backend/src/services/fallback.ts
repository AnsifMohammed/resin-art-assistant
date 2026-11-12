import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { auditLog, channels, conversations, customers, messages } from "../db/schema.ts";
import { isAutomationPaused, markMessageSent } from "../lib/conversation.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { emitMessageNew } from "../realtime/events.ts";
import { sendMessage } from "./send.ts";

/**
 * The one guarantee: a customer message never goes unanswered.
 *
 * The pipeline has many legitimate ways to end without replying (conversation
 * not ai_active, automation paused, escalation, AI error, empty batch). Rather
 * than patching each one, this runs once at the end and asks a single question:
 * did the customer actually receive anything? If not, it sends this line.
 */
export const FALLBACK_TEXT = "Thanks for your message! Our team will get back to you shortly 😊";

/** At most one fallback per conversation per hour, so a burst gets one note, not five. */
export const FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

/** Marks the messages this module sends, so they are never counted as real replies. */
export const FALLBACK_KIND = "fallback";

function isFallback(m: typeof messages.$inferSelect): boolean {
  return (m.metadata as { kind?: string } | null)?.kind === FALLBACK_KIND;
}

export interface EnsureCustomerAnsweredParams {
  conversationId: string;
  businessId: string;
}

/**
 * Send the fallback line if — and only if — the customer's latest message got
 * no outbound message at all. Returns true when a fallback was sent.
 *
 * Never throws: a failure here must not fail the job that called it.
 */
export async function ensureCustomerAnswered(params: EnsureCustomerAnsweredParams): Promise<boolean> {
  const { conversationId, businessId } = params;
  try {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)));

    if (!conv) return false;

    // A human is already in the thread; they answer, not us.
    if (conv.state === "owner_handling") return false;

    // Pausing means pausing. The owner switched automation off deliberately, and
    // CLAUDE.md demo scenario 10 requires a paused business to stay silent, so a
    // fallback here would be both surprising and a regression.
    if (conv.state === "paused") return false;
    if (await isAutomationPaused(businessId)) {
      logger.info({ conversationId }, "Fallback skipped: automation paused");
      return false;
    }

    // Outside the 24h window Meta rejects the send, so there is nothing to gain.
    if (conv.windowClosesAt && new Date(conv.windowClosesAt) < new Date()) {
      logger.info({ conversationId }, "Fallback skipped: messaging window closed");
      return false;
    }

    // Recent slice of the thread is enough to answer "was the last inbound replied to?".
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(25);

    // Sorted again in memory: whether a customer is answered must not depend on
    // the driver honouring orderBy, and newest-first is what the checks below assume.
    const recent = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const lastInbound = recent.find((m) => m.direction === "inbound" && m.senderType === "customer");
    if (!lastInbound) return false;

    // Any outbound after the customer's last message counts as answered — including
    // one that failed to send. A failed send means the channel is down, so a second
    // message would fail too; that case belongs to alerting, not here.
    const lastOutbound = recent.find((m) => m.direction === "outbound");
    if (lastOutbound && lastOutbound.createdAt >= lastInbound.createdAt) return false;

    const lastFallback = recent.find((m) => m.direction === "outbound" && isFallback(m));
    if (lastFallback && Date.now() - lastFallback.createdAt.getTime() < FALLBACK_COOLDOWN_MS) {
      logger.info({ conversationId }, "Fallback skipped: still within cooldown");
      return false;
    }

    const [customer] = await db.select().from(customers).where(eq(customers.id, conv.customerId));
    const [channel] = await db.select().from(channels).where(eq(channels.id, conv.channelId));
    if (!customer?.handleOrPhone || !channel) {
      logger.warn({ conversationId }, "Fallback skipped: customer or channel missing");
      return false;
    }

    const [outbound] = await db
      .insert(messages)
      .values({
        conversationId,
        businessId,
        direction: "outbound",
        senderType: "ai",
        senderId: null,
        content: FALLBACK_TEXT,
        metadata: { kind: FALLBACK_KIND, state: conv.state },
        deliveryStatus: "queued",
      })
      .returning();

    if (!outbound) return false;

    let metaMessageId: string | null = null;
    try {
      const result = await sendMessage({
        channelType: channel.type,
        recipient: customer.handleOrPhone,
        text: FALLBACK_TEXT,
        businessId,
        conversationId,
      });
      metaMessageId = result?.metaMessageId ?? null;
      await markMessageSent(db, outbound.id, metaMessageId);
      emitMessageNew({ ...outbound, deliveryStatus: "sent", ...(metaMessageId ? { metaMessageId } : {}) });
    } catch (err) {
      // Never escalate on a failed fallback — that would loop. But do record it:
      // a fallback that fails silently is indistinguishable from one that never
      // ran, which makes "is this deployed?" impossible to answer from the data.
      logger.error({ err, conversationId }, "Fallback send failed");
      await db.update(messages).set({ deliveryStatus: "failed" }).where(eq(messages.id, outbound.id));
      emitMessageNew({ ...outbound, deliveryStatus: "failed" });
      await db.insert(auditLog).values({
        businessId,
        actorType: "system",
        action: "fallback_failed",
        conversationId,
        details: {
          messageId: outbound.id,
          state: conv.state,
          error: err instanceof Error ? err.message : String(err),
          ...(err instanceof AppError ? { code: err.code, meta: err.details ?? null } : {}),
        },
      });
      return false;
    }

    await db.insert(auditLog).values({
      businessId,
      actorType: "system",
      action: "fallback_sent",
      conversationId,
      details: { messageId: outbound.id, state: conv.state },
    });

    logger.info({ conversationId, state: conv.state }, "Fallback sent: customer message had no reply");
    return true;
  } catch (err) {
    logger.error({ err, conversationId }, "ensureCustomerAnswered failed");
    return false;
  }
}
