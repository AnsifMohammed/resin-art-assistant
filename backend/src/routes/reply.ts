import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, channels, conversations, customers, escalations, messages } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitConversationUpdated, emitMessageNew } from "../realtime/events.ts";
import { sendMessage } from "../services/send.ts";

const replySchema = z.object({
  text: z.string().min(1).max(4096),
});

export const replyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/reply",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      const parsed = replySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid reply payload", "VALIDATION_ERROR");
      }

      const { text } = parsed.data;

      // 1. Fetch conversation with its customer and channel
      const [row] = await db
        .select({
          conversation: conversations,
          customer: customers,
          channel: channels,
        })
        .from(conversations)
        .leftJoin(customers, eq(conversations.customerId, customers.id))
        .leftJoin(channels, eq(conversations.channelId, channels.id))
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.businessId, businessId),
          ),
        );

      const conv = row?.conversation;
      if (!conv) {
        throw new AppError(404, "Conversation not found", "NOT_FOUND");
      }

      // 2. Staff authorization check (before revealing anything else about the conversation)
      if (request.user.role === "staff") {
        const [openEscalation] = await db
          .select()
          .from(escalations)
          .where(
            and(
              eq(escalations.conversationId, id),
              eq(escalations.businessId, businessId),
              isNull(escalations.resolvedAt),
              or(
                eq(escalations.assignedToUserId, request.user.sub),
                isNull(escalations.assignedToUserId),
              ),
            ),
          );

        if (!openEscalation) {
          throw new AppError(403, "Not assigned to you", "FORBIDDEN");
        }
      }

      // 3. Check 24-hour messaging window
      if (conv.windowClosesAt && new Date(conv.windowClosesAt) < new Date()) {
        throw new AppError(409, "Customer 24h messaging window is closed", "WINDOW_CLOSED");
      }

      const channel = row.channel;
      const customer = row.customer;
      if (!channel || !customer?.handleOrPhone) {
        throw new AppError(409, "Conversation channel or customer not found", "CHANNEL_NOT_FOUND");
      }

      // 4. Update conversation state to owner_handling (pauses AI for human handling)
      await db
        .update(conversations)
        .set({ state: "owner_handling" })
        .where(eq(conversations.id, id));

      // 5. Insert message as queued; delivery status is updated after sending
      const [queuedMsg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          businessId,
          direction: "outbound",
          senderType: request.user.role === "admin" ? "owner" : "staff",
          senderId: request.user.sub,
          content: text,
          deliveryStatus: "queued",
        })
        .returning();

      // 6. Send outbound reply on the conversation's own channel
      try {
        await sendMessage({
          channelType: channel.type,
          recipient: customer.handleOrPhone,
          text,
          businessId,
          conversationId: id,
        });
      } catch (err) {
        if (queuedMsg) {
          await db.update(messages).set({ deliveryStatus: "failed" }).where(eq(messages.id, queuedMsg.id));
        }

        await db.insert(auditLog).values({
          businessId,
          actorId: request.user.sub,
          actorType: request.user.role,
          action: "reply_failed",
          conversationId: id,
          details: {
            messageId: queuedMsg?.id,
            error: err instanceof Error ? err.message : String(err),
          },
        });

        if (queuedMsg) emitMessageNew({ ...queuedMsg, deliveryStatus: "failed" });
        emitConversationUpdated(businessId, {
          conversationId: id,
          state: "owner_handling",
          tag: conv.tag,
        });

        if (err instanceof AppError) throw err;
        request.log.error({ err, conversationId: id }, "Failed to deliver reply");
        throw new AppError(502, "Failed to deliver reply", "SEND_FAILED");
      }

      if (queuedMsg) {
        await db.update(messages).set({ deliveryStatus: "sent" }).where(eq(messages.id, queuedMsg.id));
      }
      const newMsg = queuedMsg ? { ...queuedMsg, deliveryStatus: "sent" as const } : queuedMsg;

      // 7. Record in audit trail
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "reply_sent",
        conversationId: id,
        details: {
          messageId: newMsg?.id,
          preview: text.slice(0, 100),
        },
      });

      // 8. Emit real-time WebSocket events
      emitMessageNew(newMsg);
      emitConversationUpdated(businessId, {
        conversationId: id,
        state: "owner_handling",
        tag: conv.tag,
      });

      return reply.status(201).send({
        message: newMsg,
        conversation: {
          id: conv.id,
          state: "owner_handling",
        },
      });
    },
  );
};
