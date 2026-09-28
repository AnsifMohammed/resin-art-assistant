CREATE TYPE "public"."channel_type" AS ENUM('instagram', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."conv_state" AS ENUM('ai_active', 'escalated', 'owner_handling', 'paused');--> statement-breakpoint
CREATE TYPE "public"."conv_tag" AS ENUM('new_lead', 'custom_order', 'payment_pending', 'order_confirmed', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."escalation_reason" AS ENUM('intent_complaint', 'intent_refund', 'intent_unknown', 'missing_facts', 'always_escalate_phrase', 'payment_claim', 'unapproved_intent', 'parse_error', 'manual', 'intent_off_topic', 'intent_payment', 'window_closed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."sender_type" AS ENUM('customer', 'ai', 'owner', 'staff', 'system');--> statement-breakpoint
CREATE TABLE "ai_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"business_id" text NOT NULL,
	"intent" text NOT NULL,
	"reply_draft" text NOT NULL,
	"facts_used" jsonb DEFAULT '[]'::jsonb,
	"missing_facts" jsonb DEFAULT '[]'::jsonb,
	"escalate" boolean NOT NULL,
	"escalate_reason" "escalation_reason",
	"suggested_tag" text,
	"language_detected" text,
	"sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"conversation_id" text,
	"escalation_id" text,
	"target_user_id" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"meta_config" jsonb DEFAULT '{}'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"type" "channel_type" NOT NULL,
	"identifier" text NOT NULL,
	"encrypted_token" text,
	"token_expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"state" "conv_state" DEFAULT 'ai_active' NOT NULL,
	"tag" "conv_tag",
	"last_customer_message_at" timestamp,
	"window_closes_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text,
	"handle_or_phone" text NOT NULL,
	"language" text DEFAULT 'english',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"reason" "escalation_reason" NOT NULL,
	"assigned_to_user_id" text,
	"assigned_by_user_id" text,
	"assigned_at" timestamp,
	"alerted_at" timestamp,
	"reminded_at" timestamp,
	"resolved_at" timestamp,
	"resolved_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"business_id" text NOT NULL,
	"direction" "direction" NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"sender_id" text,
	"content" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"meta_message_id" text,
	"delivery_status" "delivery_status" DEFAULT 'queued',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_decisions_conversation_idx" ON "ai_decisions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "audit_business_created_idx" ON "audit_log" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_unique_idx" ON "channels" USING btree ("business_id","type","identifier");--> statement-breakpoint
CREATE INDEX "conversations_business_state_idx" ON "conversations" USING btree ("business_id","state");--> statement-breakpoint
CREATE INDEX "conversations_customer_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_business_idx" ON "customers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "customers_channel_idx" ON "customers" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "escalations_business_resolved_idx" ON "escalations" USING btree ("business_id","resolved_at");--> statement-breakpoint
CREATE INDEX "escalations_assigned_idx" ON "escalations" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_business_idx" ON "knowledge_base" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_meta_id_idx" ON "messages" USING btree ("meta_message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_user_endpoint_idx" ON "push_subscriptions" USING btree ("user_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_business_idx" ON "users" USING btree ("business_id");