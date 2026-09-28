import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { auditLog, conversations, escalations } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitConversationAccessChanged, emitConversationUpdated } from "../realtime/events.ts";

export const resolveRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{ Params: { id: string } }>(
    "/conversations/:id/resolve",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      // 1. Fetch conversation
      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.businessId, businessId),
          ),
        );

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

      // 3. Mark conversation resolved -> returns it to AI active
      await db
        .update(conversations)
        .set({ state: "ai_active" })
        .where(eq(conversations.id, id));

      // 4. Mark escalation as resolved
      const [resolvedEsc] = await db
        .update(escalations)
        .set({
          resolvedAt: new Date(),
          resolvedByUserId: request.user.sub,
        })
        .where(
          and(
            eq(escalations.conversationId, id),
            isNull(escalations.resolvedAt),
          ),
        )
        .returning();

      // 5. Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "conversation_resolved",
        conversationId: id,
        details: {
          resolvedByRole: request.user.role,
        },
      });

      // 6. Real-time broadcast
      emitConversationUpdated(businessId, {
        conversationId: id,
        state: "ai_active",
        tag: conv.tag,
      });
      // Staff following this conversation lose access now that the escalation is closed.
      emitConversationAccessChanged(businessId, id);

      return {
        conversation: {
          id: conv.id,
          state: "ai_active",
        },
        escalation: resolvedEsc || null,
      };
    },
  );
};
