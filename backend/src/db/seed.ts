// Seeds the demo business, one admin, one staff user and the knowledge base.
// Idempotent: safe to run more than once (existing rows are left untouched).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { config } from "../config.ts";
import { db, sql } from "./index.ts";
import { businesses, knowledgeBase, products, users } from "./schema.ts";

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

  const kbRaw = JSON.parse(readFileSync(KB_PATH, "utf-8"));
  const { products: rawProducts, ...kbDataWithoutProducts } = kbRaw;

  await db
    .insert(knowledgeBase)
    .values({ businessId, data: kbDataWithoutProducts })
    .onConflictDoNothing();

  if (Array.isArray(rawProducts) && rawProducts.length > 0) {
    const productRows = rawProducts.map((old: any, idx: number) => {
      const sizes =
        Array.isArray(old.sizes) && old.sizes.length > 0
          ? old.sizes.map((sizeName: string) => ({
              name: String(sizeName),
              price: Math.round(Number(old.price) || 0),
            }))
          : [{ name: "Standard", price: Math.round(Number(old.price) || 0) }];

      return {
        businessId,
        slug: old.id,
        name: old.name,
        description: old.description ?? null,
        sizes,
        leadTimeDays: Number(old.lead_time_days ?? 3),
        customizable: Boolean(old.customizable),
        customOptions: Array.isArray(old.custom_options) ? old.custom_options : [],
        images: [],
        isActive: true,
        sortOrder: idx,
      };
    });

    await db.insert(products).values(productRows).onConflictDoNothing();
  }

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
