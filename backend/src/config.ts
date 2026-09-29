import "dotenv/config";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// backend/ (the directory this package's package.json lives in), regardless
// of the process's current working directory.
export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const optional = () => z.string().optional();

/** Resolve a DATABASE_CA_CERT value against BACKEND_ROOT (not process.cwd()). */
export function resolveCaCertPath(value: string): string {
  return isAbsolute(value) ? value : join(BACKEND_ROOT, value);
}

/** Value accepted by Fastify's `trustProxy` option. */
export type TrustProxySetting = boolean | string[] | ((address: string, hop: number) => boolean);

// Named ranges understood by proxy-addr (used by Fastify's trustProxy).
const PROXY_ADDR_NAMES = new Set(["loopback", "linklocal", "uniquelocal"]);

function isIpOrCidr(entry: string): boolean {
  if (PROXY_ADDR_NAMES.has(entry)) return true;
  const [addr, prefix, ...rest] = entry.split("/");
  if (rest.length > 0 || !addr) return false;
  const version = isIP(addr);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (version === 4 ? 32 : 128);
}

/**
 * Parse TRUST_PROXY. Unset/"false" -> false (never trust X-Forwarded-For),
 * "true" -> trust every hop (only safe behind a proxy that overwrites the
 * header), an integer -> trust that many hops, otherwise a comma-separated
 * list of proxy IPs/CIDRs.
 */
export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const raw = (value ?? "").trim();
  if (raw === "" || raw.toLowerCase() === "false") return false;
  if (raw.toLowerCase() === "true") return true;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops === 0) return false;
    // Same semantics as Fastify's numeric trustProxy (hop count).
    return (_address: string, hop: number) => hop < hops;
  }
  const entries = raw.split(",").map((e) => e.trim()).filter(Boolean);
  if (entries.length === 0 || !entries.every(isIpOrCidr)) {
    throw new Error("invalid TRUST_PROXY");
  }
  return entries;
}

// Vars that are optional in demo mode and required in live mode.
export const LIVE_ONLY_VARS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_ACCOUNT_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
] as const;

export const envSchema = z
  .object({
    // Server
    PORT: z.coerce.number().int().min(1).max(65535),
    NODE_ENV: z.enum(["development", "production", "test"]),
    DEMO_MODE: z
      .enum(["true", "false"], { error: 'must be "true" or "false"' })
      .transform((v) => v === "true"),
    DASHBOARD_URL: z.url().default("http://localhost:5173"),
    // Whether to trust X-Forwarded-For. Default false. See .env.example.
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value, ctx) => {
        try {
          return parseTrustProxy(value);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: 'must be "true", "false", a hop count, or a comma-separated list of IPs/CIDRs',
          });
          return z.NEVER;
        }
      }),

    // Auth
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().min(1),

    // Database
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// URL"),
    // Path (relative to the backend/ directory) to a CA cert used to verify
    // the Postgres server's TLS certificate. Empty/unset = unset (no
    // verification changes vs. current behaviour).
    DATABASE_CA_CERT: optional().refine(
      (value) => value === undefined || existsSync(resolveCaCertPath(value)),
      { error: "file not found (path is resolved relative to the backend/ directory)" },
    ),

    // Gemini
    GEMINI_API_KEY: z.string().min(1),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),

    // Meta / Instagram / WhatsApp (required only when DEMO_MODE=false)
    META_APP_ID: optional(),
    META_APP_SECRET: optional(),
    META_VERIFY_TOKEN: optional(),
    INSTAGRAM_ACCESS_TOKEN: optional(),
    INSTAGRAM_ACCOUNT_ID: optional(),
    WHATSAPP_TOKEN: optional(),
    WHATSAPP_PHONE_NUMBER_ID: optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: optional(),

    // Owner alerts
    OWNER_ALERT_PHONE: optional(),
    OWNER_WHATSAPP_TOKEN: optional(),

    // Token encryption
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (openssl rand -hex 32)"),

    // Demo business
    BUSINESS_ID: z.string().min(1),

    // Sentry
    SENTRY_DSN: optional(),

    // Upstash Redis
    UPSTASH_REDIS_URL: optional(),
    UPSTASH_REDIS_TOKEN: optional(),

    // Resend
    RESEND_API_KEY: optional(),
    RESEND_FROM_DOMAIN: optional(),

    // Web push (VAPID)
    VAPID_PUBLIC_KEY: optional(),
    VAPID_PRIVATE_KEY: optional(),
    VAPID_EMAIL: optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DEMO_MODE) return;
    for (const key of LIVE_ONLY_VARS) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "required when DEMO_MODE=false",
        });
      }
    }
  });

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

/** Parse and validate an env object. Empty strings are treated as unset. */
export function parseEnv(env: Record<string, string | undefined>): Config {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== "") cleaned[key] = value.trim();
  }

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(root)";
      const missing = issue.code !== "custom" && cleaned[key] === undefined;
      return missing ? `${key}: missing` : `${key}: ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  return result.data;
}

export const config: Config = parseEnv(process.env);

/** Absolute path to the Postgres CA cert, resolved relative to backend/. */
export const DATABASE_CA_CERT_PATH: string | undefined = config.DATABASE_CA_CERT
  ? resolveCaCertPath(config.DATABASE_CA_CERT)
  : undefined;
