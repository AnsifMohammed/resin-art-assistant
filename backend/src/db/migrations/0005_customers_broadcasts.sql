CREATE TYPE "public"."broadcast_segment" AS ENUM('all', 'favourites', 'priority', 'previous_buyers', 'repeat_buyers', 'new', 'never_ordered', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"broadcast_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"conversation_id" text,
	"message_id" text,
	"phone" text NOT NULL,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"meta_message_id" text,
	"error" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"template_id" text NOT NULL,
	"segment" "broadcast_segment" NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_favourite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opted_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opt_out_source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_unique_idx" ON "broadcast_recipients" USING btree ("broadcast_id","customer_id");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_status_idx" ON "broadcast_recipients" USING btree ("broadcast_id","status");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_meta_id_idx" ON "broadcast_recipients" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX "broadcasts_business_status_idx" ON "broadcasts" USING btree ("business_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "customers_business_segment_idx" ON "customers" USING btree ("business_id","is_favourite","is_priority");