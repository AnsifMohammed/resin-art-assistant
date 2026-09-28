// Seeds the demo business, one admin, one staff user and the knowledge base.
// Idempotent: safe to run more than once (existing rows are left untouched).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { config } from "../config.ts";
import { db, sql } from "./index.ts";
import { businesses, knowledgeBase, users } from "./schema.ts";

// backend/src/db/seed.ts -> <repo>/docs/knowledge-base.json
const KB_PATH = fileURLToPath(new URL("../../../docs/knowledge-base.json", import.meta.url));

const hash = (password: string) => argon2.hash(password, { type: argon2.argon2id });

async function seed() {
  const businessId = config.BUSINESS_ID;

  await db
    .insert(businesses)
    .values({ id: businessId, name: "Asha Resin Art" })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values([
      {
        businessId,
        name: "Asha",
        email: "asha@asharesins.com",
        passwordHash: await hash("changeme123"),
        role: "admin",
      },
      {
        businessId,
        name: "Priya",
        email: "priya@asharesins.com",
        passwordHash: await hash("staffpass123"),
        role: "staff",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(knowledgeBase)
    .values({ businessId, data: JSON.parse(readFileSync(KB_PATH, "utf-8")) })
    .onConflictDoNothing();

  console.log(`Seed complete for business ${businessId}`);
}

try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
