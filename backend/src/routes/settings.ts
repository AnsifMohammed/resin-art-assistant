import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, businesses, channels } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { emitSettingsUpdated } from "../realtime/events.ts";

const pauseSchema = z.object({
  paused: z.boolean(),
});

export const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /settings - Admin only
  app.get(
    "/settings",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;

      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId));

      const bizChannels = await db
        .select({
          id: channels.id,
          type: channels.type,
          identifier: channels.identifier,
          status: channels.status,
          tokenExpiresAt: channels.tokenExpiresAt,
        })
        .from(channels)
        .where(eq(channels.businessId, businessId));

      const settings = (biz?.settings as Record<string, unknown>) || {};
      const paused = Boolean(settings.automation_paused);

      return {
        paused,
        channels: bizChannels,
      };
    },
  );

  // POST /settings/pause - Pause or resume automation globally
  app.post(
    "/settings/pause",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const parsed = pauseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid payload", "VALIDATION_ERROR");
      }

      const { paused } = parsed.data;

      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId));

      const currentSettings = (biz?.settings as Record<string, unknown>) || {};
      const updatedSettings = { ...currentSettings, automation_paused: paused };

      await db
        .update(businesses)
        .set({ settings: updatedSettings })
        .where(eq(businesses.id, businessId));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: paused ? "automation_paused" : "automation_resumed",
        details: { paused },
      });

      emitSettingsUpdated(businessId, { paused });

      return {
        ok: true,
        paused,
      };
    },
  );
};
