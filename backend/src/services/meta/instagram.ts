import { and, eq } from "drizzle-orm";
import { config } from "../../config.ts";
import { db } from "../../db/index.ts";
import { channels } from "../../db/schema.ts";
import { decrypt } from "../../lib/crypto.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";

// Instagram API with Instagram Login (NOT the Facebook-Page-based graph.facebook.com flow).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
//       https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";
/** The one place the Graph API version is set. */
export const INSTAGRAM_GRAPH_VERSION = "v26.0";
/** Meta's limit for a text message: UTF-8, at most 1000 bytes. Longer replies are split. */
export const INSTAGRAM_MAX_TEXT_BYTES = 1000;
export const INSTAGRAM_REQUEST_TIMEOUT_MS = 10_000;

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
