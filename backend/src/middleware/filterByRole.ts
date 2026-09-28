import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { JwtPayload } from "./authenticate.ts";
import { escalations } from "../db/schema.ts";

/**
 * Filter for GET /escalations based on user role:
 * - Admin: sees all escalations for their business
 * - Staff: sees only open escalations assigned to them or unassigned
 */
export function getStaffEscalationFilter(user: JwtPayload): SQL {
  if (user.role === "admin") {
    return eq(escalations.businessId, user.businessId);
  }

  return and(
    eq(escalations.businessId, user.businessId),
    isNull(escalations.resolvedAt),
    or(
      eq(escalations.assignedToUserId, user.sub),
      isNull(escalations.assignedToUserId)
    )
  )!;
}
