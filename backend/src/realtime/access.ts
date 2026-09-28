import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { escalations } from "../db/schema.ts";

/**
 * Staff may follow a conversation only while it has an open escalation that is
 * assigned to them or unassigned (same rule as GET /conversations/:id).
 */
export async function staffCanAccessConversation(
  businessId: string,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const [open] = await db
    .select({ id: escalations.id })
    .from(escalations)
    .where(
      and(
        eq(escalations.conversationId, conversationId),
        eq(escalations.businessId, businessId),
        isNull(escalations.resolvedAt),
        or(eq(escalations.assignedToUserId, userId), isNull(escalations.assignedToUserId)),
      ),
    );
  return Boolean(open);
}

/**
 * Who among the staff may currently follow a conversation:
 * - null: nobody (no open escalation)
 * - { anyStaff: true }: unassigned open escalation
 * - { userId }: open escalation assigned to that staff member
 */
export async function conversationStaffAccess(
  businessId: string,
  conversationId: string,
): Promise<{ anyStaff: true } | { userId: string } | null> {
  const [open] = await db
    .select({ assignedToUserId: escalations.assignedToUserId })
    .from(escalations)
    .where(
      and(
        eq(escalations.conversationId, conversationId),
        eq(escalations.businessId, businessId),
        isNull(escalations.resolvedAt),
      ),
    );
  if (!open) return null;
  return open.assignedToUserId ? { userId: open.assignedToUserId } : { anyStaff: true };
}
