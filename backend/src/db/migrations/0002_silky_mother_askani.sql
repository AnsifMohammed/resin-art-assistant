CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'in_production', 'ready', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"product_name" text NOT NULL,
	"product_description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) GENERATED ALWAYS AS ((((quantity)::numeric * unit_price))) STORED,
	"customizations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_check" CHECK ("order_items"."unit_price" >= (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY DEFAULT (gen_random_uuid())::text NOT NULL,
	"business_id" text NOT NULL,
	"customer_id" text,
	"order_no" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"delivery_charge" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"shipping_address" text,
	"customer_notes" text,
	"internal_notes" text,
	"expected_delivery_date" date,
	"dispatched_at" timestamp,
	"delivered_at" timestamp,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_orders_business_order_no" UNIQUE("business_id","order_no"),
	CONSTRAINT "orders_delivery_charge_check" CHECK ("orders"."delivery_charge" >= (0)::numeric),
	CONSTRAINT "orders_discount_amount_check" CHECK ("orders"."discount_amount" >= (0)::numeric),
	CONSTRAINT "orders_subtotal_check" CHECK ("orders"."subtotal" >= (0)::numeric),
	CONSTRAINT "orders_total_amount_check" CHECK ("orders"."total_amount" >= (0)::numeric)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id") WHERE "order_items"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_orders_business_status" ON "orders" USING btree ("business_id","status") WHERE "orders"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at" DESC NULLS LAST) WHERE "orders"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_orders_customer" ON "orders" USING btree ("customer_id") WHERE "orders"."is_deleted" = false;