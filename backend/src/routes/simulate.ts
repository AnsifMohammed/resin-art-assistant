import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { channels, conversations, customers, messages } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { emitMessageNew } from "../realtime/events.ts";
import { enqueueProcessMessage } from "../queue/enqueue.ts";

const simulateSchema = z.object({
  customerName: z.string().min(1),
  channel: z.enum(["whatsapp", "instagram"]).default("whatsapp"),
  text: z.string().min(1),
  imageUrl: z.string().url().optional(),
});

export const simulateRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post("/simulate/message", { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    if (!config.DEMO_MODE) {
      throw new AppError(403, "Simulation endpoint is only available in DEMO_MODE", "FORBIDDEN");
    }

    const parseResult = simulateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(400, "Invalid simulate payload", "VALIDATION_ERROR");
    }

    const { customerName, channel: channelType, text, imageUrl } = parseResult.data;
    const businessId = request.user.businessId;

    // 1. Find or create the demo channel row for this channel type.
    //    channels is unique on (businessId, type, identifier).
    const identifier = `demo-${channelType}-${businessId}`;
    const channelWhere = and(
      eq(channels.businessId, businessId),
      eq(channels.type, channelType),
      eq(channels.identifier, identifier),
    );
    let [channel] = await db.select().from(channels).where(channelWhere);

    if (!channel) {
      [channel] = await db
        .insert(channels)
        .values({ businessId, type: channelType, identifier, status: "active" })
        .onConflictDoNothing()
        .returning();
      // Lost a race with a concurrent request: read the row it created.
      if (!channel) [channel] = await db.select().from(channels).where(channelWhere);
    }

    if (!channel) {
      throw new AppError(500, "Could not create demo channel", "INTERNAL_ERROR");
    }
    const channelId = channel.id;

    // 2. Find or create the customer, scoped per channel: the same name on
    //    WhatsApp and Instagram is two customers (as with real Meta traffic).
    const handleOrPhone = `demo_${customerName.toLowerCase().replace(/\s+/g, "_")}`;
    let [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.channelId, channelId),
          eq(customers.handleOrPhone, handleOrPhone),
        ),
      );

    if (!customer) {
      [customer] = await db
        .insert(customers)
        .values({
          businessId,
          channelId,
          name: customerName,
          handleOrPhone,
        })
        .returning();
    }

    if (!customer) {
      throw new AppError(500, "Could not create demo customer", "INTERNAL_ERROR");
    }
    const customerId = customer.id;

    // 3. Find or create conversation
    let [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.businessId, businessId),
          eq(conversations.customerId, customerId),
          eq(conversations.channelId, channelId),
        ),
      );

    const now = new Date();
    const windowClosesAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (!conv) {
      const [newConv] = await db
        .insert(conversations)
        .values({
          businessId,
          customerId,
          channelId,
          state: "ai_active",
          lastCustomerMessageAt: now,
          windowClosesAt,
        })
        .returning();
      conv = newConv;
    } else {
      await db
        .update(conversations)
        .set({
          lastCustomerMessageAt: now,
          windowClosesAt,
        })
        .where(eq(conversations.id, conv.id));
    }

    if (!conv) {
      throw new AppError(500, "Could not create demo conversation", "INTERNAL_ERROR");
    }
    const conversationId = conv.id;

    // 4. Insert inbound message
    const [inbound] = await db
      .insert(messages)
      .values({
        conversationId,
        businessId,
        direction: "inbound",
        senderType: "customer",
        content: text,
        mediaUrls: imageUrl ? [imageUrl] : [],
        deliveryStatus: "delivered",
      })
      .returning();

    emitMessageNew(inbound);

    // 5. Queue AI processing. Messages are batched per conversation: the job
    //    runs after the batch window and handles every message received by then.
    const queued = await enqueueProcessMessage({ conversationId, businessId });

    return reply.status(202).send({
      ok: true,
      messageId: inbound?.id ?? null,
      conversationId,
      state: conv.state,
      queued: queued.mode,
      decision: null,
    });
  });
};
