import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { invalidateKBCache } from "../ai/prompt.ts";
import { db } from "../db/index.ts";
import { auditLog, knowledgeBase } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";

/**
 * Minimal structural validation for the KB. Permissive: unknown keys are kept
 * (loose objects) so the admin can add new sections without a code change.
 */
export const knowledgeBaseSchema = z.looseObject({
  business_name: z.string().trim().min(1),
  products: z.array(
    z.looseObject({
      id: z.string().min(1),
      name: z.string().min(1),
      price: z.number().positive(),
    }),
  ),
  policies: z.looseObject({}),
});

export const knowledgeBaseRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /knowledge-base - Admin only
  app.get(
    "/knowledge-base",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const [row] = await db
        .select()
        .from(knowledgeBase)
        .where(eq(knowledgeBase.businessId, businessId));

      if (!row) {
        throw new AppError(404, "Knowledge base not found", "NOT_FOUND");
      }

      return {
        data: row.data,
        updatedAt: row.updatedAt,
        updatedByUserId: row.updatedByUserId,
      };
    },
  );

  // PUT /knowledge-base - Replace full KB and invalidate Redis cache
  app.put(
    "/knowledge-base",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
        throw new AppError(400, "Knowledge base payload must be a JSON object", "VALIDATION_ERROR");
      }

      // Accept either { data: <kb> } (dashboard) or the KB object itself.
      const body = request.body as Record<string, unknown>;
      const candidate =
        body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body;

      const parsed = knowledgeBaseSchema.safeParse(candidate);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const where = first?.path.length ? `${first.path.join(".")}: ` : "";
        throw new AppError(400, `Invalid knowledge base: ${where}${first?.message ?? "invalid"}`, "VALIDATION_ERROR");
      }
      const newData = parsed.data;

      const [updatedRow] = await db
        .insert(knowledgeBase)
        .values({
          businessId,
          data: newData,
          updatedByUserId: request.user.sub,
        })
        .onConflictDoUpdate({
          target: [knowledgeBase.businessId],
          set: {
            data: newData,
            updatedByUserId: request.user.sub,
          },
        })
        .returning();

      // Invalidate Redis cache so subsequent AI calls read fresh data immediately
      await invalidateKBCache(businessId);

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "knowledge_base_updated",
        details: {
          updatedKeys: Object.keys(newData),
        },
      });

      return {
        data: updatedRow?.data ?? newData,
        updatedAt: updatedRow?.updatedAt ?? new Date(),
        updatedByUserId: request.user.sub,
      };
    },
  );
};
