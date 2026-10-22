import { eq } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { conversations } from "../db/schema.ts";

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
