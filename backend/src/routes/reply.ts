import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
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
  products,
} from "../db/schema.ts";
import { markMessageSent } from "../lib/conversation.ts";
import { AppError } from "../lib/errors.ts";
import { renderTemplate, TEMPLATE_MAX_LENGTH } from "../lib/templates.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitConversationUpdated, emitMessageNew } from "../realtime/events.ts";
import { sendMessage } from "../services/send.ts";

// Either free text (with optional media attachments) or a template (+ variable values).
const replySchema = z.union([
  z
    .strictObject({
      text: z.string().max(4096).optional(),
      mediaUrls: z.array(z.string().url()).max(10).optional(),
    })
    .refine(
      (data) =>
        (data.text && data.text.trim().length > 0) ||
        (Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0),
      {
        message: "Either text or at least one media URL is required",
      },
    ),
  z.strictObject({
    templateId: z.string().min(1),
    variables: z.record(z.string(), z.string().max(1000)).optional(),
  }),
]);

const catalogueSchema = z.strictObject({
  productIds: z
    .array(z.string().min(1))
    .min(1, "Select at least 1 product")
    .max(10, "Maximum 10 products can be shared at once"),
  customNote: z.string().max(1000).optional(),
});

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
        "templateId" in body
          ? renderTemplateReply(template!, channel.type, {
              customerName: customer.name ?? customer.handleOrPhone,
              ...body.variables,
            })
          : (body.text?.trim() || null);

      const mediaUrls = "mediaUrls" in body && Array.isArray(body.mediaUrls) ? body.mediaUrls : [];

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
          mediaUrls,
          deliveryStatus: "queued",
          ...(template ? { metadata: { templateId: template.id, templateName: template.name } } : {}),
        })
        .returning();

      // 6. Send outbound reply on the conversation's own channel.
      //    Templates go out as their rendered text for now; live mode will send
      //    the approved Meta template by metaTemplateName instead.
      let metaMessageId: string | null = null;
      try {
        const result = await sendMessage({
          channelType: channel.type,
          recipient: customer.handleOrPhone,
          text: text ?? undefined,
          mediaUrls,
          businessId,
          conversationId: id,
        });
        metaMessageId = result?.metaMessageId ?? null;
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
        await markMessageSent(db, queuedMsg.id, metaMessageId);
      }
      const newMsg = queuedMsg
        ? { ...queuedMsg, deliveryStatus: "sent" as const, ...(metaMessageId ? { metaMessageId } : {}) }
        : queuedMsg;

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
          preview: (text ?? "").slice(0, 100),
          mediaCount: mediaUrls.length,
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

  // POST /conversations/:id/catalogue - share interactive product catalogue
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/catalogue",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      const parsed = catalogueSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid catalogue payload", "VALIDATION_ERROR");
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

      // 2. Staff authorization check
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

      if (!channel || !customer?.handleOrPhone) {
        throw new AppError(409, "Conversation channel or customer not found", "CHANNEL_NOT_FOUND");
      }

      // 3. Check 24-hour messaging window
      if (conv.windowClosesAt && new Date(conv.windowClosesAt) < new Date()) {
        throw new AppError(409, "Customer 24h messaging window is closed", "WINDOW_CLOSED");
      }

      // 4. Fetch selected active products
      const selectedProducts = await db
        .select()
        .from(products)
        .where(
          and(
            inArray(products.id, body.productIds),
            eq(products.businessId, businessId),
            eq(products.isActive, true),
          ),
        );

      if (selectedProducts.length === 0) {
        throw new AppError(404, "None of the selected products were found or active", "PRODUCTS_NOT_FOUND");
      }

      // Preserve selection order
      const orderedProducts = body.productIds
        .map((pid) => selectedProducts.find((p) => p.id === pid))
        .filter((p): p is typeof selectedProducts[number] => Boolean(p));

      // Build interactive product items
      const interactiveProducts = orderedProducts.map((p) => {
        const sizes = Array.isArray(p.sizes) ? p.sizes : [];
        const prices = sizes
          .map((s: any) => (typeof s?.price === "number" ? s.price : null))
          .filter((price): price is number => price !== null);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const priceStr =
          prices.length === 0
            ? "Price on request"
            : prices.length > 1 && minPrice !== maxPrice
              ? `₹${minPrice.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")}`
              : `₹${minPrice.toLocaleString("en-IN")}`;

        const images = Array.isArray(p.images) ? p.images : [];
        const validImages = images.filter((img): img is string => typeof img === "string" && img.trim().length > 0);
        const firstImg = typeof validImages[0] === "string" ? validImages[0] : undefined;

        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          price: priceStr,
          imageUrl: firstImg,
          images: validImages,
          leadTime: p.leadTimeDays,
          description: p.description ?? undefined,
          customizable: p.customizable,
          customOptions: p.customOptions ?? [],
        };
      });

      // Format caption text
      const notePrefix = body.customNote?.trim() ? `${body.customNote.trim()}\n\n` : "";
      let text = "";
      if (orderedProducts.length === 1) {
        const p = interactiveProducts[0]!;
        text = `${notePrefix}✨ *${p.name}*\n💰 Price: ${p.price}\n⏱️ Lead time: ~${p.leadTime} days${p.description ? `\n\n${p.description}` : ""}`.trim();
      } else {
        const lines = interactiveProducts
          .map((p, idx) => `${idx + 1}. *${p.name}* (${p.price})`)
          .join("\n");
        text = `${notePrefix}✨ *Our Handcrafted Resin Collection*\n\n${lines}`.trim();
      }

      // 5. Update conversation state to owner_handling
      await db
        .update(conversations)
        .set({ state: "owner_handling", lastMessageAt: new Date() })
        .where(eq(conversations.id, id));

      // 6. Insert message as queued (mediaUrls is empty because product images are within metadata.products)
      const [queuedMsg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          businessId,
          direction: "outbound",
          senderType: request.user.role === "admin" ? "owner" : "staff",
          senderId: request.user.sub,
          content: text,
          mediaUrls: [],
          deliveryStatus: "queued",
          metadata: {
            kind: "catalogue_share",
            productIds: body.productIds,
            products: interactiveProducts,
            ...(body.customNote ? { customNote: body.customNote } : {}),
          },
        })
        .returning();

      // 7. Dispatch via sendMessage (interactive message carries its own product images)
      let metaMessageId: string | null = null;
      try {
        const result = await sendMessage({
          channelType: channel.type,
          recipient: customer.handleOrPhone,
          text,
          mediaUrls: undefined,
          interactive: {
            type: orderedProducts.length === 1 ? "catalogue_card" : "catalogue_list",
            products: interactiveProducts,
          },
          businessId,
          conversationId: id,
        });
        metaMessageId = result?.metaMessageId ?? null;
      } catch (err) {
        if (queuedMsg) {
          await db.update(messages).set({ deliveryStatus: "failed" }).where(eq(messages.id, queuedMsg.id));
        }

        await db.insert(auditLog).values({
          businessId,
          actorId: request.user.sub,
          actorType: request.user.role,
          action: "catalogue_share_failed",
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
        request.log.error({ err, conversationId: id }, "Failed to deliver catalogue");
        throw new AppError(502, "Failed to deliver catalogue", "SEND_FAILED");
      }

      if (queuedMsg) {
        await markMessageSent(db, queuedMsg.id, metaMessageId);
      }
      const newMsg = queuedMsg
        ? { ...queuedMsg, deliveryStatus: "sent" as const, ...(metaMessageId ? { metaMessageId } : {}) }
        : queuedMsg;

      // 8. Record in audit trail
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "catalogue_shared",
        conversationId: id,
        details: {
          messageId: newMsg?.id,
          productCount: orderedProducts.length,
          productIds: body.productIds,
        },
      });

      // 9. Real-time emit
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
