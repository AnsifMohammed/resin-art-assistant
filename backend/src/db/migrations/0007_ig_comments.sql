CREATE TYPE "public"."ig_comment_action" AS ENUM('pending', 'replied_public', 'dm_sent', 'replied_both', 'skipped', 'needs_attention', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ig_comment_category" AS ENUM('price', 'custom_order', 'availability', 'compliment', 'question', 'complaint', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."ig_reply_mode" AS ENUM('none', 'public', 'dm', 'both');--> statement-breakpoint
CREATE TABLE "ig_comment_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_mode" "ig_reply_mode" DEFAULT 'both' NOT NULL,
	"public_reply_text" text,
	"dm_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"meta_comment_id" text NOT NULL,
	"parent_comment_id" text,
	"media_id" text NOT NULL,
	"media_type" text,
	"media_permalink" text,
	"media_thumbnail_url" text,
	"media_caption" text,
	"commenter_ig_id" text NOT NULL,
	"commenter_username" text,
	"text" text NOT NULL,
	"commented_at" timestamp NOT NULL,
	"category" "ig_comment_category",
	"matched_rule_id" text,
	"matched_by" text,
	"action" "ig_comment_action" DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"public_reply_id" text,
	"public_reply_text" text,
	"dm_message_id" text,
	"dm_text" text,
	"customer_id" text,
	"conversation_id" text,
	"error" text,
	"handled_by_user_id" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ig_comment_rules_business_active_priority_idx" ON "ig_comment_rules" USING btree ("business_id","is_active","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_comments_business_meta_comment_idx" ON "ig_comments" USING btree ("business_id","meta_comment_id");--> statement-breakpoint
CREATE INDEX "ig_comments_business_action_created_idx" ON "ig_comments" USING btree ("business_id","action","created_at");--> statement-breakpoint
CREATE INDEX "ig_comments_business_media_idx" ON "ig_comments" USING btree ("business_id","media_id");--> statement-breakpoint
CREATE INDEX "ig_comments_business_commenter_media_idx" ON "ig_comments" USING btree ("business_id","commenter_ig_id","media_id");