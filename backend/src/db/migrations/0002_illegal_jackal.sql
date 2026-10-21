CREATE TABLE "products" (
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
CREATE UNIQUE INDEX "products_business_slug_idx" ON "products" USING btree ("business_id","slug");--> statement-breakpoint
CREATE INDEX "products_business_active_idx" ON "products" USING btree ("business_id","is_active");