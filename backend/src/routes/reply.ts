import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  auditLog,
  channels,
  conversations,
  customers,
  escalations,
  messages,
  messageTemplates,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { renderTemplate, TEMPLATE_MAX_LENGTH } from "../lib/templates.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitConversationUpdated, emitMessageNew } from "../realtime/events.ts";
import { sendMessage } from "../services/send.ts";

// Either free text or a template (+ variable values). Strict objects so a body
// with both (or neither) matches no branch.
const replySchema = z.union([
  z.strictObject({
    text: z.string().min(1).max(4096),
  }),
  z.strictObject({
    templateId: z.string().min(1),
    variables: z.record(z.string(), z.string().max(1000)).optional(),
  }),
]);

/**
 * Render a template for a conversation. customerName is pre-filled by the
 * caller; explicit values from the request win. Throws 400 when a variable has
 * no value or the result is too long for the channel.
 */
function renderTemplateReply(
  template: typeof messageTemplates.$inferSelect,
  channelType: "whatsapp" | "instagram",
  vars: Record<string, string>,
): string {
  const { text, missing } = renderTemplate(template.body, vars);
  if (missing.length > 0) {
    throw new AppError(
      400,
      `Missing template variables: ${missing.join(", ")}`,
      "TEMPLATE_VARIABLES_MISSING",
      missing.map((m) => ({ path: m, message: "required" })),
    );
  }
  const maxLength = TEMPLATE_MAX_LENGTH[channelType];
  if (text.length > maxLength) {
    throw new AppError(
      400,
      `Message is too long for ${channelType} (${text.length}/${maxLength} characters)`,
      "TEMPLATE_TOO_LONG",
    );
  }
  return text;
}

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

      const body = parsed.data;

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

      const channel = row.channel;
      const customer = row.customer;

      // 2a. Template replies: load the (active) template and check it fits this channel
      let template: typeof messageTemplates.$inferSelect | undefined;
      if ("templateId" in body) {
        [template] = await db
          .select()
          .from(messageTemplates)
          .where(
            and(
              eq(messageTemplates.id, body.templateId),
              eq(messageTemplates.businessId, businessId),
              eq(messageTemplates.isActive, true),
            ),
          );

        if (!template) {
          throw new AppError(404, "Template not found", "TEMPLATE_NOT_FOUND");
        }
        if (channel && template.channel !== "both" && template.channel !== channel.type) {
          throw new AppError(
            400,
            `This template is for ${template.channel} only`,
            "TEMPLATE_CHANNEL_MISMATCH",
          );
        }
      }

      // 3. Check 24-hour messaging window. After it closes only an approved
      //    WhatsApp (Meta) template may be sent.
      if (conv.windowClosesAt && new Date(conv.windowClosesAt) < new Date()) {
        if (!template) {
          throw new AppError(409, "Customer 24h messaging window is closed", "WINDOW_CLOSED");
        }
        if (!template.metaTemplateName || template.metaStatus !== "approved") {
          throw new AppError(
            409,
            "Only approved WhatsApp templates can be sent after 24 hours",
            "WINDOW_CLOSED",
          );
        }
      }

      if (!channel || !customer?.handleOrPhone) {
        throw new AppError(409, "Conversation channel or customer not found", "CHANNEL_NOT_FOUND");
      }

      // 3a. Resolve the text to send (template is always loaded on the template branch).
      const text =
        "text" in body
          ? body.text
          : renderTemplateReply(template!, channel.type, {
              customerName: customer.name ?? customer.handleOrPhone,
              ...body.variables,
            });

      // 4. Update conversation state to owner_handling (pauses AI for human handling)
      await db
        .update(conversations)
        .set({ state: "owner_handling", lastMessageAt: new Date() })
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
          ...(template ? { metadata: { templateId: template.id, templateName: template.name } } : {}),
        })
        .returning();

      // 6. Send outbound reply on the conversation's own channel.
      //    Templates go out as their rendered text for now; live mode will send
      //    the approved Meta template by metaTemplateName instead.
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
        action: template ? "template_reply_sent" : "reply_sent",
        conversationId: id,
        details: {
          messageId: newMsg?.id,
          ...(template ? { templateId: template.id } : {}),
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
