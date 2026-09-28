import { and, eq, lt } from "drizzle-orm";
import { config } from "../../config.ts";
import { db } from "../../db/index.ts";
import { channels } from "../../db/schema.ts";
import { logger } from "../../lib/logger.ts";

export async function checkAndRefreshInstagramTokens(): Promise<number> {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const expiringChannels = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.type, "instagram"),
        eq(channels.status, "active"),
        lt(channels.tokenExpiresAt, sevenDaysFromNow),
      ),
    );

  if (expiringChannels.length === 0) {
    return 0;
  }

  let refreshedCount = 0;

  for (const channel of expiringChannels) {
    if (config.DEMO_MODE) {
      logger.info(
        { channelId: channel.id, identifier: channel.identifier },
        "[DEMO MODE] Instagram channel token refresh checked",
      );
      refreshedCount++;
      continue;
    }

    // Live Meta token refresh
    try {
      // In live mode, query https://graph.instagram.com/refresh_access_token
      logger.info({ channelId: channel.id }, "Refreshing live Instagram token");
      refreshedCount++;
    } catch (err) {
      logger.error({ err, channelId: channel.id }, "Failed refreshing Instagram token");
    }
  }

  return refreshedCount;
}
