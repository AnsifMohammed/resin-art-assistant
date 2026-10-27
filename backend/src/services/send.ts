import { config, isInstagramLive } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { sendInstagramText, sendInstagramMedia } from "./meta/instagram.ts";

export interface SendMessageOptions {
  channelType: "whatsapp" | "instagram";
  recipient: string;
  text?: string | undefined;
  mediaUrls?: string[] | undefined;
  businessId: string;
  /** null for sends outside a conversation (e.g. a broadcast to a customer without one). */
  conversationId: string | null;
}

export interface SendMessageResult {
  /**
   * Meta's message id (wamid / mid). Callers store it on the outbound message row
   * so delivery receipts and Meta's echo of our own send are matched to it. null in DEMO_MODE.
   */
  metaMessageId: string | null;
}

const isDev = () => config.NODE_ENV === "development";

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  const messageText = opts.text ?? "";
  const mediaUrls = opts.mediaUrls ?? [];

  // Instagram goes live with INSTAGRAM_LIVE=true even while DEMO_MODE=true.
  if (opts.channelType === "instagram" && isInstagramLive(config)) {
    let firstMetaMessageId: string | null = null;
    let partsCount = 0;

    // Send text message if text is provided
    if (messageText.trim().length > 0) {
      const textResult = await sendInstagramText({
        recipientId: opts.recipient,
        text: messageText,
        businessId: opts.businessId,
      });
      firstMetaMessageId = textResult.metaMessageId;
      partsCount = textResult.metaMessageIds.length;
    }

    // Send media attachments if present
    if (mediaUrls.length > 0) {
      for (const mediaUrl of mediaUrls) {
        const mediaResult = await sendInstagramMedia({
          recipientId: opts.recipient,
          mediaUrl,
          businessId: opts.businessId,
        });
        if (!firstMetaMessageId) {
          firstMetaMessageId = mediaResult.metaMessageId;
        }
      }
    }

    // Ids and length only: never the text or the recipient outside development.
    logger.info(
      {
        channel: opts.channelType,
        businessId: opts.businessId,
        conversationId: opts.conversationId,
        metaMessageId: firstMetaMessageId,
        parts: partsCount,
        textLength: messageText.length,
        mediaCount: mediaUrls.length,
      },
      "Instagram message sent",
    );
    return { metaMessageId: firstMetaMessageId };
  }

  if (config.DEMO_MODE) {
    // Message text (and recipient identifiers) only appear in development logs.
    if (isDev()) {
      logger.info(
        {
          channel: opts.channelType,
          recipient: opts.recipient,
          conversationId: opts.conversationId,
          text: messageText,
          mediaUrls: opts.mediaUrls,
        },
        `[DEMO_MODE] Reply sent to ${opts.recipient} on ${opts.channelType}: "${messageText}" (${opts.mediaUrls?.length ?? 0} attachments)`,
      );
    } else {
      logger.info(
        {
          channel: opts.channelType,
          businessId: opts.businessId,
          conversationId: opts.conversationId,
          textLength: messageText.length,
          mediaCount: opts.mediaUrls?.length ?? 0,
        },
        "[DEMO_MODE] Reply logged (not sent)",
      );
    }
    return { metaMessageId: null };
  }

  // Live WhatsApp Cloud API delivery is not wired up yet.
  // Fail loudly so nothing is silently marked as sent.
  throw new AppError(501, "Live sending is not implemented yet", "LIVE_SEND_NOT_IMPLEMENTED");
}
