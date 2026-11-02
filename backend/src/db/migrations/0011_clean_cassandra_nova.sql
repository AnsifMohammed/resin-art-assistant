-- Remove duplicate conversations, keeping the oldest per customer.
-- Messages/escalations referencing removed conversations become orphans (acceptable for demo cleanup).
DELETE FROM "conversations"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("customer_id") "id"
  FROM "conversations"
  ORDER BY "customer_id", "created_at" ASC
);--> statement-breakpoint

-- Remove duplicate customers, keeping the oldest per (channel_id, handle_or_phone).
DELETE FROM "customers"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("channel_id", "handle_or_phone") "id"
  FROM "customers"
  ORDER BY "channel_id", "handle_or_phone", "created_at" ASC
);--> statement-breakpoint

CREATE UNIQUE INDEX "conversations_customer_unique_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_channel_handle_idx" ON "customers" USING btree ("channel_id","handle_or_phone");
