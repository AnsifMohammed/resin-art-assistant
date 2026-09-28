import webpush from "web-push";
import { eq } from "drizzle-orm";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { pushSubscriptions } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";

if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_EMAIL) {
  webpush.setVapidDetails(
    `mailto:${config.VAPID_EMAIL}`,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  try {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  } catch (err) {
    logger.error({ err, endpoint }, "Failed to delete push subscription from database");
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
}

export async function sendPushNotification(
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  payload: PushNotificationPayload,
): Promise<void> {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
    if (config.NODE_ENV === "development") {
      logger.info({ payload }, "Push notification logged (VAPID keys unset)");
    } else {
      logger.info(
        { url: payload.url, titleLength: payload.title.length, bodyLength: payload.body.length },
        "Push notification logged (VAPID keys unset)",
      );
    }
    return;
  }

  try {
    await webpush.sendNotification(
      subscription as unknown as webpush.PushSubscription,
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      await deletePushSubscription(subscription.endpoint);
    } else {
      logger.error({ err, endpoint: subscription.endpoint }, "Failed to deliver push notification");
    }
  }
}
