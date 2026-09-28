ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'intent_off_topic';--> statement-breakpoint
ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'intent_payment';--> statement-breakpoint
ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'window_closed';--> statement-breakpoint
CREATE UNIQUE INDEX "escalations_open_conversation_idx" ON "escalations" USING btree ("conversation_id") WHERE "escalations"."resolved_at" IS NULL;