import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config();

// Not importing src/config.ts here on purpose (per project instructions):
// reading process.env directly keeps this file independent of the app's
// Zod-validated config module.
const BACKEND_ROOT = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const parsed = new URL(databaseUrl);

// DATABASE_CA_CERT is resolved relative to backend/ (this file's directory),
// not process.cwd(), same as backend/src/config.ts does at runtime.
const caCertEnv = process.env.DATABASE_CA_CERT?.trim();
const caCertPath = caCertEnv
  ? isAbsolute(caCertEnv)
    ? caCertEnv
    : join(BACKEND_ROOT, caCertEnv)
  : undefined;

// IMPORTANT: dbCredentials must NOT use the `{ url }` form here. drizzle-kit's
// postgres-js/pg driver code (node_modules/drizzle-kit/api.js) special-cases
// `"url" in credentials`: when present, it builds `new pg.Pool({ connectionString: url })`
// and silently ignores any `ssl` field entirely. Passing the individual
// host/port/user/password/database fields instead is the only way to make
// drizzle-kit (and the underlying `pg` driver it uses for migrate/generate)
// actually apply our `ssl` option.
const ssl = caCertPath
  ? { ca: readFileSync(caCertPath, "utf8"), rejectUnauthorized: true }
  : ("require" as const); // encrypted but unverified, matching the previous ?sslmode=require behaviour

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ssl,
  },
  verbose: true,
  strict: true,
});
