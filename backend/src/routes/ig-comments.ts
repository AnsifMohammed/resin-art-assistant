import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { commentCategories, classifyComment, type IgCommentCategory } from "../ai/commentClassifier.ts";
import { ALWAYS_ESCALATE_PHRASES } from "../ai/rules.ts";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import {
  auditLog,
  businesses,
  channels,
  conversations,
  customers,
  igCommentActionEnum,
  igCommentRules,
  igComments,
  messages,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import {
  matchesKeyword,
  renderReplyText,
} from "../queue/jobs/processIgComment.ts";
import {
  emitConversationUpdated,
  emitIgCommentUpdated,
  emitMessageNew,
  emitSettingsUpdated,
} from "../realtime/events.ts";
import {
  listRecentMedia,
  replyToComment,
  sendPrivateReply,
} from "../services/meta/instagram.ts";

function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      400,
      message,
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

const listQuerySchema = z.object({
  action: z.string().optional(),
  category: z.string().optional(),
  mediaId: z.string().optional(),
  mediaType: z.enum(["post", "reel"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const manualReplySchema = z
  .object({
    mode: z.enum(["public", "dm", "both"]),
    publicText: z.string().trim().max(300).optional(),
    dmText: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.mode === "public" || data.mode === "both") {
        return Boolean(data.publicText && data.publicText.trim().length > 0);
      }
      return true;
    },
    { message: "publicText is required when mode is public or both", path: ["publicText"] },
  )
  .refine(
    (data) => {
      if (data.mode === "dm" || data.mode === "both") {
        return Boolean(data.dmText && data.dmText.trim().length > 0);
      }
      return true;
    },
    { message: "dmText is required when mode is dm or both", path: ["dmText"] },
  );

const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    keywords: z
      .array(z.string().trim().min(1).max(40).transform((s) => s.toLowerCase()))
      .max(30)
      .default([]),
    categories: z.array(z.enum(commentCategories)).default([]),
    mediaIds: z.array(z.string().trim().min(1)).max(50).default([]),
    replyMode: z.enum(["none", "public", "dm", "both"]).default("both"),
    publicReplyText: z.string().trim().max(300).nullable().optional(),
    dmText: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().default(true),
    priority: z.coerce.number().int().min(1).max(99999).default(100),
  })
  .refine(
    (data) => data.keywords.length > 0 || data.categories.length > 0,
    { message: "At least one keyword or category is required", path: ["keywords"] },
  )
  .refine(
    (data) => {
      if (data.replyMode === "public" || data.replyMode === "both") {
        return Boolean(data.publicReplyText && data.publicReplyText.trim().length > 0);
      }
      return true;
    },
    { message: "Public reply text is required for public or both reply mode", path: ["publicReplyText"] },
  )
  .refine(
    (data) => {
      if (data.replyMode === "dm" || data.replyMode === "both") {
        return Boolean(data.dmText && data.dmText.trim().length > 0);
      }
      return true;
    },
    { message: "DM text is required for DM or both reply mode", path: ["dmText"] },
  );

const patchRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    keywords: z
      .array(z.string().trim().min(1).max(40).transform((s) => s.toLowerCase()))
      .max(30)
      .optional(),
    categories: z.array(z.enum(commentCategories)).optional(),
    mediaIds: z.array(z.string().trim().min(1)).max(50).optional(),
    replyMode: z.enum(["none", "public", "dm", "both"]).optional(),
    publicReplyText: z.string().trim().max(300).nullable().optional(),
    dmText: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
    priority: z.coerce.number().int().min(1).max(99999).optional(),
  });

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)),
});

const testRuleSchema = z.object({
  text: z.string().min(1).max(1000),
  mediaId: z.string().optional(),
});

const settingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  aiClassification: z.boolean().optional(),
});

export const igCommentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /ig/comments - List comments with filters and counts
  app.get(
    "/ig/comments",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const q = parseOrThrow(listQuerySchema, request.query, "Invalid query parameters");
      const businessId = request.user.businessId;

      const conditions: any[] = [eq(igComments.businessId, businessId)];

      if (q.action && q.action !== "all") {
        if (q.action === "replied") {
          conditions.push(inArray(igComments.action, ["replied_public", "dm_sent", "replied_both"]));
        } else {
          conditions.push(eq(igComments.action, q.action as any));
        }
      }

      if (q.category) {
        conditions.push(eq(igComments.category, q.category as any));
      }

      if (q.mediaId) {
        conditions.push(eq(igComments.mediaId, q.mediaId));
      }

      if (q.mediaType) {
        conditions.push(eq(igComments.mediaType, q.mediaType));
      }

      if (q.search) {
        const pattern = `%${q.search.trim()}%`;
        conditions.push(
          or(
            sql`${igComments.text} ilike ${pattern}`,
            sql`${igComments.commenterUsername} ilike ${pattern}`,
          ),
        );
      }

      const whereClause = and(...conditions);
      const offset = (q.page - 1) * q.limit;

      // Needs attention sorts to top inside "all", then recent commentedAt
      const orderBy = [
        sql`CASE WHEN ${igComments.action} = 'needs_attention' THEN 0 ELSE 1 END`,
        desc(igComments.commentedAt),
        desc(igComments.createdAt),
      ];

      const [rows, totalResult, countRows] = await Promise.all([
        db
          .select()
          .from(igComments)
          .where(whereClause)
          .orderBy(...orderBy)
          .limit(q.limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(igComments)
          .where(whereClause),
        db
          .select({
            action: igComments.action,
            count: count(),
          })
          .from(igComments)
          .where(eq(igComments.businessId, businessId))
          .groupBy(igComments.action),
      ]);

      const counts = {
        all: 0,
        pending: 0,
        needs_attention: 0,
        replied: 0,
        skipped: 0,
        dismissed: 0,
        failed: 0,
      };

      for (const row of countRows) {
        const c = Number(row.count);
        counts.all += c;
        if (row.action === "pending") counts.pending += c;
        else if (row.action === "needs_attention") counts.needs_attention += c;
        else if (["replied_public", "dm_sent", "replied_both"].includes(row.action)) counts.replied += c;
        else if (row.action === "skipped") counts.skipped += c;
        else if (row.action === "dismissed") counts.dismissed += c;
        else if (row.action === "failed") counts.failed += c;
      }

      return {
        comments: rows,
        pagination: {
          page: q.page,
          limit: q.limit,
          total: Number(totalResult[0]?.count ?? 0),
        },
        counts,
      };
    },
  );

  // GET /ig/comments/stats - Comment stats today & last 7 days
  app.get(
    "/ig/comments/stats",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [todayRows, last7dRows] = await Promise.all([
        db
          .select({
            action: igComments.action,
            handledByUserId: igComments.handledByUserId,
            count: count(),
          })
          .from(igComments)
          .where(
            and(
              eq(igComments.businessId, businessId),
              sql`${igComments.commentedAt} >= ${startOfToday.toISOString()}`,
            ),
          )
          .groupBy(igComments.action, igComments.handledByUserId),
        db
          .select({
            action: igComments.action,
            handledByUserId: igComments.handledByUserId,
            count: count(),
          })
          .from(igComments)
          .where(
            and(
              eq(igComments.businessId, businessId),
              sql`${igComments.commentedAt} >= ${last7Days.toISOString()}`,
            ),
          )
          .groupBy(igComments.action, igComments.handledByUserId),
      ]);

      function calculateStats(rows: typeof todayRows) {
        let comments = 0;
        let autoReplied = 0;
        let needsAttention = 0;

        for (const r of rows) {
          const c = Number(r.count);
          comments += c;
          if (["replied_public", "dm_sent", "replied_both"].includes(r.action)) {
            // Auto-replied is when handledByUserId is null (replied by system)
            if (!r.handledByUserId) {
              autoReplied += c;
            }
          } else if (r.action === "needs_attention") {
            needsAttention += c;
          }
        }

        return { comments, autoReplied, needsAttention };
      }

      return {
        today: calculateStats(todayRows),
        last7d: calculateStats(last7dRows),
      };
    },
  );

  // GET /ig/comments/media-summary - Grouped comments per post & reel
  app.get(
    "/ig/comments/media-summary",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const rows = await db
        .select({
          mediaId: igComments.mediaId,
          mediaType: igComments.mediaType,
          mediaCaption: igComments.mediaCaption,
          mediaThumbnailUrl: igComments.mediaThumbnailUrl,
          mediaPermalink: igComments.mediaPermalink,
          total: count(),
          needsAttention: sql<number>`count(case when ${igComments.action} = 'needs_attention' then 1 end)`,
          replied: sql<number>`count(case when ${igComments.action} in ('replied_public', 'dm_sent', 'replied_both') then 1 end)`,
          skipped: sql<number>`count(case when ${igComments.action} = 'skipped' then 1 end)`,
          dismissed: sql<number>`count(case when ${igComments.action} = 'dismissed' then 1 end)`,
          failed: sql<number>`count(case when ${igComments.action} = 'failed' then 1 end)`,
        })
        .from(igComments)
        .where(eq(igComments.businessId, businessId))
        .groupBy(
          igComments.mediaId,
          igComments.mediaType,
          igComments.mediaCaption,
          igComments.mediaThumbnailUrl,
          igComments.mediaPermalink,
        )
        .orderBy(desc(sql`max(${igComments.commentedAt})`));

      const media = rows.map((r) => ({
        mediaId: r.mediaId,
        mediaType: (r.mediaType === "reel" ? "reel" : "post") as "post" | "reel",
        mediaCaption: r.mediaCaption,
        mediaThumbnailUrl: r.mediaThumbnailUrl,
        mediaPermalink: r.mediaPermalink,
        counts: {
          total: Number(r.total || 0),
          needs_attention: Number(r.needsAttention || 0),
          replied: Number(r.replied || 0),
          skipped: Number(r.skipped || 0),
          dismissed: Number(r.dismissed || 0),
          failed: Number(r.failed || 0),
        },
      }));

      return { media };
    },
  );

  // GET /ig/comments/:id - Get single comment detail
  app.get<{ Params: { id: string } }>(
    "/ig/comments/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const [comment] = await db
        .select()
        .from(igComments)
        .where(
          and(
            eq(igComments.id, request.params.id),
            eq(igComments.businessId, request.user.businessId),
          ),
        );

      if (!comment) {
        throw new AppError(404, "Instagram comment not found", "NOT_FOUND");
      }

      return { comment };
    },
  );

  // POST /ig/comments/:id/reply - Manual reply
  app.post<{ Params: { id: string } }>(
    "/ig/comments/:id/reply",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const body = parseOrThrow(manualReplySchema, request.body, "Invalid reply payload");
      const businessId = request.user.businessId;

      const [comment] = await db
        .select()
        .from(igComments)
        .where(and(eq(igComments.id, request.params.id), eq(igComments.businessId, businessId)));

      if (!comment) {
        throw new AppError(404, "Instagram comment not found", "NOT_FOUND");
      }

      let publicReplyId: string | null = null;
      let dmMessageId: string | null = null;

      let newAction: "replied_public" | "dm_sent" | "replied_both" = "replied_both";
      if (body.mode === "public") newAction = "replied_public";
      else if (body.mode === "dm") newAction = "dm_sent";

      try {
        if ((body.mode === "public" || body.mode === "both") && body.publicText) {
          const replyRes = await replyToComment(comment.metaCommentId, body.publicText, businessId);
          publicReplyId = replyRes.id;
        }

        if ((body.mode === "dm" || body.mode === "both") && body.dmText) {
          const dmRes = await sendPrivateReply(comment.metaCommentId, body.dmText, businessId);
          dmMessageId = dmRes.messageId;
        }

        let custId: string | null = comment.customerId;
        let convId: string | null = comment.conversationId;

        if (dmMessageId && body.dmText) {
          const [existingChan] = await db
            .select()
            .from(channels)
            .where(and(eq(channels.businessId, businessId), eq(channels.type, "instagram")));

          let chanId = existingChan?.id;
          if (!chanId) {
            const [newChan] = await db
              .insert(channels)
              .values({
                businessId,
                type: "instagram",
                identifier: config.INSTAGRAM_ACCOUNT_ID || "instagram-main",
                status: "active",
              })
              .onConflictDoNothing()
              .returning();
            chanId = newChan?.id;
            if (!chanId) {
              const [refetched] = await db
                .select()
                .from(channels)
                .where(and(eq(channels.businessId, businessId), eq(channels.type, "instagram")));
              chanId = refetched?.id;
            }
          }

          if (chanId) {
            const [existingCust] = await db
              .select()
              .from(customers)
              .where(
                and(
                  eq(customers.businessId, businessId),
                  eq(customers.channelId, chanId),
                  eq(customers.handleOrPhone, comment.commenterIgId),
                ),
              );

            let customer = existingCust;
            if (!customer) {
              const [createdCust] = await db
                .insert(customers)
                .values({
                  businessId,
                  channelId: chanId,
                  handleOrPhone: comment.commenterIgId,
                  name: comment.commenterUsername
                    ? `@${comment.commenterUsername.replace(/^@/, "")}`
                    : comment.commenterIgId,
                })
                .returning();
              customer = createdCust;
            }

            if (customer) {
              custId = customer.id;
              const [existingConv] = await db
                .select()
                .from(conversations)
                .where(
                  and(
                    eq(conversations.businessId, businessId),
                    eq(conversations.customerId, customer.id),
                  ),
                );

              let conv = existingConv;
              if (!conv) {
                const [createdConv] = await db
                  .insert(conversations)
                  .values({
                    businessId,
                    customerId: customer.id,
                    channelId: chanId,
                    state: "ai_active",
                    lastMessageAt: new Date(),
                  })
                  .returning();
                conv = createdConv;
              }

              if (conv) {
                convId = conv.id;
                const [insertedMsg] = await db
                  .insert(messages)
                  .values({
                    conversationId: conv.id,
                    businessId,
                    direction: "outbound",
                    senderType: "system",
                    content: body.dmText,
                    metaMessageId: dmMessageId,
                    deliveryStatus: "sent",
                    metadata: {
                      kind: "ig_comment_dm",
                      igCommentId: comment.id,
                      mediaId: comment.mediaId,
                    },
                  })
                  .returning();

                await db
                  .update(conversations)
                  .set({ lastMessageAt: new Date() })
                  .where(eq(conversations.id, conv.id));

                if (insertedMsg) emitMessageNew(insertedMsg);
                emitConversationUpdated(businessId, {
                  conversationId: conv.id,
                  state: conv.state,
                  tag: conv.tag,
                });
              }
            }
          }
        }

        const [updated] = await db
          .update(igComments)
          .set({
            action: newAction,
            publicReplyText: body.publicText ?? comment.publicReplyText,
            publicReplyId: publicReplyId ?? comment.publicReplyId,
            dmText: body.dmText ?? comment.dmText,
            dmMessageId: dmMessageId ?? comment.dmMessageId,
            handledByUserId: request.user.sub,
            customerId: custId,
            conversationId: convId,
            processedAt: new Date(),
          })
          .where(eq(igComments.id, comment.id))
          .returning();

        await db.insert(auditLog).values({
          businessId,
          actorId: request.user.sub,
          actorType: request.user.role,
          action: "ig_comment_manual_reply",
          conversationId: convId,
          details: {
            commentId: comment.id,
            mode: body.mode,
            publicText: body.publicText,
            dmText: body.dmText,
          },
        });

        emitIgCommentUpdated(businessId, { commentId: comment.id, action: newAction });

        return { comment: updated };
      } catch (err: any) {
        if (publicReplyId) {
          // Public reply succeeded, but DM or subsequent operations threw
          await db
            .update(igComments)
            .set({
              action: "replied_public",
              publicReplyText: body.publicText ?? comment.publicReplyText,
              publicReplyId,
              error: err?.message || String(err),
              handledByUserId: request.user.sub,
              processedAt: new Date(),
            })
            .where(eq(igComments.id, comment.id));

          await db.insert(auditLog).values({
            businessId,
            actorId: request.user.sub,
            actorType: request.user.role,
            action: "ig_comment_manual_reply_partial_failure",
            conversationId: comment.conversationId,
            details: {
              commentId: comment.id,
              mode: body.mode,
              publicReplyId,
              publicText: body.publicText,
              error: err?.message || String(err),
            },
          });

          emitIgCommentUpdated(businessId, { commentId: comment.id, action: "replied_public" });
        } else {
          await db
            .update(igComments)
            .set({
              action: "failed",
              error: err?.message || String(err),
              handledByUserId: request.user.sub,
              processedAt: new Date(),
            })
            .where(eq(igComments.id, comment.id));

          await db.insert(auditLog).values({
            businessId,
            actorId: request.user.sub,
            actorType: request.user.role,
            action: "ig_comment_manual_reply_failed",
            conversationId: comment.conversationId,
            details: {
              commentId: comment.id,
              mode: body.mode,
              error: err?.message || String(err),
            },
          });

          emitIgCommentUpdated(businessId, { commentId: comment.id, action: "failed" });
        }

        const statusCode = err instanceof AppError ? err.statusCode : 502;
        const errorCode = err instanceof AppError ? err.code : "REPLY_FAILED";
        throw new AppError(
          statusCode,
          publicReplyId
            ? `Public comment was posted, but private DM failed: ${err?.message || "Unknown error"}`
            : `Failed to send reply: ${err?.message || "Unknown error"}`,
          errorCode,
          {
            publicReplyId,
            error: err?.message || String(err),
          },
        );
      }
    },
  );

  // POST /ig/comments/:id/dismiss - Dismiss comment
  app.post<{ Params: { id: string } }>(
    "/ig/comments/:id/dismiss",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const [comment] = await db
        .select()
        .from(igComments)
        .where(and(eq(igComments.id, request.params.id), eq(igComments.businessId, businessId)));

      if (!comment) {
        throw new AppError(404, "Instagram comment not found", "NOT_FOUND");
      }

      const [updated] = await db
        .update(igComments)
        .set({
          action: "dismissed",
          skipReason: "dismissed",
          handledByUserId: request.user.sub,
          processedAt: new Date(),
        })
        .where(eq(igComments.id, comment.id))
        .returning();

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "ig_comment_dismissed",
        conversationId: comment.conversationId,
        details: { commentId: comment.id },
      });

      emitIgCommentUpdated(businessId, { commentId: comment.id, action: "dismissed" });

      return { comment: updated };
    },
  );

  // GET /ig/rules - List rules sorted by priority
  app.get(
    "/ig/rules",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const rules = await db
        .select()
        .from(igCommentRules)
        .where(eq(igCommentRules.businessId, request.user.businessId))
        .orderBy(asc(igCommentRules.priority));

      return { rules };
    },
  );

  // POST /ig/rules - Create a rule
  app.post(
    "/ig/rules",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const body = parseOrThrow(ruleInputSchema, request.body, "Invalid rule payload");
      const businessId = request.user.businessId;

      const [rule] = await db
        .insert(igCommentRules)
        .values({
          businessId,
          name: body.name,
          keywords: body.keywords,
          categories: body.categories,
          mediaIds: body.mediaIds,
          replyMode: body.replyMode,
          publicReplyText: body.publicReplyText,
          dmText: body.dmText,
          isActive: body.isActive,
          priority: body.priority,
          createdByUserId: request.user.sub,
          updatedByUserId: request.user.sub,
        })
        .returning();

      if (!rule) {
        throw new AppError(500, "Failed to create rule", "INTERNAL_ERROR");
      }

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "ig_rule_created",
        details: { ruleId: rule.id, name: rule.name },
      });

      return reply.status(201).send({ rule });
    },
  );

  // PATCH /ig/rules/:id - Update a rule
  app.patch<{ Params: { id: string } }>(
    "/ig/rules/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const body = parseOrThrow(patchRuleSchema, request.body, "Invalid rule update payload");
      const businessId = request.user.businessId;

      const [existing] = await db
        .select()
        .from(igCommentRules)
        .where(and(eq(igCommentRules.id, request.params.id), eq(igCommentRules.businessId, businessId)));

      if (!existing) {
        throw new AppError(404, "Rule not found", "NOT_FOUND");
      }

      // Check full merged rule validity
      const merged = {
        name: body.name ?? existing.name,
        keywords: body.keywords ?? (existing.keywords as string[]),
        categories: body.categories ?? (existing.categories as any[]),
        mediaIds: body.mediaIds ?? (existing.mediaIds as string[]),
        replyMode: body.replyMode ?? existing.replyMode,
        publicReplyText: body.publicReplyText !== undefined ? body.publicReplyText : existing.publicReplyText,
        dmText: body.dmText !== undefined ? body.dmText : existing.dmText,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        priority: body.priority !== undefined ? body.priority : existing.priority,
      };

      parseOrThrow(ruleInputSchema, merged, "Invalid rule properties");

      const [updated] = await db
        .update(igCommentRules)
        .set({
          ...merged,
          updatedByUserId: request.user.sub,
          updatedAt: new Date(),
        })
        .where(eq(igCommentRules.id, existing.id))
        .returning();

      if (!updated) {
        throw new AppError(500, "Failed to update rule", "INTERNAL_ERROR");
      }

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "ig_rule_updated",
        details: { ruleId: updated.id, name: updated.name },
      });

      return { rule: updated };
    },
  );

  // DELETE /ig/rules/:id - Delete rule
  app.delete<{ Params: { id: string } }>(
    "/ig/rules/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const [existing] = await db
        .select()
        .from(igCommentRules)
        .where(and(eq(igCommentRules.id, request.params.id), eq(igCommentRules.businessId, businessId)));

      if (!existing) {
        throw new AppError(404, "Rule not found", "NOT_FOUND");
      }

      await db.delete(igCommentRules).where(eq(igCommentRules.id, existing.id));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "ig_rule_deleted",
        details: { ruleId: existing.id, name: existing.name },
      });

      return { ok: true };
    },
  );

  // POST /ig/rules/reorder - Rewrites priorities to 10, 20, 30...
  app.post(
    "/ig/rules/reorder",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const body = parseOrThrow(reorderSchema, request.body, "Invalid reorder payload");
      const businessId = request.user.businessId;

      await db.transaction(async (tx) => {
        let priority = 10;
        for (const id of body.ids) {
          await tx
            .update(igCommentRules)
            .set({ priority, updatedAt: new Date() })
            .where(and(eq(igCommentRules.id, id), eq(igCommentRules.businessId, businessId)));
          priority += 10;
        }
      });

      const rules = await db
        .select()
        .from(igCommentRules)
        .where(eq(igCommentRules.businessId, businessId))
        .orderBy(asc(igCommentRules.priority));

      return { ok: true, rules };
    },
  );

  // POST /ig/rules/test - Test rule matching on sample text & post
  app.post(
    "/ig/rules/test",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const body = parseOrThrow(testRuleSchema, request.body, "Invalid test payload");
      const businessId = request.user.businessId;

      // 4. Complaint first: check ALWAYS_ESCALATE_PHRASES or AI classification
      const lowerText = body.text.toLowerCase();
      const phraseMatch = ALWAYS_ESCALATE_PHRASES.some((phrase) => lowerText.includes(phrase.toLowerCase()));

      let isComplaint = phraseMatch;
      let detectedCategory: IgCommentCategory | null = phraseMatch ? "complaint" : null;

      if (!isComplaint) {
        const classification = await classifyComment(body.text);
        if (classification.category === "complaint") {
          isComplaint = true;
          detectedCategory = "complaint";
        } else {
          detectedCategory = classification.category;
        }
      }

      if (isComplaint) {
        return {
          category: "complaint",
          matchedRule: null,
          matchedBy: null,
          wouldDo: "needs_attention",
          publicPreview: null,
          dmPreview: null,
        };
      }

      // 5. Find a rule
      const activeRules = await db
        .select()
        .from(igCommentRules)
        .where(and(eq(igCommentRules.businessId, businessId), eq(igCommentRules.isActive, true)))
        .orderBy(asc(igCommentRules.priority));

      const applicableRules = activeRules.filter((r) => {
        const mediaIds = (r.mediaIds as string[]) || [];
        return mediaIds.length === 0 || (body.mediaId ? mediaIds.includes(body.mediaId) : true);
      });

      let matchedRule: (typeof igCommentRules.$inferSelect) | null = null;
      let matchedBy: "keyword" | "ai" | null = null;

      for (const rule of applicableRules) {
        const keywords = (rule.keywords as string[]) || [];
        if (keywords.some((kw) => matchesKeyword(body.text, kw))) {
          matchedRule = rule;
          matchedBy = "keyword";
          break;
        }
      }

      if (!matchedRule) {
        for (const rule of applicableRules) {
          const categories = (rule.categories as string[]) || [];
          if (detectedCategory && categories.includes(detectedCategory)) {
            matchedRule = rule;
            matchedBy = "ai";
            break;
          }
        }
      }

      const finalCategory: IgCommentCategory =
        detectedCategory ??
        ((matchedRule?.categories as string[])?.[0] as IgCommentCategory) ??
        "other";

      if (!matchedRule) {
        return {
          category: finalCategory,
          matchedRule: null,
          matchedBy: null,
          wouldDo: "skip",
          publicPreview: null,
          dmPreview: null,
        };
      }

      const sampleHandle = "sample_user";
      const sampleCaption = "Handmade Resin Art Coasters & Clock Saba Art";

      const publicPreview = matchedRule.publicReplyText
        ? renderReplyText(matchedRule.publicReplyText, sampleHandle, sampleCaption)
        : null;

      const dmPreview = matchedRule.dmText
        ? renderReplyText(matchedRule.dmText, sampleHandle, sampleCaption)
        : null;

      const wouldDo = matchedRule.replyMode === "none" ? "skip" : matchedRule.replyMode;

      return {
        category: finalCategory,
        matchedRule: { id: matchedRule.id, name: matchedRule.name },
        matchedBy,
        wouldDo,
        publicPreview,
        dmPreview,
      };
    },
  );

  // GET /ig/media - Recent posts/reels for post picker
  app.get(
    "/ig/media",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const media = await listRecentMedia(30, request.user.businessId);
      return { media };
    },
  );

  // GET /ig/settings - Get settings
  app.get(
    "/ig/settings",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const [biz] = await db
        .select({ settings: businesses.settings })
        .from(businesses)
        .where(eq(businesses.id, request.user.businessId));

      const settings = (biz?.settings as Record<string, any>) || {};
      const ig = settings.igComments ?? {};

      return {
        enabled: ig.enabled !== false,
        aiClassification: ig.aiClassification !== false,
      };
    },
  );

  // PATCH /ig/settings - Update settings
  app.patch(
    "/ig/settings",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const body = parseOrThrow(settingsPatchSchema, request.body, "Invalid settings payload");
      const businessId = request.user.businessId;

      const [biz] = await db
        .select({ settings: businesses.settings })
        .from(businesses)
        .where(eq(businesses.id, businessId));

      const currentSettings = (biz?.settings as Record<string, any>) || {};
      const currentIg = currentSettings.igComments ?? {};

      const updatedIg = {
        enabled: body.enabled !== undefined ? body.enabled : (currentIg.enabled !== false),
        aiClassification: body.aiClassification !== undefined ? body.aiClassification : (currentIg.aiClassification !== false),
      };

      const updatedSettings = {
        ...currentSettings,
        igComments: updatedIg,
      };

      await db
        .update(businesses)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(eq(businesses.id, businessId));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: request.user.role,
        action: "settings_updated",
        details: { igComments: updatedIg },
      });

      emitSettingsUpdated(businessId, { paused: !updatedIg.enabled });

      return updatedIg;
    },
  );
};
