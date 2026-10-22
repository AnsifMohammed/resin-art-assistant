import { config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";

export interface SendMessageOptions {
  channelType: "whatsapp" | "instagram";
  recipient: string;
  text: string;
  businessId: string;
  /** null for sends outside a conversation (e.g. a broadcast to a customer without one). */
  conversationId: string | null;
}

export interface SendMessageResult {
  /** Meta's message id (wamid / mid), used to match delivery receipts. null in DEMO_MODE. */
  metaMessageId: string | null;
}

const isDev = () => config.NODE_ENV === "development";

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  if (config.DEMO_MODE) {
    // Message text (and recipient identifiers) only appear in development logs.
    if (isDev()) {
      logger.info(
        {
          channel: opts.channelType,
          recipient: opts.recipient,
          conversationId: opts.conversationId,
          text: opts.text,
        },
        `[DEMO_MODE] Reply sent to ${opts.recipient} on ${opts.channelType}: "${opts.text}"`,
      );
    } else {
      logger.info(
        {
          channel: opts.channelType,
          businessId: opts.businessId,
          conversationId: opts.conversationId,
          textLength: opts.text.length,
        },
        "[DEMO_MODE] Reply logged (not sent)",
      );
    }
    return { metaMessageId: null };
  }

  // Live Meta delivery (WhatsApp Cloud API / Instagram) is not wired up yet.
  // Fail loudly so nothing is silently marked as sent.
  throw new AppError(501, "Live sending is not implemented yet", "LIVE_SEND_NOT_IMPLEMENTED");
}
