import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { pushSubscriptions } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const pushRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /push/subscribe
  app.post("/push/subscribe", { preHandler: [authenticate] }, async (request) => {
    const parseResult = subscribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(400, "Invalid push subscription payload", "VALIDATION_ERROR");
    }

    const { endpoint, keys } = parseResult.data;

    await db
      .insert(pushSubscriptions)
      .values({
        userId: request.user.sub,
        businessId: request.user.businessId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      });

    return { ok: true };
  });

  // DELETE /push/subscribe - Unsubscribe on logout
  app.delete("/push/subscribe", { preHandler: [authenticate] }, async (request) => {
    const parseResult = unsubscribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError(400, "Invalid unsubscribe payload", "VALIDATION_ERROR");
    }

    const { endpoint } = parseResult.data;

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, request.user.sub),
        ),
      );

    return { ok: true };
  });
};
