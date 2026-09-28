import { eq } from "drizzle-orm";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { pushSubscriptions, users } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";
import { sendEscalationAlert } from "./email.ts";
import { sendPushNotification } from "./push.ts";

export interface NotifyEscalationParams {
  businessId: string;
  conversationId: string;
  reason: string;
  customerName: string;
  lastMessage: string;
  assignedToUserId?: string | null;
}

export async function notifyEscalation(params: NotifyEscalationParams): Promise<void> {
  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.businessId, params.businessId));

  const admins = allUsers.filter((u) => u.role === "admin" && u.active);
  const primaryAdmin = admins[0];

  // 1. Email notification: send to primary admin (and assigned staff if assigned)
  if (primaryAdmin) {
    await sendEscalationAlert({
      to: primaryAdmin.email,
      staffName: primaryAdmin.name,
      reason: params.reason,
      conversationId: params.conversationId,
      customerName: params.customerName,
      lastMessage: params.lastMessage.slice(0, 200),
      dashboardUrl: config.DASHBOARD_URL,
    });
  }

  if (params.assignedToUserId) {
    const assignedStaff = allUsers.find(
      (u) => u.id === params.assignedToUserId && u.active,
    );
    if (assignedStaff && assignedStaff.email !== primaryAdmin?.email) {
      await sendEscalationAlert({
        to: assignedStaff.email,
        staffName: assignedStaff.name,
        reason: params.reason,
        conversationId: params.conversationId,
        customerName: params.customerName,
        lastMessage: params.lastMessage.slice(0, 200),
        dashboardUrl: config.DASHBOARD_URL,
      });
    }
  }

  // 2. Web push notifications: filter by role and assignment
  const subs = await db
    .select({
      subscription: pushSubscriptions,
      userRole: users.role,
      userId: users.id,
      userActive: users.active,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(pushSubscriptions.userId, users.id))
    .where(eq(pushSubscriptions.businessId, params.businessId));

  const eligibleSubs = subs.filter((s) => {
    if (!s.userActive) return false;
    // Admins always receive escalation notifications
    if (s.userRole === "admin") return true;
    // If assigned to a specific staff member, ONLY that staff member receives it
    if (params.assignedToUserId) {
      return s.userId === params.assignedToUserId;
    }
    // If unassigned, all staff receive the alert to pick it up
    return true;
  });

  for (const item of eligibleSubs) {
    const sub = item.subscription;
    try {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        {
          title: `⚠️ New Escalation: ${params.customerName}`,
          body: params.lastMessage.slice(0, 100),
          url: `${config.DASHBOARD_URL}/escalations`,
        },
      );
    } catch (err) {
      logger.error({ err, endpoint: sub.endpoint }, "Failed sending filtered push notification");
    }
  }
}
