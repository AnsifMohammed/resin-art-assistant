import type { FastifyInstance } from "fastify";
import { analyticsRoutes } from "./analytics.ts";
import { auditLogRoutes } from "./audit-log.ts";
import { authRoutes } from "./auth.ts";
import { conversationRoutes } from "./conversations.ts";
import { escalationRoutes } from "./escalations.ts";
import { healthRoutes } from "./health.ts";
import { knowledgeBaseRoutes } from "./knowledge-base.ts";
import { pushRoutes } from "./push.ts";
import { replyRoutes } from "./reply.ts";
import { resolveRoutes } from "./resolve.ts";
import { settingsRoutes } from "./settings.ts";
import { simulateRoutes } from "./simulate.ts";
import { userRoutes } from "./users.ts";
import { webhookRoutes } from "./webhooks.ts";
import { websocketRoutes } from "../realtime/websocket.ts";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(pushRoutes);
  await app.register(simulateRoutes);
  await app.register(conversationRoutes);
  await app.register(replyRoutes);
  await app.register(resolveRoutes);
  await app.register(escalationRoutes);
  await app.register(userRoutes);
  await app.register(settingsRoutes);
  await app.register(knowledgeBaseRoutes);
  await app.register(analyticsRoutes);
  await app.register(auditLogRoutes);
  await app.register(webhookRoutes);
  await app.register(websocketRoutes);
}
