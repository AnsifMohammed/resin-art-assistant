import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { auditLog, conversations, customers, escalations, messages } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";
import { notifyEscalation } from "../../services/notify.ts";

export async function checkAndSendReminders(): Promise<number> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Find escalations that have been open for > 2h without a reminder
  const overdueEscalations = await db
    .select({
      escalation: escalations,
      customer: customers,
    })
    .from(escalations)
    .innerJoin(conversations, eq(escalations.conversationId, conversations.id))
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .where(
      and(
        isNull(escalations.resolvedAt),
        isNull(escalations.remindedAt),
        lt(escalations.alertedAt, twoHoursAgo),
      ),
    );

  let remindedCount = 0;

  for (const item of overdueEscalations) {
    const esc = item.escalation;
    const customerName = item.customer.name || item.customer.handleOrPhone || "Customer";

    const lastMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, esc.conversationId))
      .orderBy(messages.createdAt);

    const lastCustomerMsg = [...lastMsgs].reverse().find((m) => m.direction === "inbound")?.content || "";

    try {
      await notifyEscalation({
        businessId: esc.businessId,
        conversationId: esc.conversationId,
        reason: `REMINDER (Unresolved 2h): ${esc.reason}`,
        customerName,
        lastMessage: lastCustomerMsg,
        assignedToUserId: esc.assignedToUserId,
      });

      await db
        .update(escalations)
        .set({ remindedAt: new Date() })
        .where(eq(escalations.id, esc.id));

      await db.insert(auditLog).values({
        businessId: esc.businessId,
        actorType: "system",
        action: "escalation_reminded",
        escalationId: esc.id,
        conversationId: esc.conversationId,
        details: { reason: esc.reason },
      });

      remindedCount++;
    } catch (err) {
      logger.error({ err, escalationId: esc.id }, "Failed to send 2h escalation reminder");
    }
  }

  return remindedCount;
}
