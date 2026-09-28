import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config, DATABASE_CA_CERT_PATH } from "../config.ts";
import * as schema from "./schema.ts";

// When DATABASE_CA_CERT is set, verify the server's TLS certificate against
// it (full chain + hostname verification). This takes priority over any
// `sslmode` query param on DATABASE_URL: postgres-js's parseOptions merges
// options in `k in o ? o[k] : k in query ? ... : default`, so an explicit
// `ssl` option here always wins over `?sslmode=` from the URL.
// See node_modules/postgres/src/index.js (parseOptions) and
// node_modules/postgres/src/connection.js (secure(): `typeof ssl === 'object'`
// is Object.assign'd onto the tls.connect options as-is, so passing
// `rejectUnauthorized: true` here is not overridden to false the way the
// string values 'require' | 'allow' | 'prefer' are).
const ssl = DATABASE_CA_CERT_PATH
  ? { ca: readFileSync(DATABASE_CA_CERT_PATH, "utf8"), rejectUnauthorized: true }
  : undefined;

// postgres-js connects lazily on the first query, so importing this module
// does not require a live database (the server can boot without one).
export const sql = postgres(config.DATABASE_URL, { max: 10, ...(ssl ? { ssl } : {}) });

export const db = drizzle(sql, { schema });

export type Db = typeof db;
export { schema };
