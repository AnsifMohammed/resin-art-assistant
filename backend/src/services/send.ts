import { config, isInstagramLive } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { sendInstagramText, sendInstagramMedia, sendInstagramProductCards } from "./meta/instagram.ts";
import {
  sendWhatsAppText,
  sendWhatsAppMedia,
  sendWhatsAppInteractiveCard,
  sendWhatsAppInteractiveList,
} from "./meta/whatsapp.ts";

export interface InteractiveProduct {
  id: string;
  slug: string;
  name: string;
  price: string;
  imageUrl?: string | undefined;
  images?: string[] | undefined;
  leadTime: number;
  description?: string | undefined;
  customizable?: boolean | undefined;
  customOptions?: string[] | undefined;
}

export interface InteractiveOptions {
  type: "catalogue_card" | "catalogue_list";
  products: InteractiveProduct[];
}

export interface SendMessageOptions {
  channelType: "whatsapp" | "instagram";
  recipient: string;
  text?: string | undefined;
  mediaUrls?: string[] | undefined;
  interactive?: InteractiveOptions | undefined;
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

    // Send interactive catalogue generic template if specified
    if (opts.interactive && opts.interactive.products.length > 0) {
      const cardResult = await sendInstagramProductCards({
        recipientId: opts.recipient,
        products: opts.interactive.products,
        businessId: opts.businessId,
      });
      firstMetaMessageId = cardResult.metaMessageId;
      partsCount = opts.interactive.products.length;
    }

    // Send text message if text is provided and no interactive card was sent
    if (messageText.trim().length > 0 && !opts.interactive) {
      const textResult = await sendInstagramText({
        recipientId: opts.recipient,
        text: messageText,
        businessId: opts.businessId,
      });
      firstMetaMessageId = textResult.metaMessageId;
      partsCount = textResult.metaMessageIds.length;
    }

    // Send media attachments if present (suppressed when interactive catalogue template is sent)
    if (mediaUrls.length > 0 && !opts.interactive) {
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
        interactive: Boolean(opts.interactive),
      },
      "Instagram message sent",
    );
    return { metaMessageId: firstMetaMessageId };
  }

  // Live WhatsApp delivery when not in demo mode or when explicitly configured
  if (opts.channelType === "whatsapp" && (!config.DEMO_MODE || Boolean(config.WHATSAPP_TOKEN))) {
    let firstMetaMessageId: string | null = null;
    let partsCount = 0;

    if (opts.interactive && opts.interactive.products.length > 0) {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const productsToSend = opts.interactive.products.slice(0, 10);

      for (let i = 0; i < productsToSend.length; i++) {
        const prod = productsToSend[i]!;
        const specsText =
          productsToSend.length === 1 && messageText
            ? messageText
            : `✨ *${prod.name}*\n💰 ${prod.price}\n⏱️ Lead time: ~${prod.leadTime} days${prod.description ? `\n\n${prod.description}` : ""}`;

        const cardResult = await sendWhatsAppInteractiveCard({
          recipientPhone: opts.recipient,
          slug: prod.slug,
          title: prod.name,
          specsText,
          imageUrl: prod.imageUrl,
          businessId: opts.businessId,
        });

        if (!firstMetaMessageId) {
          firstMetaMessageId = cardResult.metaMessageId;
        }
        partsCount++;

        if (i < productsToSend.length - 1) {
          await delay(150);
        }
      }
    } else if (mediaUrls.length > 0) {
      for (let i = 0; i < mediaUrls.length; i++) {
        const mediaUrl = mediaUrls[i];
        if (!mediaUrl) continue;
        // Send caption with the last media item if messageText is present
        const caption =
          i === mediaUrls.length - 1 && messageText.trim().length > 0 ? messageText.trim() : undefined;
        const mediaResult = await sendWhatsAppMedia({
          recipientPhone: opts.recipient,
          mediaUrl,
          caption,
          businessId: opts.businessId,
        });
        if (!firstMetaMessageId) {
          firstMetaMessageId = mediaResult.metaMessageId;
        }
        partsCount++;
      }
    } else if (messageText.trim().length > 0) {
      const textResult = await sendWhatsAppText({
        recipientPhone: opts.recipient,
        text: messageText,
        businessId: opts.businessId,
      });
      firstMetaMessageId = textResult.metaMessageId;
      partsCount = 1;
    }

    logger.info(
      {
        channel: opts.channelType,
        businessId: opts.businessId,
        conversationId: opts.conversationId,
        metaMessageId: firstMetaMessageId,
        parts: partsCount,
        textLength: messageText.length,
        mediaCount: mediaUrls.length,
        interactive: Boolean(opts.interactive),
      },
      "WhatsApp message sent",
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
          interactive: opts.interactive,
        },
        `[DEMO_MODE] Reply sent to ${opts.recipient} on ${opts.channelType}: "${messageText}" (${opts.mediaUrls?.length ?? 0} attachments, ${opts.interactive?.products.length ?? 0} interactive products)`,
      );
    } else {
      logger.info(
        {
          channel: opts.channelType,
          businessId: opts.businessId,
          conversationId: opts.conversationId,
          textLength: messageText.length,
          mediaCount: opts.mediaUrls?.length ?? 0,
          interactiveProductsCount: opts.interactive?.products.length ?? 0,
        },
        "[DEMO_MODE] Reply logged (not sent)",
      );
    }
    return { metaMessageId: null };
  }

  throw new AppError(501, "Live sending is not implemented yet", "LIVE_SEND_NOT_IMPLEMENTED");
}
