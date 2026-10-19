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

export const orderStatusEnum = pgEnum("order_status", [
  "pending", "confirmed", "in_production", "ready",
  "dispatched", "delivered", "cancelled"
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("customers_business_idx").on(t.businessId),
  index("customers_channel_idx").on(t.channelId),
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("conversations_business_state_idx").on(t.businessId, t.state),
  index("conversations_customer_idx").on(t.customerId),
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

// Customer orders
export const orders = pgTable("orders", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  businessId: businessId(),
  customerId: text("customer_id"),
  orderNo: text("order_no").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  status: orderStatusEnum("status").notNull().default("pending"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  deliveryCharge: numeric("delivery_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("INR"),
  shippingAddress: text("shipping_address"),
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

