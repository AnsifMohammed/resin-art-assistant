import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  aiDecisions,
  auditLog,
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
import { emitConversationUpdated } from "../realtime/events.ts";

const conversationsQuerySchema = z.object({
  state: z.enum(convStateEnum.enumValues).optional(),
  tag: z.enum(convTagEnum.enumValues).optional(),
  channel: z.enum(["instagram", "whatsapp"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Empty search is ignored rather than rejected.
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  unread: z.enum(["true", "false"]).optional(),
});

/** Escape LIKE wildcards so user input matches literally. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, "\\$&");

/** A customer message arrived after the admin last opened the conversation. */
const unreadCondition = () =>
  and(
    isNotNull(conversations.lastCustomerMessageAt),
    or(
      isNull(conversations.adminLastReadAt),
      sql`${conversations.lastCustomerMessageAt} > ${conversations.adminLastReadAt}`,
    ),
  );

const isUnread = (c: { lastCustomerMessageAt: Date | null; adminLastReadAt: Date | null }) =>
  c.lastCustomerMessageAt !== null &&
  (!c.adminLastReadAt || c.lastCustomerMessageAt > c.adminLastReadAt);

type ConversationRow = typeof conversations.$inferSelect;
type AiDecisionRow = typeof aiDecisions.$inferSelect;

/** AI decision summary shown to admins next to the customer message it answered. */
const toAiDecisionSummary = (d: AiDecisionRow) => ({
  intent: d.intent,
  escalate: d.escalate,
  escalateReason: d.escalateReason,
  factsUsed: d.factsUsed,
  missingFacts: d.missingFacts,
  languageDetected: d.languageDetected,
  suggestedTag: d.suggestedTag,
  sent: d.sent,
  createdAt: d.createdAt,
});

type ThreadMessage = typeof messages.$inferSelect & {
  aiDecision?: ReturnType<typeof toAiDecisionSummary>;
};

async function findConversation(id: string, businessId: string): Promise<ConversationRow> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.businessId, businessId)));
  if (!conv) {
    throw new AppError(404, "Conversation not found", "NOT_FOUND");
  }
  return conv;
}

type ConvState = ConversationRow["state"];

/**
 * Admin state change (pause/resume). The update is guarded on the expected
 * states so a concurrent change (e.g. an escalation) is not overwritten.
 */
async function changeState(actorId: string, conv: ConversationRow, from: ConvState[], to: ConvState) {
  const [updated] = await db
    .update(conversations)
    .set({ state: to })
    .where(
      and(
        eq(conversations.id, conv.id),
        eq(conversations.businessId, conv.businessId),
        inArray(conversations.state, from),
      ),
    )
    .returning({ id: conversations.id });

  if (!updated) {
    throw new AppError(409, "Conversation state changed, please retry", "STATE_CONFLICT");
  }

  await db.insert(auditLog).values({
    businessId: conv.businessId,
    actorId,
    actorType: "admin",
    action: to === "paused" ? "conversation_paused" : "conversation_resumed",
    conversationId: conv.id,
    details: { from: conv.state, to },
  });

  emitConversationUpdated(conv.businessId, { conversationId: conv.id, state: to, tag: conv.tag });

  return { conversation: { id: conv.id, state: to, tag: conv.tag } };
}

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

      const { state, tag, channel, page, limit, search, unread } = parsed.data;
      const businessId = request.user.businessId;
      const offset = (page - 1) * limit;

      const conditions = [eq(conversations.businessId, businessId)];
      if (state) conditions.push(eq(conversations.state, state));
      if (tag) conditions.push(eq(conversations.tag, tag));
      if (channel) conditions.push(eq(channels.type, channel));
      if (unread === "true") conditions.push(unreadCondition()!);
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        // The latest message is a correlated subquery so the count query can share the filter.
        conditions.push(
          or(
            sql`${customers.name} ilike ${pattern}`,
            sql`${customers.handleOrPhone} ilike ${pattern}`,
            sql`(select ${messages.content} from ${messages}
                 where ${messages.conversationId} = ${conversations.id}
                 order by ${messages.createdAt} desc limit 1) ilike ${pattern}`,
          )!,
        );
      }

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
            sql`${conversations.lastMessageAt} desc nulls last`,
            desc(conversations.createdAt),
          )
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .innerJoin(customers, eq(conversations.customerId, customers.id))
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
        unread: isUnread(item.conversation),
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

      // Admins see the AI decision behind each customer message. Staff never do.
      let threadMessages: ThreadMessage[] = convMessages;
      if (request.user.role === "admin") {
        const decisions = await db
          .select()
          .from(aiDecisions)
          .where(and(eq(aiDecisions.conversationId, id), eq(aiDecisions.businessId, businessId)))
          .orderBy(asc(aiDecisions.createdAt));

        // Oldest first, so the latest decision per message wins.
        const byMessage = new Map(decisions.map((d) => [d.messageId, d]));
        threadMessages = convMessages.map((m) => {
          const decision = m.direction === "inbound" && m.senderType === "customer" ? byMessage.get(m.id) : undefined;
          return decision ? { ...m, aiDecision: toAiDecisionSummary(decision) } : m;
        });
      }

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
          messages: threadMessages,
          openEscalation,
        },
      };
    },
  );

  // POST /conversations/:id/read - Admin marks the conversation as read
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/read",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const [updated] = await db
        .update(conversations)
        .set({ adminLastReadAt: new Date() })
        .where(
          and(
            eq(conversations.id, request.params.id),
            eq(conversations.businessId, request.user.businessId),
          ),
        )
        .returning({ id: conversations.id });

      if (!updated) {
        throw new AppError(404, "Conversation not found", "NOT_FOUND");
      }
      return reply.status(204).send();
    },
  );

  // POST /conversations/:id/pause - Admin stops the AI for one conversation
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/pause",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const conv = await findConversation(request.params.id, businessId);

      if (conv.state === "paused") {
        return { conversation: { id: conv.id, state: conv.state, tag: conv.tag } };
      }
      if (conv.state === "escalated") {
        throw new AppError(409, "Resolve the escalation before pausing", "ESCALATION_OPEN");
      }

      return changeState(request.user.sub, conv, ["ai_active", "owner_handling"], "paused");
    },
  );

  // POST /conversations/:id/resume - Admin hands a paused conversation back to the AI
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/resume",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const conv = await findConversation(request.params.id, request.user.businessId);

      if (conv.state !== "paused") {
        throw new AppError(409, "Conversation is not paused", "NOT_PAUSED");
      }

      return changeState(request.user.sub, conv, ["paused"], "ai_active");
    },
  );
};
