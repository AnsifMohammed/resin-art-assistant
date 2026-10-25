import { and, eq, lt } from "drizzle-orm";
import { config, isInstagramLive } from "../../config.ts";
import { db } from "../../db/index.ts";
import { auditLog, channels } from "../../db/schema.ts";
import { decrypt, encrypt } from "../../lib/crypto.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { refreshInstagramToken } from "../../services/meta/instagram.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Long-lived Instagram tokens last 60 days and can be refreshed once they are
 * at least 24h old. Refresh when fewer than this many days remain (or when the
 * expiry is unknown, e.g. a token seeded from INSTAGRAM_ACCESS_TOKEN), which
 * leaves a month of daily retries if Meta is failing.
 */
export const REFRESH_WHEN_EXPIRING_WITHIN_DAYS = 30;

type ChannelRow = typeof channels.$inferSelect;

/** Make sure the configured business has its Instagram channel row (identifier = INSTAGRAM_ACCOUNT_ID). */
async function ensureDefaultInstagramChannel(): Promise<void> {
  if (!config.INSTAGRAM_ACCOUNT_ID) return;
  const existing = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.businessId, config.BUSINESS_ID), eq(channels.type, "instagram")));
  if (existing.length > 0) return;
  await db
    .insert(channels)
    .values({
      businessId: config.BUSINESS_ID,
      type: "instagram",
      identifier: config.INSTAGRAM_ACCOUNT_ID,
      status: "active",
    })
    .onConflictDoNothing();
}

/** The token to refresh: the stored (encrypted) one, else INSTAGRAM_ACCESS_TOKEN for the configured business. */
function currentToken(channel: ChannelRow): { token: string; seededFromEnv: boolean } | null {
  if (channel.encryptedToken) {
    try {
      return { token: decrypt(channel.encryptedToken), seededFromEnv: false };
    } catch {
      logger.error({ channelId: channel.id }, "Could not decrypt stored Instagram token");
    }
  }
  if (channel.businessId === config.BUSINESS_ID && config.INSTAGRAM_ACCESS_TOKEN) {
    return { token: config.INSTAGRAM_ACCESS_TOKEN, seededFromEnv: true };
  }
  return null;
}

async function refreshChannel(channel: ChannelRow, now: Date): Promise<boolean> {
  const current = currentToken(channel);
  if (!current) {
    logger.warn({ channelId: channel.id }, "Instagram channel has no token to refresh");
    return false;
  }

  try {
    const refreshed = await refreshInstagramToken(current.token, now);
    await db
      .update(channels)
      .set({ encryptedToken: encrypt(refreshed.accessToken), tokenExpiresAt: refreshed.expiresAt })
      .where(eq(channels.id, channel.id));
    await db.insert(auditLog).values({
      businessId: channel.businessId,
      actorId: null,
      actorType: "system",
      action: "channel_token_refreshed",
      details: {
        channelId: channel.id,
        channelType: "instagram",
        expiresAt: refreshed.expiresAt.toISOString(),
        seededFromEnv: current.seededFromEnv,
      },
    });
    logger.info({ channelId: channel.id, expiresAt: refreshed.expiresAt.toISOString() }, "Instagram token refreshed");
    return true;
  } catch (err) {
    // Never log the token; AppError details only carry Meta's code/message.
    const code = err instanceof AppError ? err.code : "UNKNOWN";
    const details = err instanceof AppError ? err.details : undefined;
    logger.error({ channelId: channel.id, code, details }, "Failed refreshing Instagram token");
    try {
      await db.insert(auditLog).values({
        businessId: channel.businessId,
        actorId: null,
        actorType: "system",
        action: "channel_token_refresh_failed",
        details: { channelId: channel.id, channelType: "instagram", code, meta: details ?? null },
      });
    } catch (auditErr) {
      logger.error({ err: auditErr, channelId: channel.id }, "Failed to audit Instagram token refresh failure");
    }
    return false;
  }
}

/**
 * Daily job. Live Instagram: refresh every active Instagram channel whose token
 * expires within REFRESH_WHEN_EXPIRING_WITHIN_DAYS (or has no known expiry) and
 * store the new token encrypted. Demo: only logs. Returns how many were refreshed.
 */
export async function checkAndRefreshInstagramTokens(now: Date = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() + REFRESH_WHEN_EXPIRING_WITHIN_DAYS * DAY_MS);

  if (!isInstagramLive(config)) {
    const expiringChannels = await db
      .select()
      .from(channels)
      .where(and(eq(channels.type, "instagram"), eq(channels.status, "active"), lt(channels.tokenExpiresAt, threshold)));
    for (const channel of expiringChannels) {
      logger.info({ channelId: channel.id }, "[DEMO MODE] Instagram channel token refresh checked");
    }
    return expiringChannels.length;
  }

  await ensureDefaultInstagramChannel();

  const active = await db
    .select()
    .from(channels)
    .where(and(eq(channels.type, "instagram"), eq(channels.status, "active")));

  let refreshedCount = 0;
  for (const channel of active) {
    const due = !channel.tokenExpiresAt || channel.tokenExpiresAt < threshold;
    if (!due) continue;
    if (await refreshChannel(channel, now)) refreshedCount++;
  }
  return refreshedCount;
}
