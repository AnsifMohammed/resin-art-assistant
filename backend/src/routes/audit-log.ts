import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, users } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  actorId: z.string().optional(),
  action: z.string().optional(),
});

export const auditLogRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    "/audit-log",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const parsed = auditLogQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "Invalid query parameters", "VALIDATION_ERROR");
      }

      const { page, limit, actorId, action } = parsed.data;
      const businessId = request.user.businessId;
      const offset = (page - 1) * limit;

      const conditions = [eq(auditLog.businessId, businessId)];
      if (actorId) conditions.push(eq(auditLog.actorId, actorId));
      if (action) conditions.push(eq(auditLog.action, action));

      const whereClause = and(...conditions);

      const items = await db
        .select({
          id: auditLog.id,
          actorId: auditLog.actorId,
          actorType: auditLog.actorType,
          actorName: users.name,
          action: auditLog.action,
          conversationId: auditLog.conversationId,
          escalationId: auditLog.escalationId,
          targetUserId: auditLog.targetUserId,
          details: auditLog.details,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.actorId, users.id))
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(whereClause);
      const total = countResult[0]?.count ?? 0;

      return {
        entries: items,
        pagination: {
          page,
          limit,
          total,
        },
      };
    },
  );
};
