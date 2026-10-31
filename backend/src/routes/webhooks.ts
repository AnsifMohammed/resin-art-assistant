import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, gte, isNull } from "drizzle-orm";
import { config, isInstagramLive } from "../config.ts";
import { db } from "../db/index.ts";
import { auditLog, channels, conversations, customers, igComments, messages } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { enqueueProcessMessage } from "../queue/enqueue.ts";
import { enqueueProcessIgComment } from "../queue/enqueueIgComment.ts";
import { applyWhatsAppStatus } from "../services/deliveryReceipts.ts";
import { handleOptKeyword } from "../services/optOut.ts";
import {
  fetchInstagramDisplayName,
  type IgMedia,
  INSTAGRAM_MAX_TEXT_BYTES,
  fetchCommenterProfilePic,
  listRecentMedia,
  splitInstagramText,
} from "../services/meta/instagram.ts";
import { emitConversationUpdated, emitIgCommentNew, emitMessageNew } from "../realtime/events.ts";
import {
  digitsOnly,
  isWebhookRequestAuthorized,
  validateSignature,
  verifyHandshake,
} from "../services/meta/webhook.ts";

// Kept for backwards compatibility with existing imports.
export { validateSignature };

declare module "fastify" {
  interface FastifyRequest {
    /** Raw request bytes, captured only inside the webhook route scope. */
    rawBody?: Buffer;
  }
}

type ChannelType = "whatsapp" | "instagram";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Never log message text outside development; log its length instead. */
function textForLog(text: string): Record<string, unknown> {
  return config.NODE_ENV === "development" ? { text } : { textLength: text.length };
}

async function findChannel(type: ChannelType) {
  const [chan] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.businessId, config.BUSINESS_ID), eq(channels.type, type)));
  return chan;
}

async function findOrCreateChannel(type: ChannelType, identifier: string) {
  const existing = await findChannel(type);
  if (existing) return existing;
  const [created] = await db
    .insert(channels)
    .values({ businessId: config.BUSINESS_ID, type, identifier, status: "active" })
    .onConflictDoNothing()
    .returning();
  return created ?? (await findChannel(type));
}

async function findCustomer(channelId: string, handleOrPhone: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.businessId, config.BUSINESS_ID),
        eq(customers.channelId, channelId),
        eq(customers.handleOrPhone, handleOrPhone),
      ),
    );
  return customer;
}

async function findConversation(customerId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.businessId, config.BUSINESS_ID), eq(conversations.customerId, customerId)),
    );
  return conv;
}

interface InboundCustomerMessage {
  channelType: ChannelType;
  channelIdentifier: string;
  handleOrPhone: string;
  customerName: string;
  text: string;
  metaMessageId: string | undefined;
}

/** A normal customer message: store it, bump the 24h window and queue AI processing. */
async function handleCustomerMessage(m: InboundCustomerMessage): Promise<void> {
  const chan = await findOrCreateChannel(m.channelType, m.channelIdentifier);
  if (!chan) throw new Error("Could not resolve channel");

  let customer = await findCustomer(chan.id, m.handleOrPhone);
  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({
        businessId: config.BUSINESS_ID,
        channelId: chan.id,
        name: m.customerName,
        handleOrPhone: m.handleOrPhone,
      })
      .returning();
  }
  if (!customer) throw new Error("Could not resolve customer");

  // Instagram webhooks only carry the sender's id; look up their name/@username once
  // (new customers, and older ones still named by their id). The id stays in
  // handleOrPhone because replies are sent to it.
  if (
    m.channelType === "instagram" &&
    isInstagramLive(config) &&
    (!customer.name || customer.name === customer.handleOrPhone)
  ) {
    const displayName = await fetchInstagramDisplayName(m.handleOrPhone);
    if (displayName) {
      const [renamed] = await db
        .update(customers)
        .set({ name: displayName })
        .where(eq(customers.id, customer.id))
        .returning();
      if (renamed) customer = renamed;
    }
  }

  const now = new Date();
  const windowClosesAt = new Date(now.getTime() + WINDOW_MS);

  let conv = await findConversation(customer.id);
  const isNewConv = !conv;
  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({
        businessId: config.BUSINESS_ID,
        customerId: customer.id,
        channelId: chan.id,
        state: "ai_active",
        lastCustomerMessageAt: now,
        lastMessageAt: now,
        windowClosesAt,
      })
      .returning();
  }
  if (!conv) throw new Error("Could not resolve conversation");

  // Duplicate prevention: the unique index on meta_message_id makes this atomic.
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      businessId: config.BUSINESS_ID,
      direction: "inbound",
      senderType: "customer",
      content: m.text,
      metaMessageId: m.metaMessageId,
      deliveryStatus: "delivered",
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    logger.info({ metaMessageId: m.metaMessageId }, "Duplicate Meta message ignored");
    return;
  }

  if (!isNewConv) {
    await db
      .update(conversations)
      .set({ lastCustomerMessageAt: now, lastMessageAt: now, windowClosesAt })
      .where(eq(conversations.id, conv.id));
  }

  logger.info(
    { metaMessageId: m.metaMessageId, messageId: inserted.id, conversationId: conv.id, ...textForLog(m.text) },
    "Stored inbound customer message",
  );
  emitMessageNew(inserted);

  // STOP / START: update the opt-out flag and acknowledge; never sent to the AI.
  const optAction = await handleOptKeyword({
    businessId: config.BUSINESS_ID,
    customer,
    conversationId: conv.id,
    channelType: m.channelType,
    recipient: m.handleOrPhone,
    text: m.text,
    messageId: inserted.id,
  });
  if (optAction) {
    logger.info({ messageId: inserted.id, conversationId: conv.id, optAction }, "Opt keyword handled; AI skipped");
    return;
  }

  // The job re-checks state and the pause switch before doing anything.
  if (conv.state === "ai_active") {
    await enqueueProcessMessage({ conversationId: conv.id, businessId: config.BUSINESS_ID });
  }
}

/** How far back an echo is matched against our own recent outbound messages. */
const OWN_ECHO_LOOKBACK_MS = 10 * 60 * 1000;

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/**
 * Meta echoes every message the business account sends, including the ones WE
 * sent through the API (AI auto-replies, dashboard replies, acknowledgements).
 * Those are normally de-duplicated by meta_message_id, but the echo can arrive
 * before the send call returns and the id is stored. So an echo whose text
 * equals one of our recent, still-queued outbound messages in this
 * conversation (or one part of a reply we split into several Instagram
 * messages) is treated as our own send:
 * the id is attached to that row if it has none yet, and nothing else happens
 * (no owner message, no owner_handling).
 */
async function claimOwnOutboundEcho(conversationId: string, text: string, metaMessageId: string | undefined): Promise<boolean> {
  if (!text) return false;
  const since = new Date(Date.now() - OWN_ECHO_LOOKBACK_MS);
  const rows = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      content: messages.content,
      metaMessageId: messages.metaMessageId,
      deliveryStatus: messages.deliveryStatus,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "outbound"),
        gte(messages.createdAt, since),
      ),
    );
  const isOwn = (r: (typeof rows)[number]): boolean => {
    if (r.direction !== "outbound" || typeof r.content !== "string") return false;
    if (!(r.createdAt instanceof Date) || r.createdAt < since) return false;
    // Still in flight: the send has not returned (and stored its id) yet.
    if (r.content === text && r.deliveryStatus === "queued" && !r.metaMessageId) return true;
    // One part of a long reply that was split into several Instagram messages.
    return (
      Buffer.byteLength(r.content, "utf8") > INSTAGRAM_MAX_TEXT_BYTES &&
      splitInstagramText(r.content).includes(text)
    );
  };
  const own = rows
    .filter(isOwn)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!own) return false;

  if (!own.metaMessageId && metaMessageId) {
    try {
      await db
        .update(messages)
        .set({ metaMessageId })
        .where(and(eq(messages.id, own.id), isNull(messages.metaMessageId)));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  logger.info({ metaMessageId, messageId: own.id, conversationId }, "Echo of our own outbound message ignored");
  return true;
}

interface EchoMessage {
  channelType: ChannelType;
  recipientHandle: string | undefined;
  text: string;
  metaMessageId: string | undefined;
}

/**
 * The business replied from its own phone/app. Attach the message to the
 * recipient customer's existing conversation and hand it to the owner.
 * Never creates customers, never bumps the customer window, never queues AI.
 */
async function handleEcho(m: EchoMessage): Promise<void> {
  const logCtx = { metaMessageId: m.metaMessageId, channel: m.channelType };
  if (!m.recipientHandle) {
    logger.warn(logCtx, "Echo without recipient ignored");
    return;
  }

  const chan = await findChannel(m.channelType);
  const customer = chan ? await findCustomer(chan.id, m.recipientHandle) : undefined;
  const conv = customer ? await findConversation(customer.id) : undefined;
  if (!conv) {
    logger.warn(logCtx, "Echo for unknown customer/conversation ignored");
    return;
  }

  // Our own API send coming back: never an owner takeover.
  if (await claimOwnOutboundEcho(conv.id, m.text, m.metaMessageId)) return;

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      businessId: config.BUSINESS_ID,
      direction: "inbound",
      senderType: "owner",
      content: m.text,
      metaMessageId: m.metaMessageId,
      deliveryStatus: "delivered",
      metadata: { echo: true },
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    logger.info(logCtx, "Duplicate Meta echo ignored");
    return;
  }

  emitMessageNew(inserted);

  // One update bumps the inbox sort key and, if needed, hands the conversation to the owner.
  const stateChanged = conv.state !== "owner_handling";
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), ...(stateChanged ? { state: "owner_handling" as const } : {}) })
    .where(eq(conversations.id, conv.id));

  if (stateChanged) {
    await db.insert(auditLog).values({
      businessId: config.BUSINESS_ID,
      actorId: null,
      actorType: "system",
      action: "state_changed",
      conversationId: conv.id,
      details: { from: conv.state, to: "owner_handling", reason: "echo", messageId: inserted.id },
    });
    emitConversationUpdated(config.BUSINESS_ID, { conversationId: conv.id, state: "owner_handling", tag: conv.tag ?? null });
  }

  logger.info(
    { ...logCtx, messageId: inserted.id, conversationId: conv.id, ...textForLog(m.text) },
    "Stored owner echo; conversation handed to owner",
  );
}

async function processWhatsApp(body: any): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const contacts: any[] = Array.isArray(value.contacts) ? value.contacts : [];
      const metadata = value.metadata ?? {};
      const businessPhoneId: string | undefined = metadata.phone_number_id;
      const businessDigits = digitsOnly(metadata.display_phone_number);

      const incoming: any[] = Array.isArray(value.messages) ? value.messages : [];
      // Coexistence / SMB app echoes arrive in a separate array and are always business-sent.
      const echoes: any[] = Array.isArray(value.message_echoes) ? value.message_echoes : [];

      // Delivery/read receipts for messages we sent (broadcasts, replies). Forward-only.
      const statuses: any[] = Array.isArray(value.statuses) ? value.statuses : [];
      for (const status of statuses) {
        try {
          await applyWhatsAppStatus(status);
        } catch (err) {
          logger.error({ err, metaMessageId: status?.id }, "Failed to apply WhatsApp status");
        }
      }

      const items = [
        ...incoming.map((msg) => ({ msg, forcedEcho: false })),
        ...echoes.map((msg) => ({ msg, forcedEcho: true })),
      ];

      for (const { msg, forcedEcho } of items) {
        const metaMessageId: string | undefined = msg?.id;
        try {
          const from: string = typeof msg?.from === "string" ? msg.from : "";
          const text: string = msg?.text?.body || msg?.caption || msg?.image?.caption || "";

          const isEcho =
            forcedEcho ||
            (businessDigits !== "" && digitsOnly(from) === businessDigits) ||
            (from !== "" && (from === config.WHATSAPP_PHONE_NUMBER_ID || from === businessPhoneId));

          if (isEcho) {
            const recipient: string | undefined =
              msg?.to ?? msg?.recipient_id ?? (contacts.length === 1 ? contacts[0]?.wa_id : undefined);
            await handleEcho({ channelType: "whatsapp", recipientHandle: recipient, text, metaMessageId });
            continue;
          }

          if (!from) {
            logger.warn({ metaMessageId }, "WhatsApp message without sender ignored");
            continue;
          }

          const contact = contacts.find((c: any) => c?.wa_id === from);
          await handleCustomerMessage({
            channelType: "whatsapp",
            channelIdentifier: businessPhoneId || config.WHATSAPP_PHONE_NUMBER_ID || "whatsapp-main",
            handleOrPhone: from,
            customerName: contact?.profile?.name || from,
            text,
            metaMessageId,
          });
        } catch (err) {
          logger.error({ err, metaMessageId }, "Failed to process WhatsApp message");
        }
      }
    }
  }
}

async function processInstagram(body: any): Promise<void> {
  for (const entry of body.entry ?? []) {
    const accountId: string | undefined = config.INSTAGRAM_ACCOUNT_ID || entry?.id;
    for (const event of entry?.messaging ?? []) {
      const message = event?.message;
      if (!message) continue; // reads, deliveries, reactions etc.
      const metaMessageId: string | undefined = message.mid;
      try {
        const senderId: string | undefined = event?.sender?.id;
        const recipientId: string | undefined = event?.recipient?.id;
        const text: string = typeof message.text === "string" ? message.text : "";

        const isEcho = message.is_echo === true || (!!accountId && senderId === accountId);

        if (isEcho) {
          await handleEcho({ channelType: "instagram", recipientHandle: recipientId, text, metaMessageId });
          continue;
        }

        if (!senderId) {
          logger.warn({ metaMessageId }, "Instagram message without sender ignored");
          continue;
        }

        await handleCustomerMessage({
          channelType: "instagram",
          channelIdentifier: accountId || "instagram-main",
          handleOrPhone: senderId,
          customerName: senderId,
          text,
          metaMessageId,
        });
      } catch (err) {
        logger.error({ err, metaMessageId }, "Failed to process Instagram message");
      }
    }

    // Process comments from entry.changes where field === "comments"
    const commentChanges = (entry?.changes ?? []).filter(
      (change: any) => change?.field === "comments" && change?.value?.id,
    );
    const uniqueMediaIds: string[] = Array.from(
      new Set(
        commentChanges
          .map((change: any) => change?.value?.media?.id)
          .filter((id: any): id is string => typeof id === "string" && id.length > 0),
      ),
    );

    const mediaMap = new Map<string, IgMedia | null>();
    if (uniqueMediaIds.length > 0) {
      const mediaResults = await Promise.all(
        uniqueMediaIds.map(async (mediaId) => {
          try {
            const recent = await listRecentMedia(30, config.BUSINESS_ID);
            const found = recent.find((m) => m.id === mediaId) ?? null;
            return [mediaId, found] as const;
          } catch (mediaErr) {
            logger.warn({ mediaErr, mediaId }, "Could not fetch media details for comment (continuing)");
            return [mediaId, null] as const;
          }
        }),
      );
      for (const [mId, mData] of mediaResults) {
        mediaMap.set(mId, mData);
      }
    }

    for (const change of entry?.changes ?? []) {
      if (change?.field !== "comments") continue;
      const value = change?.value;
      if (!value) continue;
      const commentId: string | undefined = value?.id;
      if (!commentId) continue;

      try {
        const fromId = value?.from?.id;
        const fromUsername = value?.from?.username;
        const text = typeof value?.text === "string" ? value.text : "";
        const mediaId = value?.media?.id || "";
        const parentId = value?.parent_id || null;
        const rawTime = value?.timestamp;
        const timestamp = rawTime
          ? new Date(typeof rawTime === "number" ? rawTime * 1000 : rawTime)
          : new Date();

        // Ignore comments where from.id === INSTAGRAM_ACCOUNT_ID (our own replies)
        if (config.INSTAGRAM_ACCOUNT_ID && fromId === config.INSTAGRAM_ACCOUNT_ID) {
          logger.info({ commentId, fromId }, "Ignoring own Instagram comment");
          continue;
        }

        // Fill media details from prefetched media map when available (best effort, don't fail)
        let mediaType: "reel" | "post" | "carousel" | null = null;
        let mediaPermalink: string | null = null;
        let mediaThumbnailUrl: string | null = null;
        let mediaCaption: string | null = null;

        const prodType = value?.media?.media_product_type;
        if (prodType === "REELS") {
          mediaType = "reel";
        }

        const found = mediaId ? mediaMap.get(mediaId) : null;
        if (found) {
          mediaType = found.mediaType;
          mediaPermalink = found.permalink;
          mediaThumbnailUrl = found.thumbnailUrl;
          mediaCaption = found.caption;
        }

        const commenterIgId = fromId || "unknown";
        const commenterProfilePicUrl = await fetchCommenterProfilePic(commenterIgId, config.BUSINESS_ID).catch(() => null);

        const [inserted] = await db
          .insert(igComments)
          .values({
            businessId: config.BUSINESS_ID,
            metaCommentId: commentId,
            parentCommentId: parentId,
            mediaId,
            mediaType,
            mediaPermalink,
            mediaThumbnailUrl,
            mediaCaption,
            commenterIgId,
            commenterUsername: fromUsername || null,
            commenterProfilePicUrl,
            text,
            commentedAt: timestamp,
            action: "pending",
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          emitIgCommentNew(config.BUSINESS_ID, { commentId: inserted.id });
          await enqueueProcessIgComment({
            commentId: inserted.id,
            businessId: config.BUSINESS_ID,
          });
        }
      } catch (err) {
        logger.error({ err, commentId }, "Failed to process Instagram comment webhook");
      }
    }
  }
}

/**
 * Registered with app.register (no fastify-plugin), so the raw-body JSON parser
 * below is scoped to these routes only; other routes keep Fastify's default parser.
 */
export const webhookRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const raw = body as Buffer;
    request.rawBody = raw;
    try {
      done(null, JSON.parse(raw.toString("utf8")));
    } catch {
      done(new AppError(400, "Invalid JSON body", "INVALID_JSON"), undefined);
    }
  });

  // GET /webhook - Meta verification handshake
  app.get("/webhook", async (request, reply) => {
    const challenge = verifyHandshake(request.query as Record<string, unknown>, config.META_VERIFY_TOKEN);
    if (challenge === null) {
      throw new AppError(403, "Verification token mismatch", "FORBIDDEN");
    }
    logger.info("Meta webhook verification handshake succeeded");
    return reply.status(200).type("text/plain").send(challenge);
  });

  // POST /webhook - Meta event delivery
  app.post("/webhook", async (request, reply) => {
    const header = request.headers["x-hub-signature-256"];
    const signature = Array.isArray(header) ? header[0] : header;

    const authorized = isWebhookRequestAuthorized({
      rawBody: request.rawBody,
      signature,
      secrets: [config.META_APP_SECRET, config.INSTAGRAM_APP_SECRET],
      demoMode: config.DEMO_MODE,
    });
    if (!authorized) {
      logger.warn({ hasSignature: !!signature }, "Meta webhook signature verification failed");
      throw new AppError(403, "Invalid signature", "FORBIDDEN");
    }

    const body = request.body as any;
    try {
      if (body?.object === "whatsapp_business_account") {
        await processWhatsApp(body);
      } else if (body?.object === "instagram") {
        await processInstagram(body);
      }
    } catch (err) {
      logger.error({ err }, "Error processing Meta webhook event");
    }

    // Meta expects a 200 to avoid repeated retries.
    return reply.status(200).send({ status: "ok" });
  });
};
