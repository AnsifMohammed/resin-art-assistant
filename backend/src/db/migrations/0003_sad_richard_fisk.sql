CREATE TYPE "public"."payment_kind" AS ENUM('advance', 'balance', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'void');--> statement-breakpoint
CREATE TABLE "payments" (
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
ALTER TABLE "ai_decisions" ALTER COLUMN "escalate_reason" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "escalations" ALTER COLUMN "reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."escalation_reason";--> statement-breakpoint
CREATE TYPE "public"."escalation_reason" AS ENUM('intent_complaint', 'intent_refund', 'intent_unknown', 'missing_facts', 'always_escalate_phrase', 'payment_claim', 'unapproved_intent', 'parse_error', 'manual');--> statement-breakpoint
ALTER TABLE "ai_decisions" ALTER COLUMN "escalate_reason" SET DATA TYPE "public"."escalation_reason" USING "escalate_reason"::"public"."escalation_reason";--> statement-breakpoint
ALTER TABLE "escalations" ALTER COLUMN "reason" SET DATA TYPE "public"."escalation_reason" USING "reason"::"public"."escalation_reason";--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_revenue_idx" ON "payments" USING btree ("business_id","status","paid_at");