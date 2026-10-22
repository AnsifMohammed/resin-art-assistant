-- Restore escalation reasons the app uses (a branch migration recreated the enum without them).
ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'intent_off_topic';--> statement-breakpoint
ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'intent_payment';--> statement-breakpoint
ALTER TYPE "public"."escalation_reason" ADD VALUE IF NOT EXISTS 'window_closed';--> statement-breakpoint
CREATE TYPE "public"."meta_template_status" AS ENUM('not_submitted', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('delivery', 'festive', 'custom_order', 'payment', 'general');--> statement-breakpoint
CREATE TYPE "public"."template_channel" AS ENUM('whatsapp', 'instagram', 'both');--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "template_category" NOT NULL,
	"channel" "template_channel" DEFAULT 'both' NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"meta_template_name" text,
	"meta_status" "meta_template_status" DEFAULT 'not_submitted' NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "admin_last_read_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_business_name_idx" ON "message_templates" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "templates_business_category_idx" ON "message_templates" USING btree ("business_id","category");--> statement-breakpoint
CREATE INDEX "conversations_business_last_msg_idx" ON "conversations" USING btree ("business_id","last_message_at");--> statement-breakpoint
UPDATE "conversations" c SET "last_message_at" = (SELECT max(m."created_at") FROM "messages" m WHERE m."conversation_id" = c."id");
