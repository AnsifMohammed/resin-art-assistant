import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { channels, conversations, escalations, messages } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";

const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    "/analytics",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const parsed = analyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "Invalid date format for query parameters", "VALIDATION_ERROR");
      }

      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const from = parsed.data.from || defaultFrom;
      const to = parsed.data.to || now.toISOString();

      const fromDate = new Date(from);
      const toDate = new Date(to);
      const businessId = request.user.businessId;

      const messageConditions = [
        eq(messages.businessId, businessId),
        gte(messages.createdAt, fromDate),
        lte(messages.createdAt, toDate),
      ];

      const escalationConditions = [
        eq(escalations.businessId, businessId),
        gte(escalations.createdAt, fromDate),
        lte(escalations.createdAt, toDate),
      ];

      // Total and direction breakdown
      const [msgStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
          outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
          autoReplies: sql<number>`count(*) filter (where ${messages.senderType} = 'ai')::int`,
        })
        .from(messages)
        .where(and(...messageConditions));

      // Escalation stats
      const [escStats] = await db
        .select({
          totalEscalations: sql<number>`count(*)::int`,
          avgResolutionSeconds: sql<number>`avg(extract(epoch from (${escalations.resolvedAt} - ${escalations.createdAt}))) filter (where ${escalations.resolvedAt} is not null)::int`,
        })
        .from(escalations)
        .where(and(...escalationConditions));

      // By channel breakdown
      const channelRows = await db
        .select({
          type: channels.type,
          inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
          outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .innerJoin(channels, eq(conversations.channelId, channels.id))
        .where(and(...messageConditions))
        .groupBy(channels.type);

      const byChannel = {
        whatsapp: { inbound: 0, outbound: 0 },
        instagram: { inbound: 0, outbound: 0 },
      };

      for (const row of channelRows) {
        if (row.type === "whatsapp") {
          byChannel.whatsapp = { inbound: row.inbound ?? 0, outbound: row.outbound ?? 0 };
        } else if (row.type === "instagram") {
          byChannel.instagram = { inbound: row.inbound ?? 0, outbound: row.outbound ?? 0 };
        }
      }

      // By reason breakdown
      const reasonRows = await db
        .select({
          reason: escalations.reason,
          count: sql<number>`count(*)::int`,
        })
        .from(escalations)
        .where(and(...escalationConditions))
        .groupBy(escalations.reason);

      const byReason: Record<string, number> = {};
      for (const row of reasonRows) {
        if (row.reason) {
          byReason[row.reason] = row.count ?? 0;
        }
      }

      const total = msgStats?.total ?? 0;
      const inbound = msgStats?.inbound ?? 0;
      const outbound = msgStats?.outbound ?? 0;
      const autoReplies = msgStats?.autoReplies ?? 0;
      const escalationCount = escStats?.totalEscalations ?? 0;

      const autoReplyRate = inbound > 0 ? Number((autoReplies / inbound).toFixed(4)) : 0;
      const escalationRate = inbound > 0 ? Number((escalationCount / inbound).toFixed(4)) : 0;
      const avgResponseTimeSeconds = escStats?.avgResolutionSeconds ?? null;

      return {
        from,
        to,
        messages: {
          total,
          inbound,
          outbound,
        },
        autoReplies,
        escalations: escalationCount,
        autoReplyRate,
        escalationRate,
        avgResponseTimeSeconds,
        byChannel,
        byReason,
      };
    },
  );
};
