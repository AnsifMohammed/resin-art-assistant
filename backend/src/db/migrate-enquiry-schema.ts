import { db } from "./index.ts";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.ts";

async function runMigration() {
  logger.info("Starting enquiry schema migration...");

  await db.execute(sql`
    ALTER TABLE "conversations" 
      ADD COLUMN IF NOT EXISTS "active_product_slug" text,
      ADD COLUMN IF NOT EXISTS "active_enquiry" jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "ai_mode" text NOT NULL DEFAULT 'auto';

    ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "conversation_id" text;

    CREATE INDEX IF NOT EXISTS "idx_conversations_active_product" 
      ON "conversations" ("business_id", "active_product_slug");
  `);

  logger.info("Enquiry schema migration completed successfully.");
  process.exit(0);
}

runMigration().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});

