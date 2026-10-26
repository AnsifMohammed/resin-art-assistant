import crypto from "node:crypto";

/**
 * Validate Meta's X-Hub-Signature-256 header against the RAW request bytes.
 * Returns false (never throws) for a malformed, missing or different-length signature.
 */
export function validateSignature(
  rawBody: Buffer | string,
  signature: string | undefined | null,
  secret: string,
): boolean {
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex"),
    "utf8",
  );
  const given = Buffer.from(signature, "utf8");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

export interface WebhookAuthOptions {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  /** A single app secret (kept for existing callers). */
  secret?: string | undefined;
  /**
   * Every app secret that may sign a webhook. Meta signs Facebook-login /
   * WhatsApp webhooks with the Meta app secret and Instagram-login webhooks
   * with the Instagram app secret, so either may be valid.
   */
  secrets?: Array<string | undefined>;
  demoMode: boolean;
}

/**
 * Decide whether a POST /webhook request may be processed.
 * - Any secret configured: signature must be present and valid over the raw
 *   bytes under at least one of them.
 * - No secret: accepted only in DEMO_MODE (no validation possible); otherwise rejected.
 */
export function isWebhookRequestAuthorized(opts: WebhookAuthOptions): boolean {
  const secrets = [opts.secret, ...(opts.secrets ?? [])].filter(
    (s): s is string => typeof s === "string" && s !== "",
  );
  if (secrets.length === 0) return opts.demoMode;
  if (!opts.rawBody) return false;
  const rawBody = opts.rawBody;
  // Check every secret (no early exit) so timing does not reveal which one matched.
  const results = secrets.map((secret) => validateSignature(rawBody, opts.signature, secret));
  return results.includes(true);
}

/**
 * Meta verification handshake (GET /webhook). Returns the challenge to echo back,
 * or null when the request must be rejected (including when no verify token is configured).
 */
export function verifyHandshake(
  query: Record<string, unknown>,
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken) return null;
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode !== "subscribe" || typeof token !== "string" || typeof challenge !== "string") return null;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(verifyToken, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return challenge;
}

/** Strip everything but digits (for comparing phone numbers across formats). */
export function digitsOnly(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}
