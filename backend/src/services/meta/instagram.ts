import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { config, isInstagramLive } from "../../config.ts";
import { db } from "../../db/index.ts";
import { channels } from "../../db/schema.ts";
import { decrypt } from "../../lib/crypto.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { redis } from "../../lib/redis.ts";

// Instagram API with Instagram Login (NOT the Facebook-Page-based graph.facebook.com flow).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
//       https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";
/** The one place the Graph API version is set. */
export const INSTAGRAM_GRAPH_VERSION = "v26.0";
/** Meta's limit for a text message: UTF-8, at most 1000 bytes. Longer replies are split. */
export const INSTAGRAM_MAX_TEXT_BYTES = 1000;
export const INSTAGRAM_REQUEST_TIMEOUT_MS = 10_000;

export function getGraphBaseUrl(): string {
  if (config.META_GRAPH_BASE_URL) {
    return config.META_GRAPH_BASE_URL.replace(/\/+$/, "");
  }
  return INSTAGRAM_GRAPH_HOST;
}

// Meta error codes / subcodes we map to specific app errors.
const TOKEN_INVALID_CODES = new Set([102, 190]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
/** code 10 + one of these: outside the allowed (24h) messaging window. */
const WINDOW_CLOSED_SUBCODES = new Set([2534022, 2018278]);
/** Recipient cannot be messaged (unavailable / no matching user). */
const RECIPIENT_UNAVAILABLE_CODES = new Set([551]);
const RECIPIENT_UNAVAILABLE_SUBCODES = new Set([1545041, 2018001]);

interface MetaErrorBody {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  fbtrace_id?: unknown;
}

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Turn a failed Graph API response into an AppError. Never includes the access token. */
export function mapMetaError(httpStatus: number, body: unknown): AppError {
  const err: MetaErrorBody =
    body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object"
      ? (body.error as MetaErrorBody)
      : {};
  const code = num(err.code);
  const subcode = num(err.error_subcode);
  const details = {
    metaStatus: httpStatus,
    metaCode: code ?? null,
    metaSubcode: subcode ?? null,
    metaType: str(err.type) ?? null,
    metaMessage: str(err.message) ?? null,
    fbtraceId: str(err.fbtrace_id) ?? null,
  };

  if (code !== undefined && TOKEN_INVALID_CODES.has(code)) {
    return new AppError(502, "Instagram access token is invalid or expired", "META_TOKEN_INVALID", details);
  }
  if (code === 10 && subcode !== undefined && WINDOW_CLOSED_SUBCODES.has(subcode)) {
    return new AppError(409, "Customer 24h messaging window is closed", "WINDOW_CLOSED", details);
  }
  if (
    (code !== undefined && RECIPIENT_UNAVAILABLE_CODES.has(code)) ||
    (subcode !== undefined && RECIPIENT_UNAVAILABLE_SUBCODES.has(subcode))
  ) {
    return new AppError(409, "This Instagram user cannot be messaged right now", "RECIPIENT_UNAVAILABLE", details);
  }
  if ((code !== undefined && RATE_LIMIT_CODES.has(code)) || httpStatus === 429) {
    return new AppError(503, "Instagram rate limit reached, try again later", "META_RATE_LIMITED", details);
  }
  return new AppError(502, "Instagram API request failed", "META_ERROR", details);
}

/** fetch + JSON with a timeout; maps network, timeout and Meta errors to AppError. */
async function graphRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(INSTAGRAM_REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AppError(504, "Instagram API timed out", "META_TIMEOUT");
    }
    // The URL may carry a token (refresh endpoint), so only the error name is kept.
    throw new AppError(502, "Could not reach the Instagram API", "META_UNREACHABLE", { cause: name || "fetch_failed" });
  }

  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (!res.ok || (body && typeof body === "object" && "error" in body)) {
    throw mapMetaError(res.status, body);
  }
  if (!body || typeof body !== "object") {
    throw new AppError(502, "Instagram API returned an invalid response", "META_ERROR", { metaStatus: res.status });
  }
  return body as Record<string, unknown>;
}

/**
 * The Instagram access token for a business: the channel row's encrypted token
 * (kept fresh by the refresh job) wins; INSTAGRAM_ACCESS_TOKEN is the fallback
 * for the configured business (first run, before any refresh).
 */
export async function resolveInstagramToken(businessId: string = config.BUSINESS_ID): Promise<string> {
  const rows = await db
    .select({ id: channels.id, encryptedToken: channels.encryptedToken })
    .from(channels)
    .where(and(eq(channels.businessId, businessId), eq(channels.type, "instagram")));
  const withToken = rows.find((r) => r.encryptedToken);
  if (withToken?.encryptedToken) {
    try {
      return decrypt(withToken.encryptedToken);
    } catch (err) {
      logger.error({ channelId: withToken.id, errName: err instanceof Error ? err.name : "unknown" }, "Could not decrypt Instagram channel token; falling back to env");
    }
  }
  if (businessId === config.BUSINESS_ID && config.INSTAGRAM_ACCESS_TOKEN) {
    return config.INSTAGRAM_ACCESS_TOKEN;
  }
  throw new AppError(503, "Instagram is not connected for this business", "INSTAGRAM_NOT_CONFIGURED");
}

/** Profile lookups run inside webhook handling, so they get a short timeout. */
const PROFILE_TIMEOUT_MS = 3000;

/**
 * Display name for an Instagram customer from the User Profile API
 * (GET /{IGSID}?fields=name,username): "Name (@username)", "@username" or "Name".
 * Best effort: returns null on any failure so webhook handling never breaks.
 */
export async function fetchInstagramDisplayName(
  igsid: string,
  businessId: string = config.BUSINESS_ID,
): Promise<string | null> {
  try {
    const token = await resolveInstagramToken(businessId);
    const url = `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igsid)}?fields=name,username`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Instagram profile lookup failed");
      return null;
    }
    const body = (await res.json()) as { name?: unknown; username?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (name && username) return `${name} (@${username})`;
    if (username) return `@${username}`;
    return name || null;
  } catch (err) {
    logger.warn({ errName: err instanceof Error ? err.name : "unknown" }, "Instagram profile lookup failed");
    return null;
  }
}

/**
 * Split text into chunks of at most `maxBytes` UTF-8 bytes, preferring to cut at
 * a line break or space. Malayalam is 3 bytes per character, so ~330 characters
 * already hit Meta's 1000-byte limit.
 */
export function splitInstagramText(text: string, maxBytes: number = INSTAGRAM_MAX_TEXT_BYTES): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (Buffer.byteLength(rest, "utf8") > maxBytes) {
    // Longest prefix (whole code points) that fits.
    let bytes = 0;
    let cut = 0;
    for (const ch of rest) {
      const b = Buffer.byteLength(ch, "utf8");
      if (bytes + b > maxBytes) break;
      bytes += b;
      cut += ch.length;
    }
    const prefix = rest.slice(0, cut);
    const breakAt = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf(" "));
    if (breakAt > cut / 2) cut = breakAt;
    const chunk = rest.slice(0, cut).trimEnd();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export interface SendInstagramTextOptions {
  /** The customer's Instagram-scoped id (IGSID) = customers.handle_or_phone. */
  recipientId: string;
  text: string;
  /** Business whose token is used. Defaults to BUSINESS_ID. */
  businessId?: string;
  /** Use this token instead of resolving one (tests / one-off calls). */
  accessToken?: string;
}

export interface SendInstagramTextResult {
  /** Meta's mid of the first message sent (stored on our outbound message row). */
  metaMessageId: string;
  /** Every mid when the text had to be split into several messages. */
  metaMessageIds: string[];
}

/**
 * Send a text DM: POST https://graph.instagram.com/{version}/me/messages with
 * `Authorization: Bearer <token>` and `{ recipient: { id }, message: { text } }`.
 * Only works inside the customer's 24h window (otherwise 409 WINDOW_CLOSED).
 */
export async function sendInstagramText(opts: SendInstagramTextOptions): Promise<SendInstagramTextResult> {
  if (!opts.recipientId) throw new AppError(400, "Instagram recipient id is required", "VALIDATION_ERROR");
  const chunks = splitInstagramText(opts.text);
  if (chunks.length === 0) throw new AppError(400, "Message text is empty", "VALIDATION_ERROR");

  const token = opts.accessToken ?? (await resolveInstagramToken(opts.businessId));
  const url = `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/me/messages`;

  const ids: string[] = [];
  for (const chunk of chunks) {
    let body: Record<string, unknown>;
    try {
      body = await graphRequest(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: opts.recipientId }, message: { text: chunk } }),
      });
    } catch (err) {
      if (ids.length > 0 && err instanceof AppError) {
        // Part of the reply already reached the customer.
        throw new AppError(502, "Instagram reply was only partly delivered", "META_PARTIAL_SEND", {
          sentChunks: ids.length,
          totalChunks: chunks.length,
          metaMessageIds: ids,
          cause: { code: err.code, details: err.details },
        });
      }
      throw err;
    }
    const mid = str(body.message_id);
    if (!mid) {
      throw new AppError(502, "Instagram API response had no message_id", "META_ERROR");
    }
    ids.push(mid);
  }

  return { metaMessageId: ids[0]!, metaMessageIds: ids };
}

export interface SendInstagramMediaOptions {
  /** The customer's Instagram-scoped id (IGSID) = customers.handle_or_phone. */
  recipientId: string;
  mediaUrl: string;
  /** Explicit attachment type; inferred from extension / URL if omitted. */
  type?: "image" | "video";
  /** Business whose token is used. Defaults to BUSINESS_ID. */
  businessId?: string;
  /** Use this token instead of resolving one (tests / one-off calls). */
  accessToken?: string;
}

export interface SendInstagramMediaResult {
  /** Meta's mid of the media message sent. */
  metaMessageId: string;
}

/**
 * Send an image or video attachment DM: POST https://graph.instagram.com/{version}/me/messages with
 * `Authorization: Bearer <token>` and `{ recipient: { id }, message: { attachment: { type, payload: { url } } } }`.
 */
export async function sendInstagramMedia(opts: SendInstagramMediaOptions): Promise<SendInstagramMediaResult> {
  if (!opts.recipientId) throw new AppError(400, "Instagram recipient id is required", "VALIDATION_ERROR");
  if (!opts.mediaUrl) throw new AppError(400, "Media URL is required", "VALIDATION_ERROR");

  const token = opts.accessToken ?? (await resolveInstagramToken(opts.businessId));
  const url = `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}/me/messages`;

  const ext = opts.mediaUrl.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  const isVideo =
    opts.type === "video" ||
    ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext) ||
    opts.mediaUrl.includes("/video/upload/");
  const attachmentType = isVideo ? "video" : "image";

  const body = await graphRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: {
        attachment: {
          type: attachmentType,
          payload: {
            url: opts.mediaUrl,
            is_reusable: true,
          },
        },
      },
    }),
  });

  const mid = str(body.message_id);
  if (!mid) {
    throw new AppError(502, "Instagram API response had no message_id", "META_ERROR");
  }

  return { metaMessageId: mid };
}

export interface RefreshedInstagramToken {
  accessToken: string;
  expiresIn: number;
  expiresAt: Date;
}

/**
 * Refresh a long-lived (60-day) Instagram User token. Meta requires it to be at
 * least 24h old and unexpired:
 * GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=...
 * -> { access_token, token_type: "bearer", expires_in }
 */
export async function refreshInstagramToken(token: string, now: Date = new Date()): Promise<RefreshedInstagramToken> {
  const url = new URL(`${INSTAGRAM_GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);

  const body = await graphRequest(url.toString(), { method: "GET" });
  const accessToken = str(body.access_token);
  const expiresIn = num(body.expires_in);
  if (!accessToken || expiresIn === undefined || expiresIn <= 0) {
    throw new AppError(502, "Instagram token refresh returned an invalid response", "META_ERROR");
  }
  return { accessToken, expiresIn, expiresAt: new Date(now.getTime() + expiresIn * 1000) };
}

export interface IgMedia {
  id: string;
  mediaType: "reel" | "post" | "carousel";
  caption: string;
  permalink: string;
  thumbnailUrl: string;
  timestamp: string;
}

/**
 * Reply publicly to an Instagram comment:
 * POST /{comment-id}/replies with { message: text }
 */
export async function replyToComment(
  commentId: string,
  text: string,
  businessId: string = config.BUSINESS_ID,
): Promise<{ id: string }> {
  if (!commentId) throw new AppError(400, "Comment ID is required", "VALIDATION_ERROR");
  if (!text || text.trim().length === 0) throw new AppError(400, "Reply text is empty", "VALIDATION_ERROR");

  if (!isInstagramLive(config)) {
    logger.info({ commentId, textLength: text.length }, "[DEMO_MODE] Instagram comment reply logged (not sent)");
    return { id: `demo_reply_${nanoid()}` };
  }

  const token = await resolveInstagramToken(businessId);
  const url = `${getGraphBaseUrl()}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(commentId)}/replies`;
  const body = await graphRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });

  const replyId = str(body.id);
  if (!replyId) {
    throw new AppError(502, "Instagram API response had no id", "META_ERROR");
  }
  return { id: replyId };
}

/**
 * Send a private reply (DM) to an Instagram comment:
 * POST /{ig-account-id}/messages with recipient: { comment_id: commentId }
 */
export async function sendPrivateReply(
  commentId: string,
  text: string,
  businessId: string = config.BUSINESS_ID,
): Promise<{ messageId: string }> {
  if (!commentId) throw new AppError(400, "Comment ID is required", "VALIDATION_ERROR");
  if (!text || text.trim().length === 0) throw new AppError(400, "DM text is empty", "VALIDATION_ERROR");

  if (!isInstagramLive(config)) {
    logger.info({ commentId, textLength: text.length }, "[DEMO_MODE] Instagram private reply logged (not sent)");
    return { messageId: `demo_mid_${nanoid()}` };
  }

  const token = await resolveInstagramToken(businessId);
  const accountId = config.INSTAGRAM_ACCOUNT_ID;
  if (!accountId) {
    throw new AppError(503, "Instagram account ID is not configured", "INSTAGRAM_NOT_CONFIGURED");
  }

  const url = `${getGraphBaseUrl()}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(accountId)}/messages`;
  const body = await graphRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });

  const messageId = str(body.message_id) ?? str(body.id);
  if (!messageId) {
    throw new AppError(502, "Instagram API response had no message_id", "META_ERROR");
  }
  return { messageId };
}

/**
 * List recent media (posts, reels, carousels) from Instagram.
 * Cached in Redis for 10 minutes.
 */
export async function listRecentMedia(
  limit: number = 30,
  businessId: string = config.BUSINESS_ID,
): Promise<IgMedia[]> {
  const cacheKey = `ig:recent_media:${businessId}`;
  try {
    const cached = await redis.get<IgMedia[] | string>(cacheKey);
    if (cached) {
      return (typeof cached === "string" ? JSON.parse(cached) : cached) as IgMedia[];
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read cached media from redis");
  }

  if (!isInstagramLive(config)) {
    const fixtureMedia: IgMedia[] = [
      {
        id: "demo_media_ocean_clock",
        mediaType: "reel",
        caption: "Ocean waves resin wall clock 🌊 Handcrafted with real sand and sea shells! Custom sizes available #resinart #oceanclock #sabaart",
        permalink: "https://instagram.com/p/demo_reel_ocean_clock",
        thumbnailUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=400",
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: "demo_media_geode_coasters",
        mediaType: "post",
        caption: "Set of 4 amethyst purple geode resin coasters with gold gilded edges ✨ Perfect gift! #geodecoasters #resinart",
        permalink: "https://instagram.com/p/demo_post_geode_coasters",
        thumbnailUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=400",
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: "demo_media_name_plaque",
        mediaType: "reel",
        caption: "Custom Islamic Arabic calligraphy name plaque in emerald green and gold foil 💚 DM for customized family plaques #resinplaque",
        permalink: "https://instagram.com/p/demo_reel_name_plaque",
        thumbnailUrl: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=400",
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
      },
      {
        id: "demo_media_flower_preservation",
        mediaType: "post",
        caption: "Preserved wedding flower preservation resin frame 🌸 Keep your bridal bouquet memories alive forever #flowerpreservation",
        permalink: "https://instagram.com/p/demo_post_flower_preservation",
        thumbnailUrl: "https://images.unsplash.com/photo-1582562124811-c09040d0a901?w=400",
        timestamp: new Date(Date.now() - 3600000 * 72).toISOString(),
      },
      {
        id: "demo_media_ocean_table",
        mediaType: "reel",
        caption: "Mini ocean resin side table with teak wood base 🌊 Living room statement piece #resintable",
        permalink: "https://instagram.com/p/demo_reel_ocean_table",
        thumbnailUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400",
        timestamp: new Date(Date.now() - 3600000 * 96).toISOString(),
      },
      {
        id: "demo_media_keychains",
        mediaType: "carousel",
        caption: "Alphabet letter resin keychains with rose petals & gold flakes ✨ Bulk orders welcome for wedding return gifts #keychains",
        permalink: "https://instagram.com/p/demo_post_keychains",
        thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400",
        timestamp: new Date(Date.now() - 3600000 * 120).toISOString(),
      },
    ];

    try {
      await redis.setex(cacheKey, 600, JSON.stringify(fixtureMedia));
    } catch (err) {
      logger.warn({ err }, "Failed to cache fixture media in redis");
    }
    return fixtureMedia;
  }

  const token = await resolveInstagramToken(businessId);
  const accountId = config.INSTAGRAM_ACCOUNT_ID;
  if (!accountId) {
    throw new AppError(503, "Instagram account ID is not configured", "INSTAGRAM_NOT_CONFIGURED");
  }

  const url = `${getGraphBaseUrl()}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(accountId)}/media?fields=id,media_type,media_product_type,caption,permalink,thumbnail_url,media_url,timestamp&limit=${limit}`;
  const body = await graphRequest(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const rawItems = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  const result: IgMedia[] = rawItems.map((item) => {
    const mType = str(item.media_type) ?? "";
    const prodType = str(item.media_product_type) ?? "";
    const permalink = str(item.permalink) ?? "";
    let mediaType: "reel" | "post" | "carousel" = "post";
    if (prodType === "REELS" || permalink.includes("/reel/")) {
      mediaType = "reel";
    } else if (mType === "CAROUSEL_ALBUM") {
      mediaType = "carousel";
    } else if (mType === "VIDEO") {
      mediaType = "reel";
    }
    const thumbnailUrl = str(item.thumbnail_url) ?? str(item.media_url) ?? "";
    return {
      id: str(item.id) ?? "",
      mediaType,
      caption: str(item.caption) ?? "",
      permalink,
      thumbnailUrl,
      timestamp: str(item.timestamp) ?? new Date().toISOString(),
    };
  });

  try {
    await redis.setex(cacheKey, 600, JSON.stringify(result));
  } catch (err) {
    logger.warn({ err }, "Failed to cache media in redis");
  }
  return result;
}

/**
 * Fetch the profile picture URL for an Instagram commenter by their IGSID.
 * Returns null in demo mode or on any API error (non-fatal).
 * Result is cached in Redis for 6 hours since profile pics change infrequently.
 */
export async function fetchCommenterProfilePic(
  igsid: string,
  businessId: string = config.BUSINESS_ID,
): Promise<string | null> {
  if (!igsid || igsid.startsWith("ig_")) return null; // simulated commenter

  const cacheKey = `ig:profile_pic:${igsid}`;
  try {
    const cached = await redis.get<string>(cacheKey);
    if (cached) return cached;
  } catch {
    // cache miss is fine
  }

  if (!isInstagramLive(config)) return null;

  try {
    const token = await resolveInstagramToken(businessId);
    const url = `${getGraphBaseUrl()}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(igsid)}?fields=profile_pic&access_token=${token}`;
    const body = await graphRequest(url, { method: "GET" });
    const picUrl = typeof body.profile_pic === "string" ? body.profile_pic : null;
    if (picUrl) {
      try {
        await redis.setex(cacheKey, 6 * 60 * 60, picUrl);
      } catch {
        // ignore cache write failures
      }
    }
    return picUrl;
  } catch (err) {
    logger.warn({ err, igsid }, "Failed to fetch Instagram commenter profile pic");
    return null;
  }
}
