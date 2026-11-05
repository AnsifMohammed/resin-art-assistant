import { and, eq } from "drizzle-orm";
import { config } from "../../config.ts";
import { db } from "../../db/index.ts";
import { channels } from "../../db/schema.ts";
import { decrypt } from "../../lib/crypto.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";

export const WHATSAPP_API_HOST = "https://graph.facebook.com";
export const WHATSAPP_API_VERSION = "v21.0";

export async function resolveWhatsAppToken(businessId: string = config.BUSINESS_ID): Promise<string> {
  const rows = await db
    .select({ id: channels.id, encryptedToken: channels.encryptedToken })
    .from(channels)
    .where(and(eq(channels.businessId, businessId), eq(channels.type, "whatsapp")));
  const withToken = rows.find((r) => r.encryptedToken);
  if (withToken?.encryptedToken) {
    try {
      return decrypt(withToken.encryptedToken);
    } catch (err) {
      logger.error(
        { channelId: withToken.id, errName: err instanceof Error ? err.name : "unknown" },
        "Could not decrypt WhatsApp channel token; falling back to env",
      );
    }
  }
  if (config.WHATSAPP_TOKEN) {
    return config.WHATSAPP_TOKEN;
  }
  throw new AppError(503, "WhatsApp is not connected for this business", "WHATSAPP_NOT_CONFIGURED");
}

export async function resolveWhatsAppPhoneNumberId(businessId: string = config.BUSINESS_ID): Promise<string> {
  const [row] = await db
    .select({ identifier: channels.identifier })
    .from(channels)
    .where(and(eq(channels.businessId, businessId), eq(channels.type, "whatsapp")));
  if (row?.identifier) {
    return row.identifier;
  }
  if (config.WHATSAPP_PHONE_NUMBER_ID) {
    return config.WHATSAPP_PHONE_NUMBER_ID;
  }
  throw new AppError(503, "WhatsApp phone number ID is not configured", "WHATSAPP_NOT_CONFIGURED");
}

export interface SendWhatsAppTextOptions {
  recipientPhone: string;
  text: string;
  businessId?: string | undefined;
}

export interface SendWhatsAppMediaOptions {
  recipientPhone: string;
  mediaUrl: string;
  caption?: string | undefined;
  businessId?: string | undefined;
}

export async function sendWhatsAppText(
  opts: SendWhatsAppTextOptions,
): Promise<{ metaMessageId: string }> {
  const token = await resolveWhatsAppToken(opts.businessId);
  const phoneNumberId = await resolveWhatsAppPhoneNumberId(opts.businessId);

  const cleanPhone = opts.recipientPhone.replace(/\D/g, "");
  const url = `${WHATSAPP_API_HOST}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "text",
      text: { body: opts.text },
    }),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errorMsg =
      (body?.error as { message?: string } | undefined)?.message || `WhatsApp API HTTP ${res.status}`;
    logger.error({ status: res.status, errorMsg, recipient: cleanPhone }, "WhatsApp text send failed");
    throw new AppError(502, `WhatsApp send failed: ${errorMsg}`, "META_ERROR");
  }

  const mid = (body as { messages?: Array<{ id: string }> })?.messages?.[0]?.id;
  if (!mid) {
    throw new AppError(502, "WhatsApp response had no message id", "META_ERROR");
  }
  return { metaMessageId: mid };
}

export async function sendWhatsAppMedia(
  opts: SendWhatsAppMediaOptions,
): Promise<{ metaMessageId: string }> {
  const token = await resolveWhatsAppToken(opts.businessId);
  const phoneNumberId = await resolveWhatsAppPhoneNumberId(opts.businessId);

  const cleanPhone = opts.recipientPhone.replace(/\D/g, "");
  const url = `${WHATSAPP_API_HOST}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const ext = opts.mediaUrl.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  const isVideo =
    ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext) ||
    opts.mediaUrl.includes("/video/upload/");
  const isAudio = ["mp3", "ogg", "wav", "m4a", "aac"].includes(ext);
  const isDocument = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext);

  const mediaType = isVideo ? "video" : isAudio ? "audio" : isDocument ? "document" : "image";

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: mediaType,
    [mediaType]: {
      link: opts.mediaUrl,
      ...(opts.caption ? { caption: opts.caption } : {}),
      ...(mediaType === "document"
        ? { filename: opts.mediaUrl.split("/").pop() || "document" }
        : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errorMsg =
      (body?.error as { message?: string } | undefined)?.message || `WhatsApp API HTTP ${res.status}`;
    logger.error(
      { status: res.status, errorMsg, recipient: cleanPhone, mediaUrl: opts.mediaUrl },
      "WhatsApp media send failed",
    );
    throw new AppError(502, `WhatsApp media send failed: ${errorMsg}`, "META_ERROR");
  }

  const mid = (body as { messages?: Array<{ id: string }> })?.messages?.[0]?.id;
  if (!mid) {
    throw new AppError(502, "WhatsApp response had no message id", "META_ERROR");
  }
  return { metaMessageId: mid };
}

export interface SendWhatsAppInteractiveCardOptions {
  recipientPhone: string;
  slug: string;
  title: string;
  specsText: string;
  imageUrl?: string | undefined;
  businessId?: string | undefined;
}

export async function sendWhatsAppInteractiveCard(
  opts: SendWhatsAppInteractiveCardOptions,
): Promise<{ metaMessageId: string }> {
  const token = await resolveWhatsAppToken(opts.businessId);
  const phoneNumberId = await resolveWhatsAppPhoneNumberId(opts.businessId);

  const cleanPhone = opts.recipientPhone.replace(/\D/g, "");
  const url = `${WHATSAPP_API_HOST}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "interactive",
    interactive: {
      type: "button",
      ...(opts.imageUrl
        ? {
          header: {
            type: "image",
            image: { link: opts.imageUrl },
          },
        }
        : {}),
      body: {
        text: opts.specsText,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `action:enquire:${opts.slug}`,
              title: "💬 Enquire Now",
            },
          },
        ],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errorMsg =
      (body?.error as { message?: string } | undefined)?.message || `WhatsApp API HTTP ${res.status}`;
    logger.error(
      { status: res.status, errorMsg, recipient: cleanPhone, slug: opts.slug },
      "WhatsApp interactive button send failed",
    );
    throw new AppError(502, `WhatsApp send failed: ${errorMsg}`, "META_ERROR");
  }

  const mid = (body as { messages?: Array<{ id: string }> })?.messages?.[0]?.id;
  if (!mid) {
    throw new AppError(502, "WhatsApp response had no message id", "META_ERROR");
  }
  return { metaMessageId: mid };
}

export interface WhatsAppListItem {
  id: string;
  slug: string;
  name: string;
  price: string;
  leadTime: number;
  description?: string | undefined;
}

export interface SendWhatsAppInteractiveListOptions {
  recipientPhone: string;
  headerText?: string | undefined;
  bodyText: string;
  products: WhatsAppListItem[];
  businessId?: string | undefined;
}

export async function sendWhatsAppInteractiveList(
  opts: SendWhatsAppInteractiveListOptions,
): Promise<{ metaMessageId: string }> {
  const token = await resolveWhatsAppToken(opts.businessId);
  const phoneNumberId = await resolveWhatsAppPhoneNumberId(opts.businessId);

  const cleanPhone = opts.recipientPhone.replace(/\D/g, "");
  const url = `${WHATSAPP_API_HOST}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const rows = opts.products.slice(0, 10).map((p) => {
    const title = p.name.slice(0, 24);
    const desc = `${p.price} • ${p.leadTime}d lead time`.slice(0, 72);
    return {
      id: `enquire:${p.slug}`,
      title,
      description: desc,
    };
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: (opts.headerText || "Our Resin Collection").slice(0, 60),
      },
      body: {
        text: opts.bodyText.slice(0, 1024),
      },
      action: {
        button: "Browse Products",
        sections: [
          {
            title: "Featured Creations".slice(0, 24),
            rows,
          },
        ],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const errorMsg =
      (body?.error as { message?: string } | undefined)?.message || `WhatsApp API HTTP ${res.status}`;
    logger.error(
      { status: res.status, errorMsg, recipient: cleanPhone },
      "WhatsApp interactive list send failed",
    );
    throw new AppError(502, `WhatsApp send failed: ${errorMsg}`, "META_ERROR");
  }

  const mid = (body as { messages?: Array<{ id: string }> })?.messages?.[0]?.id;
  if (!mid) {
    throw new AppError(502, "WhatsApp response had no message id", "META_ERROR");
  }
  return { metaMessageId: mid };
}
