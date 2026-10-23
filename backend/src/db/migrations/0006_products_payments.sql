DO $$ BEGIN
  CREATE TYPE "public"."payment_kind" AS ENUM('advance', 'balance', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"order_id" text NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'UPI',
	"reference" text,
	"note" text,
	"paid_at" timestamp,
	"recorded_by_user_id" text,
	"voided_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_time_days" integer DEFAULT 3 NOT NULL,
	"customizable" boolean DEFAULT false NOT NULL,
	"custom_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_revenue_idx" ON "payments" USING btree ("business_id","status","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_business_slug_idx" ON "products" USING btree ("business_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_business_active_idx" ON "products" USING btree ("business_id","is_active");