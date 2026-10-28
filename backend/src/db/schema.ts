import {
  pgTable, pgEnum, text, boolean,
  jsonb, timestamp, uniqueIndex, index,
  integer, numeric, date, check, unique, foreignKey
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

// Helpers
const now = () => new Date();
const id = () => text("id").primaryKey().$defaultFn(() => nanoid());
const businessId = () => text("business_id").notNull();
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () => timestamp("updated_at").notNull().defaultNow().$onUpdate(now);

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["admin", "staff"]);

export const channelTypeEnum = pgEnum("channel_type", ["instagram", "whatsapp"]);

export const convStateEnum = pgEnum("conv_state", [
  "ai_active", "escalated", "owner_handling", "paused"
]);

export const convTagEnum = pgEnum("conv_tag", [
  "new_lead", "custom_order", "payment_pending",
  "order_confirmed", "follow_up"
]);

export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);

export const senderTypeEnum = pgEnum("sender_type", [
  "customer", "ai", "owner", "staff", "system"
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued", "sent", "delivered", "read", "failed"
]);

export const escalationReasonEnum = pgEnum("escalation_reason", [
  "intent_complaint", "intent_refund", "intent_unknown",
  "missing_facts", "always_escalate_phrase",
  "payment_claim", "unapproved_intent", "parse_error", "manual",
  "intent_off_topic", "intent_payment", "window_closed"
]);

export const paymentKindEnum = pgEnum("payment_kind", ["advance", "balance", "other"]);

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "void"]);

export const templateCategoryEnum = pgEnum("template_category", [
  "delivery", "festive", "custom_order", "payment", "general"
]);

export const templateChannelEnum = pgEnum("template_channel", ["whatsapp", "instagram", "both"]);

export const metaTemplateStatusEnum = pgEnum("meta_template_status", [
  "not_submitted", "pending", "approved", "rejected"
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "confirmed", "in_production", "ready",
  "dispatched", "delivered", "cancelled"
]);

export const broadcastStatusEnum = pgEnum("broadcast_status", [
  "draft", "scheduled", "sending", "sent", "cancelled", "failed"
]);

export const broadcastSegmentEnum = pgEnum("broadcast_segment", [
  "all", "favourites", "priority", "previous_buyers",
  "repeat_buyers", "new", "never_ordered", "inactive"
]);

export const recipientStatusEnum = pgEnum("recipient_status", [
  "pending", "sent", "delivered", "read", "failed"
]);

export const igReplyModeEnum = pgEnum("ig_reply_mode", [
  "none", "public", "dm", "both"
]);

export const igCommentCategoryEnum = pgEnum("ig_comment_category", [
  "price", "custom_order", "availability", "compliment", "question", "complaint", "spam", "other"
]);

export const igCommentActionEnum = pgEnum("ig_comment_action", [
  "pending", "replied_public", "dm_sent", "replied_both", "skipped", "needs_attention", "failed"
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

// One row per business (SaaS-ready)
export const businesses = pgTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  metaConfig: jsonb("meta_config").default({}),
  settings: jsonb("settings").default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Admin and staff users
export const users = pgTable("users", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),       // argon2id hash
  role: roleEnum("role").notNull(),                    // "admin" | "staff"
  active: boolean("active").notNull().default(true),   // false = deactivated
  lastLoginAt: timestamp("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("users_email_idx").on(t.email),
  index("users_business_idx").on(t.businessId),
]);

// WhatsApp numbers and Instagram accounts connected to the business
export const channels = pgTable("channels", {
  id: id(),
  businessId: businessId(),
  type: channelTypeEnum("type").notNull(),
  identifier: text("identifier").notNull(),
  encryptedToken: text("encrypted_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("channels_unique_idx").on(t.businessId, t.type, t.identifier),
]);

// One customer per channel (same person on WA and IG = two customer rows)
export const customers = pgTable("customers", {
  id: id(),
  businessId: businessId(),
  channelId: text("channel_id").notNull(),
  name: text("name"),
  handleOrPhone: text("handle_or_phone").notNull(),
  language: text("language").default("english"),
  notes: text("notes"),
  city: text("city"),
  isFavourite: boolean("is_favourite").notNull().default(false),
  isPriority: boolean("is_priority").notNull().default(false),
  optedOut: boolean("opted_out").notNull().default(false),  // no broadcasts/offers
  optedOutAt: timestamp("opted_out_at"),
  optOutSource: text("opt_out_source"),                // "keyword" | "admin"
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("customers_business_idx").on(t.businessId),
  index("customers_channel_idx").on(t.channelId),
  index("customers_business_segment_idx").on(t.businessId, t.isFavourite, t.isPriority),
]);

// One conversation per customer (ongoing thread)
export const conversations = pgTable("conversations", {
  id: id(),
  businessId: businessId(),
  customerId: text("customer_id").notNull(),
  channelId: text("channel_id").notNull(),
  state: convStateEnum("state").notNull().default("ai_active"),
  tag: convTagEnum("tag"),
  lastCustomerMessageAt: timestamp("last_customer_message_at"),
  windowClosesAt: timestamp("window_closes_at"),       // 24h after lastCustomerMessageAt
  lastMessageAt: timestamp("last_message_at"),         // any direction; inbox sort key
  adminLastReadAt: timestamp("admin_last_read_at"),    // unread = customer message after this
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("conversations_business_state_idx").on(t.businessId, t.state),
  index("conversations_customer_idx").on(t.customerId),
  index("conversations_business_last_msg_idx").on(t.businessId, t.lastMessageAt),
]);

// Every message in every conversation
export const messages = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull(),
  businessId: businessId(),
  direction: directionEnum("direction").notNull(),
  senderType: senderTypeEnum("sender_type").notNull(),
  senderId: text("sender_id"),                         // user.id for staff/admin, null for AI
  content: text("content"),
  mediaUrls: jsonb("media_urls").default([]),          // stored copies, not Meta CDN
  metaMessageId: text("meta_message_id"),              // unique per channel
  deliveryStatus: deliveryStatusEnum("delivery_status").default("queued"),
  metadata: jsonb("metadata").default({}),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("messages_meta_id_idx").on(t.metaMessageId),
  index("messages_conversation_idx").on(t.conversationId),
]);

// AI decision for every processed message
export const aiDecisions = pgTable("ai_decisions", {
  id: id(),
  messageId: text("message_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  businessId: businessId(),
  intent: text("intent").notNull(),
  replyDraft: text("reply_draft").notNull(),
  factsUsed: jsonb("facts_used").default([]),
  missingFacts: jsonb("missing_facts").default([]),
  escalate: boolean("escalate").notNull(),
  escalateReason: escalationReasonEnum("escalate_reason"),
  suggestedTag: text("suggested_tag"),
  languageDetected: text("language_detected"),
  sent: boolean("sent").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  index("ai_decisions_conversation_idx").on(t.conversationId),
]);

// Open escalations waiting for a human
export const escalations = pgTable("escalations", {
  id: id(),
  businessId: businessId(),
  conversationId: text("conversation_id").notNull(),
  reason: escalationReasonEnum("reason").notNull(),
  assignedToUserId: text("assigned_to_user_id"),       // null = unassigned, any staff can pick up
  assignedByUserId: text("assigned_by_user_id"),       // admin who assigned it
  assignedAt: timestamp("assigned_at"),
  alertedAt: timestamp("alerted_at"),
  remindedAt: timestamp("reminded_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id"),       // who resolved it
  createdAt: createdAt(),
}, (t) => [
  index("escalations_business_resolved_idx").on(t.businessId, t.resolvedAt),
  index("escalations_assigned_idx").on(t.assignedToUserId),
  // At most one open escalation per conversation
  uniqueIndex("escalations_open_conversation_idx")
    .on(t.conversationId)
    .where(sql`${t.resolvedAt} IS NULL`),
]);

// Business knowledge base (products, policies, tone examples)
export const knowledgeBase = pgTable("knowledge_base", {
  id: id(),
  businessId: businessId(),
  data: jsonb("data").notNull(),
  updatedByUserId: text("updated_by_user_id"),         // admin who last edited
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("kb_business_idx").on(t.businessId),
]);

// Full audit trail of every action
export const auditLog = pgTable("audit_log", {
  id: id(),
  businessId: businessId(),
  actorId: text("actor_id"),                           // user.id, or null for system/AI
  actorType: text("actor_type").notNull(),             // "admin" | "staff" | "ai" | "system"
  action: text("action").notNull(),                    // e.g. "reply_sent", "escalation_assigned"
  conversationId: text("conversation_id"),
  escalationId: text("escalation_id"),
  targetUserId: text("target_user_id"),                // for user management actions
  details: jsonb("details").default({}),
  createdAt: createdAt(),
}, (t) => [
  index("audit_business_created_idx").on(t.businessId, t.createdAt),
  index("audit_actor_idx").on(t.actorId),
]);

// Web Push subscriptions (one per user per browser/device)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull(),
  businessId: businessId(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("push_user_endpoint_idx").on(t.userId, t.endpoint),
]);

// Products catalog
export const products = pgTable("products", {
  id: id(),
  businessId: businessId(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sizes: jsonb("sizes").$type<Array<{ name: string; price: number }>>().notNull().default([]),
  leadTimeDays: integer("lead_time_days").notNull().default(3),
  customizable: boolean("customizable").notNull().default(false),
  customOptions: jsonb("custom_options").$type<string[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("products_business_slug_idx").on(t.businessId, t.slug),
  index("products_business_active_idx").on(t.businessId, t.isActive),
]);

// Payments table (manually tracked per order)
export const payments = pgTable("payments", {
  id: id(),
  businessId: businessId(),
  orderId: text("order_id").notNull(),
  kind: paymentKindEnum("kind").notNull(),
  amount: integer("amount").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  method: text("method").default("UPI"),
  reference: text("reference"),
  note: text("note"),
  paidAt: timestamp("paid_at"),
  recordedByUserId: text("recorded_by_user_id"),
  voidedReason: text("voided_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("payments_order_idx").on(t.orderId),
  index("payments_revenue_idx").on(t.businessId, t.status, t.paidAt),
]);

// Ready-made messages admin/staff insert into replies. {variable} placeholders.
export const messageTemplates = pgTable("message_templates", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  category: templateCategoryEnum("category").notNull(),
  channel: templateChannelEnum("channel").notNull().default("both"),
  body: text("body").notNull(),
  variables: jsonb("variables").$type<string[]>().notNull().default([]),  // derived from body
  isActive: boolean("is_active").notNull().default(true),
  metaTemplateName: text("meta_template_name"),        // approved WhatsApp template name
  metaStatus: metaTemplateStatusEnum("meta_status").notNull().default("not_submitted"),
  createdByUserId: text("created_by_user_id"),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("templates_business_name_idx").on(t.businessId, t.name),
  index("templates_business_category_idx").on(t.businessId, t.category),
]);

// Customer orders
export const orders = pgTable("orders", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  businessId: businessId(),
  customerId: text("customer_id"),
  orderNo: text("order_no").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  channel: text("channel").notNull().default("whatsapp"),
  status: orderStatusEnum("status").notNull().default("pending"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  deliveryCharge: numeric("delivery_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("INR"),
  shippingAddress: text("shipping_address"),
  courier: text("courier"),
  trackingId: text("tracking_id"),
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),
  expectedDeliveryDate: date("expected_delivery_date"),
  dispatchedAt: timestamp("dispatched_at"),
  deliveredAt: timestamp("delivered_at"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("uq_orders_business_order_no").on(t.businessId, t.orderNo),
  foreignKey({
    name: "orders_customer_id_fkey",
    columns: [t.customerId],
    foreignColumns: [customers.id],
  }),
  foreignKey({
    name: "orders_business_id_fkey",
    columns: [t.businessId],
    foreignColumns: [businesses.id],
  }),
  check("orders_delivery_charge_check", sql`${t.deliveryCharge} >= (0)::numeric`),
  check("orders_discount_amount_check", sql`${t.discountAmount} >= (0)::numeric`),
  check("orders_subtotal_check", sql`${t.subtotal} >= (0)::numeric`),
  check("orders_total_amount_check", sql`${t.totalAmount} >= (0)::numeric`),
  index("idx_orders_business_status").on(t.businessId, t.status).where(sql`${t.isDeleted} = false`),
  index("idx_orders_created_at").on(t.createdAt.desc()).where(sql`${t.isDeleted} = false`),
  index("idx_orders_customer").on(t.customerId).where(sql`${t.isDeleted} = false`),
]);

// Items inside an order
export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  orderId: text("order_id").notNull(),
  productId: text("product_id"),
  productName: text("product_name").notNull(),
  productDescription: text("product_description"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 })
    .generatedAlwaysAs(sql`(((quantity)::numeric * unit_price))`),
  customizations: jsonb("customizations").notNull().default({}),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: text("deleted_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  foreignKey({
    name: "order_items_order_id_fkey",
    columns: [t.orderId],
    foreignColumns: [orders.id],
  }),
  check("order_items_quantity_check", sql`${t.quantity} > 0`),
  check("order_items_unit_price_check", sql`${t.unitPrice} >= (0)::numeric`),
  index("idx_order_items_order").on(t.orderId).where(sql`${t.isDeleted} = false`),
]);

export type BroadcastFilters = {
  city?: string;
  language?: string;
  excludeComplaints?: boolean;
};

// One-to-many WhatsApp template sends to a customer segment
export const broadcasts = pgTable("broadcasts", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  templateId: text("template_id").notNull(),
  segment: broadcastSegmentEnum("segment").notNull(),
  filters: jsonb("filters").$type<BroadcastFilters>().notNull().default({}),
  variables: jsonb("variables").$type<Record<string, string>>().notNull().default({}),
  status: broadcastStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  recipientCount: integer("recipient_count").notNull().default(0),
  error: text("error"),
  createdByUserId: text("created_by_user_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("broadcasts_business_status_idx").on(t.businessId, t.status, t.scheduledAt),
]);

// Audience snapshot of a broadcast: one row per customer, with delivery status
export const broadcastRecipients = pgTable("broadcast_recipients", {
  id: id(),
  businessId: businessId(),
  broadcastId: text("broadcast_id").notNull(),
  customerId: text("customer_id").notNull(),
  conversationId: text("conversation_id"),             // null = customer has no conversation
  messageId: text("message_id"),                       // outbound message row, when a conversation exists
  phone: text("phone").notNull(),
  status: recipientStatusEnum("status").notNull().default("pending"),
  metaMessageId: text("meta_message_id"),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("broadcast_recipients_unique_idx").on(t.broadcastId, t.customerId),
  index("broadcast_recipients_status_idx").on(t.broadcastId, t.status),
  index("broadcast_recipients_meta_id_idx").on(t.metaMessageId),
]);

// Instagram comment auto-reply rules
export const igCommentRules = pgTable("ig_comment_rules", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  mediaIds: jsonb("media_ids").$type<string[]>().notNull().default([]),
  replyMode: igReplyModeEnum("reply_mode").notNull().default("both"),
  publicReplyText: text("public_reply_text"),
  dmText: text("dm_text"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  createdByUserId: text("created_by_user_id"),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("ig_comment_rules_business_active_priority_idx").on(t.businessId, t.isActive, t.priority),
]);

// Instagram comments received via webhook or simulation
export const igComments = pgTable("ig_comments", {
  id: id(),
  businessId: businessId(),
  metaCommentId: text("meta_comment_id").notNull(),
  parentCommentId: text("parent_comment_id"),
  mediaId: text("media_id").notNull(),
  mediaType: text("media_type"),
  mediaPermalink: text("media_permalink"),
  mediaThumbnailUrl: text("media_thumbnail_url"),
  mediaCaption: text("media_caption"),
  commenterIgId: text("commenter_ig_id").notNull(),
  commenterUsername: text("commenter_username"),
  text: text("text").notNull(),
  commentedAt: timestamp("commented_at").notNull(),
  category: igCommentCategoryEnum("category"),
  matchedRuleId: text("matched_rule_id"),
  matchedBy: text("matched_by"),
  action: igCommentActionEnum("action").notNull().default("pending"),
  skipReason: text("skip_reason"),
  publicReplyId: text("public_reply_id"),
  publicReplyText: text("public_reply_text"),
  dmMessageId: text("dm_message_id"),
  dmText: text("dm_text"),
  customerId: text("customer_id"),
  conversationId: text("conversation_id"),
  error: text("error"),
  handledByUserId: text("handled_by_user_id"),
  processedAt: timestamp("processed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("ig_comments_business_meta_comment_idx").on(t.businessId, t.metaCommentId),
  index("ig_comments_business_action_created_idx").on(t.businessId, t.action, t.createdAt),
  index("ig_comments_business_media_idx").on(t.businessId, t.mediaId),
  index("ig_comments_business_commenter_media_idx").on(t.businessId, t.commenterIgId, t.mediaId),
]);

