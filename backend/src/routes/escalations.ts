import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  auditLog,
  channels,
  conversations,
  customers,
  escalations,
  messages,
  users,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitEscalationAssigned } from "../realtime/events.ts";

const escalationsQuerySchema = z.object({
  resolved: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const assignSchema = z.object({
  userId: z.string().min(1).nullable(),
});

export const escalationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /escalations - Admin sees all; staff sees only open assigned to them + unassigned
  app.get(
    "/escalations",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const parsed = escalationsQuerySchema.safeParse(request.query);
      const isResolved = parsed.success && parsed.data.resolved ? true : false;
      const businessId = request.user.businessId;

      let whereClause;

      if (request.user.role === "admin") {
        whereClause = and(
          eq(escalations.businessId, businessId),
          isResolved ? isNotNull(escalations.resolvedAt) : isNull(escalations.resolvedAt),
        );
      } else {
        // Staff can only see unresolved escalations (assigned to them or unassigned)
        whereClause = and(
          eq(escalations.businessId, businessId),
          isNull(escalations.resolvedAt),
          or(
            eq(escalations.assignedToUserId, request.user.sub),
            isNull(escalations.assignedToUserId),
          ),
        );
      }

      // Sort: oldest open first (most urgent)
      const rows = await db
        .select({
          escalation: escalations,
          conversation: conversations,
          customer: customers,
          channel: channels,
          assignedTo: {
            id: users.id,
            name: users.name,
          },
        })
        .from(escalations)
        .innerJoin(conversations, eq(escalations.conversationId, conversations.id))
        .innerJoin(customers, eq(conversations.customerId, customers.id))
        .leftJoin(channels, eq(conversations.channelId, channels.id))
        .leftJoin(users, eq(escalations.assignedToUserId, users.id))
        .where(whereClause)
        .orderBy(asc(escalations.createdAt));

      const enriched = await Promise.all(
        rows.map(async (row) => {
          const [lastMsg] = await db
            .select({
              content: messages.content,
              senderType: messages.senderType,
              createdAt: messages.createdAt,
            })
            .from(messages)
            .where(eq(messages.conversationId, row.conversation.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          return {
            ...row.escalation,
            assignedTo: row.assignedTo?.id ? row.assignedTo : null,
            conversation: {
              id: row.conversation.id,
              state: row.conversation.state,
              tag: row.conversation.tag,
              windowClosesAt: row.conversation.windowClosesAt,
              lastCustomerMessageAt: row.conversation.lastCustomerMessageAt,
              channelType: (row.channel?.type || "whatsapp") as "instagram" | "whatsapp",
              customer: {
                id: row.customer.id,
                name: row.customer.name,
                handleOrPhone: row.customer.handleOrPhone,
              },
              lastMessage: lastMsg || null,
            },
          };
        }),
      );

      return { escalations: enriched };
    },
  );

  // POST /escalations/:id/assign - Admin only
  app.post<{ Params: { id: string } }>(
    "/escalations/:id/assign",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      const parsed = assignSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid assign payload", "VALIDATION_ERROR");
      }

      const { userId } = parsed.data;

      // 1. Verify escalation exists in this business
      const [existing] = await db
        .select()
        .from(escalations)
        .where(
          and(
            eq(escalations.id, id),
            eq(escalations.businessId, businessId),
          ),
        );

      if (!existing) {
        throw new AppError(404, "Escalation not found", "NOT_FOUND");
      }

      if (existing.resolvedAt) {
        throw new AppError(409, "Escalation is already resolved", "ESCALATION_RESOLVED");
      }

      let assignedUserRef: { id: string; name: string } | null = null;

      // 2. If assigning, the target must be an active staff member of this business.
      //    userId null unassigns (any staff can pick it up).
      if (userId !== null) {
        const [targetUser] = await db
          .select({
            id: users.id,
            name: users.name,
            role: users.role,
            active: users.active,
            businessId: users.businessId,
          })
          .from(users)
          .where(
            and(
              eq(users.id, userId),
              eq(users.businessId, businessId),
              eq(users.role, "staff"),
              eq(users.active, true),
            ),
          );

        // Re-check in code as well as in SQL (defence in depth).
        if (
          !targetUser ||
          targetUser.id !== userId ||
          targetUser.businessId !== businessId ||
          targetUser.role !== "staff" ||
          !targetUser.active
        ) {
          throw new AppError(400, "Assignee must be an active staff member of this business", "INVALID_ASSIGNEE");
        }
        assignedUserRef = { id: targetUser.id, name: targetUser.name };
      }

      // 3. Update escalation (only while still open)
      const [updated] = await db
        .update(escalations)
        .set({
          assignedToUserId: userId,
          assignedByUserId: userId === null ? null : request.user.sub,
          assignedAt: userId === null ? null : new Date(),
        })
        .where(
          and(
            eq(escalations.id, id),
            eq(escalations.businessId, businessId),
            isNull(escalations.resolvedAt),
          ),
        )
        .returning();

      if (!updated) {
        throw new AppError(409, "Escalation is already resolved", "ESCALATION_RESOLVED");
      }

      // 4. Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: userId === null ? "escalation_unassigned" : "escalation_assigned",
        conversationId: existing.conversationId,
        escalationId: id,
        targetUserId: userId ?? undefined,
        details: {
          assignedToUserId: userId,
        },
      });

      // 5. Emit real-time event
      emitEscalationAssigned(businessId, {
        escalationId: id,
        conversationId: existing.conversationId,
        assignedToUserId: userId,
      }, existing.assignedToUserId);

      return {
        escalation: {
          ...updated,
          assignedTo: assignedUserRef,
        },
      };
    },
  );
};
