ALTER TYPE "public"."template_category" ADD VALUE 'production_progress';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "production_started_at" timestamp;

