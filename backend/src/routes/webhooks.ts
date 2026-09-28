import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { auditLog, channels, conversations, customers, messages } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { enqueueProcessMessage } from "../queue/enqueue.ts";
import { emitConversationUpdated, emitMessageNew } from "../realtime/events.ts";
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
      .set({ lastCustomerMessageAt: now, windowClosesAt })
      .where(eq(conversations.id, conv.id));
  }

  logger.info(
    { metaMessageId: m.metaMessageId, messageId: inserted.id, conversationId: conv.id, ...textForLog(m.text) },
    "Stored inbound customer message",
  );
  emitMessageNew(inserted);

  // The job re-checks state and the pause switch before doing anything.
  if (conv.state === "ai_active") {
    await enqueueProcessMessage({ conversationId: conv.id, businessId: config.BUSINESS_ID });
  }
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

  if (conv.state !== "owner_handling") {
    await db
      .update(conversations)
      .set({ state: "owner_handling" })
      .where(eq(conversations.id, conv.id));

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
      secret: config.META_APP_SECRET,
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
