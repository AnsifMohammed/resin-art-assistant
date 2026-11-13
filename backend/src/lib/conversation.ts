import { eq } from "drizzle-orm";
import { db, type Db } from "../db/index.ts";
import { businesses, conversations, messages } from "../db/schema.ts";
import { logger } from "./logger.ts";

/** The transaction handle passed to db.transaction's callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Bump conversations.last_message_at (the inbox sort key) after a message is
 * stored. Prefer setting lastMessageAt in an update that already runs; use
 * this when there is none.
 */
export async function touchConversation(
  dbOrTx: Db | Tx,
  conversationId: string,
  at: Date = new Date(),
): Promise<void> {
  await dbOrTx
    .update(conversations)
    .set({ lastMessageAt: at })
    .where(eq(conversations.id, conversationId));
}

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/**
 * Mark an outbound message as sent and store Meta's message id on it, so the
 * echo Meta sends back for our own message is de-duplicated (unique index on
 * meta_message_id) and delivery receipts can find it. If another row already
 * holds that id, the status is still updated without it.
 */
export async function markMessageSent(
  dbOrTx: Db | Tx,
  messageId: string,
  metaMessageId: string | null | undefined,
): Promise<void> {
  if (metaMessageId) {
    try {
      await dbOrTx
        .update(messages)
        .set({ deliveryStatus: "sent", metaMessageId })
        .where(eq(messages.id, messageId));
      return;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      logger.warn({ messageId, metaMessageId }, "Meta message id already stored on another row");
    }
  }
  await dbOrTx.update(messages).set({ deliveryStatus: "sent" }).where(eq(messages.id, messageId));
}

/**
 * The global "pause automation" switch written by POST /settings/pause.
 *
 * Lives here rather than beside the pipeline so that both the pipeline and the
 * services it calls can read it without importing each other.
 */
export async function isAutomationPaused(businessId: string): Promise<boolean> {
  const [biz] = await db
    .select({ settings: businesses.settings })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  const settings = (biz?.settings as Record<string, unknown> | null) ?? {};
  return Boolean(settings.automation_paused);
}
