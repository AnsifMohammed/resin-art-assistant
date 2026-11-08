ALTER TABLE "message_templates" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "message_templates" ALTER COLUMN "category" SET DEFAULT 'general';--> statement-breakpoint
DROP TYPE "public"."template_category";