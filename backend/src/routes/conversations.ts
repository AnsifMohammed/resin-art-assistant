import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  channels,
  conversations,
  convStateEnum,
  convTagEnum,
  customers,
  escalations,
  messages,
  users,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";

const conversationsQuerySchema = z.object({
  state: z.enum(convStateEnum.enumValues).optional(),
  tag: z.enum(convTagEnum.enumValues).optional(),
  channel: z.enum(["instagram", "whatsapp"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const conversationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /conversations - Admin only
  app.get(
    "/conversations",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const parsed = conversationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "Invalid query parameters", "VALIDATION_ERROR");
      }

      const { state, tag, channel, page, limit } = parsed.data;
      const businessId = request.user.businessId;
      const offset = (page - 1) * limit;

      const conditions = [eq(conversations.businessId, businessId)];
      if (state) conditions.push(eq(conversations.state, state));
      if (tag) conditions.push(eq(conversations.tag, tag));
      if (channel) conditions.push(eq(channels.type, channel));

      const whereClause = and(...conditions);

      // Latest message and open escalation per row via LATERAL joins: one round trip for the page
      // (plus the count, in parallel) instead of two extra queries per conversation.
      const lastMessage = db
        .select({
          content: messages.content,
          senderType: messages.senderType,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversations.id))
        .orderBy(desc(messages.createdAt))
        .limit(1)
        .as("last_message");

      const openEscalation = db
        .select({
          id: escalations.id,
          reason: escalations.reason,
          assignedToUserId: escalations.assignedToUserId,
          createdAt: escalations.createdAt,
        })
        .from(escalations)
        .where(and(eq(escalations.conversationId, conversations.id), isNull(escalations.resolvedAt)))
        .limit(1)
        .as("open_escalation");

      const [items, countResult] = await Promise.all([
        db
          .select({
            conversation: conversations,
            customer: customers,
            channel: channels,
            lastMessage: {
              content: lastMessage.content,
              senderType: lastMessage.senderType,
              createdAt: lastMessage.createdAt,
            },
            openEscalation: {
              id: openEscalation.id,
              reason: openEscalation.reason,
              assignedToUserId: openEscalation.assignedToUserId,
              createdAt: openEscalation.createdAt,
            },
          })
          .from(conversations)
          .innerJoin(customers, eq(conversations.customerId, customers.id))
          .leftJoin(channels, eq(conversations.channelId, channels.id))
          .leftJoinLateral(lastMessage, sql`true`)
          .leftJoinLateral(openEscalation, sql`true`)
          .where(whereClause)
          .orderBy(
            sql`${conversations.lastCustomerMessageAt} desc nulls last`,
            desc(conversations.createdAt),
          )
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .leftJoin(channels, eq(conversations.channelId, channels.id))
          .where(whereClause),
      ]);

      const total = countResult[0]?.count ?? 0;

      const enrichedConversations = items.map((item) => ({
        ...item.conversation,
        customer: {
          id: item.customer.id,
          name: item.customer.name,
          handleOrPhone: item.customer.handleOrPhone,
        },
        channelType: (item.channel?.type || "whatsapp") as "instagram" | "whatsapp",
        lastMessage: item.lastMessage ?? null,
        openEscalation: item.openEscalation ?? null,
      }));

      return {
        conversations: enrichedConversations,
        pagination: {
          page,
          limit,
          total,
        },
      };
    },
  );

  // GET /conversations/:id - Admin or assigned staff
  app.get<{ Params: { id: string } }>(
    "/conversations/:id",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      const [conv] = await db
        .select({
          conversation: conversations,
          customer: customers,
          channel: channels,
        })
        .from(conversations)
        .innerJoin(customers, eq(conversations.customerId, customers.id))
        .leftJoin(channels, eq(conversations.channelId, channels.id))
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.businessId, businessId),
          ),
        );

      if (!conv) {
        throw new AppError(404, "Conversation not found", "NOT_FOUND");
      }

      // Open escalation check (and staff authorization check)
      const openEscalations = await db
        .select({
          escalation: escalations,
          assignedTo: {
            id: users.id,
            name: users.name,
          },
        })
        .from(escalations)
        .leftJoin(users, eq(escalations.assignedToUserId, users.id))
        .where(
          and(
            eq(escalations.conversationId, id),
            eq(escalations.businessId, businessId),
            isNull(escalations.resolvedAt),
          ),
        );

      const openEscalationRow = openEscalations[0];

      if (request.user.role === "staff") {
        const canAccess =
          openEscalationRow &&
          (openEscalationRow.escalation.assignedToUserId === request.user.sub ||
            openEscalationRow.escalation.assignedToUserId === null);

        if (!canAccess) {
          throw new AppError(403, "Not assigned to you", "FORBIDDEN");
        }
      }

      const convMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, id))
        .orderBy(messages.createdAt);

      const openEscalation = openEscalationRow
        ? {
            ...openEscalationRow.escalation,
            assignedTo: openEscalationRow.assignedTo?.id ? openEscalationRow.assignedTo : null,
          }
        : null;

      return {
        conversation: {
          ...conv.conversation,
          customer: conv.customer,
          channelType: (conv.channel?.type || "whatsapp") as "instagram" | "whatsapp",
          messages: convMessages,
          openEscalation,
        },
      };
    },
  );
};
