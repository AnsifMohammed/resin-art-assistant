/**
 * Shared dashboard types.
 *
 * Entity shapes mirror backend/src/db/schema.ts (Drizzle returns camelCase keys).
 * Timestamps arrive over JSON as ISO-8601 strings.
 * Request/response envelopes are documented in docs/contracts.md (kept in sync with
 * backend/src/routes).
 */

export type ISODateString = string;

// ─── Enums (mirror pgEnum values in schema.ts) ───────────────────────────────

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const CHANNEL_TYPES = ["instagram", "whatsapp"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CONV_STATES = ["ai_active", "escalated", "owner_handling", "paused"] as const;
export type ConvState = (typeof CONV_STATES)[number];

export const CONV_TAGS = [
  "new_lead",
  "custom_order",
  "payment_pending",
  "order_confirmed",
  "follow_up",
] as const;
export type ConvTag = (typeof CONV_TAGS)[number];

export type Direction = "inbound" | "outbound";

export const SENDER_TYPES = ["customer", "ai", "owner", "staff", "system"] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export const ESCALATION_REASONS = [
  "intent_complaint",
  "intent_refund",
  "intent_unknown",
  "missing_facts",
  "always_escalate_phrase",
  "payment_claim",
  "unapproved_intent",
  "parse_error",
  "manual",
  "intent_off_topic",
  "intent_payment",
  "window_closed",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export type AiIntent =
  | "price"
  | "delivery"
  | "care"
  | "custom_order"
  | "payment"
  | "complaint"
  | "refund"
  | "unknown"
  | "off_topic";

export type LanguageDetected = "english" | "malayalam" | "manglish";

export type ActorType = "admin" | "staff" | "ai" | "system";

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Every backend error body: { error, code } (+ details on validation errors). */
export interface ApiErrorBody {
  error: string;
  code: string;
  details?: Array<{ path: string; message: string }>;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface PageParams {
  page?: number;
  limit?: number;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  ok: true;
  mode: "demo" | "live";
  timestamp: ISODateString;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/** JWT payload (backend/src/middleware/authenticate.ts). */
export interface JwtPayload {
  sub: string;
  businessId: string;
  role: Role;
  name: string;
}

/** The signed-in user (POST /auth/login and GET /auth/me both include email). */
export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  businessId: string;
  email?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser & { email: string };
}

export interface MeResponse {
  user: AuthUser & { email: string };
}

export interface OkResponse {
  ok: true;
}

// ─── Entities ────────────────────────────────────────────────────────────────

/** users row minus passwordHash (never exposed). */
export interface User {
  id: string;
  businessId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** channels row minus encryptedToken. */
export interface Channel {
  id: string;
  businessId: string;
  type: ChannelType;
  identifier: string;
  tokenExpiresAt: ISODateString | null;
  status: string; // "active" by default
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Customer {
  id: string;
  businessId: string;
  channelId: string;
  name: string | null;
  handleOrPhone: string;
  language: string | null;
  notes: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Conversation {
  id: string;
  businessId: string;
  customerId: string;
  channelId: string;
  state: ConvState;
  tag: ConvTag | null;
  lastCustomerMessageAt: ISODateString | null;
  windowClosesAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Message {
  id: string;
  conversationId: string;
  businessId: string;
  direction: Direction;
  senderType: SenderType;
  senderId: string | null;
  content: string | null;
  mediaUrls: string[];
  metaMessageId: string | null;
  deliveryStatus: DeliveryStatus | null;
  metadata: Record<string, unknown>;
  createdAt: ISODateString;
}

export interface AiDecisionRecord {
  id: string;
  messageId: string;
  conversationId: string;
  businessId: string;
  intent: AiIntent | string;
  replyDraft: string;
  factsUsed: string[];
  missingFacts: string[];
  escalate: boolean;
  escalateReason: EscalationReason | null;
  suggestedTag: ConvTag | null;
  languageDetected: LanguageDetected | null;
  sent: boolean;
  createdAt: ISODateString;
}

export interface Escalation {
  id: string;
  businessId: string;
  conversationId: string;
  reason: EscalationReason;
  assignedToUserId: string | null;
  assignedByUserId: string | null;
  assignedAt: ISODateString | null;
  alertedAt: ISODateString | null;
  remindedAt: ISODateString | null;
  resolvedAt: ISODateString | null;
  resolvedByUserId: string | null;
  createdAt: ISODateString;
}

export interface AuditLogEntry {
  id: string;
  businessId: string;
  actorId: string | null;
  actorType: ActorType;
  action: string; // e.g. "reply_sent", "escalation_assigned", "auto_reply_sent"
  conversationId: string | null;
  escalationId: string | null;
  targetUserId: string | null;
  details: Record<string, unknown>;
  createdAt: ISODateString;
  /** Joined from users for display; null for ai/system. */
  actorName?: string | null;
}

/** Small user reference used in joined responses. */
export interface UserRef {
  id: string;
  name: string;
}

export interface CustomerRef {
  id: string;
  name: string | null;
  handleOrPhone: string;
}

export interface MessagePreview {
  content: string | null;
  senderType: SenderType;
  createdAt: ISODateString;
}

// ─── Conversations ────────────────────────────────────────────────

export interface ConversationListParams extends PageParams {
  state?: ConvState;
  tag?: ConvTag;
  channel?: ChannelType;
}

export interface ConversationListItem extends Conversation {
  customer: CustomerRef;
  channelType: ChannelType;
  lastMessage: MessagePreview | null;
  /** Open (unresolved) escalation, if any. */
  openEscalation: Pick<Escalation, "id" | "reason" | "assignedToUserId" | "createdAt"> | null;
}

export interface ConversationListResponse {
  conversations: ConversationListItem[];
  pagination: Pagination;
}

export interface ConversationDetail extends Conversation {
  customer: Customer;
  channelType: ChannelType;
  /** Oldest first. */
  messages: Message[];
  openEscalation: (Escalation & { assignedTo: UserRef | null }) | null;
}

export interface ConversationDetailResponse {
  conversation: ConversationDetail;
}

export interface ReplyRequest {
  text: string;
}

export interface ReplyResponse {
  message: Message;
  conversation: Pick<Conversation, "id" | "state">;
}

export interface ResolveResponse {
  conversation: Pick<Conversation, "id" | "state">;
  escalation: Escalation | null;
}

// ─── Escalations ──────────────────────────────────────────────────

export interface EscalationListParams {
  /** Omitted = open only. Staff always get open only. */
  resolved?: boolean;
}

export interface EscalationListItem extends Escalation {
  assignedTo: UserRef | null;
  conversation: Pick<Conversation, "id" | "state" | "tag" | "windowClosesAt" | "lastCustomerMessageAt"> & {
    channelType: ChannelType;
    customer: CustomerRef;
    lastMessage: MessagePreview | null;
  };
}

export interface EscalationListResponse {
  escalations: EscalationListItem[];
}

export interface AssignRequest {
  /** Staff user id. null = unassign (back to the shared queue). */
  userId: string | null;
}

export interface AssignResponse {
  escalation: Escalation & { assignedTo: UserRef | null };
}

// ─── Users (admin only) ────────────────────────────────────────────

/** GET/POST/PATCH /users shape (never includes passwordHash). */
export type StaffUser = Pick<User, "id" | "name" | "email" | "role" | "active" | "lastLoginAt" | "createdAt">;

export interface UserListResponse {
  users: StaffUser[];
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  active: boolean;
}

export interface UserResponse {
  user: StaffUser;
}

// ─── Settings (admin only) ─────────────────────────────────────────

export type ChannelStatus = Pick<Channel, "id" | "type" | "identifier" | "status" | "tokenExpiresAt">;

export interface SettingsResponse {
  paused: boolean;
  channels: ChannelStatus[];
}

export interface PauseRequest {
  paused: boolean;
}

export interface PauseResponse {
  ok: true;
  paused: boolean;
}

// ─── Knowledge base (admin only) ───────────────────────────────────

export interface KbProduct {
  id: string;
  name: string;
  price: number;
  sizes?: string[];
  lead_time_days: number;
  customizable: boolean;
  custom_options?: string[];
}

export interface KbDeliveryZone {
  area: string;
  days?: string;
  charge?: number;
  available?: boolean;
}

export interface KbToneExample {
  customer: string;
  reply: string;
}

/** Shape of docs/knowledge-base.json (snake_case: stored verbatim in jsonb). */
export interface KnowledgeBaseData {
  business_name: string;
  products: KbProduct[];
  custom_orders: {
    note: string;
    lead_time_extra_days: number;
    items_not_in_catalogue: string;
  };
  delivery: {
    zones: KbDeliveryZone[];
    courier: string;
  };
  payment: {
    methods: string[];
    advance_percent: number;
    balance: string;
    upi_id: string;
  };
  policies: {
    returns: string;
    cancellation: string;
    care: string;
    warranty: string;
    [key: string]: string;
  };
  tone_examples: KbToneExample[];
  escalate_always: string[];
}

export interface KnowledgeBaseResponse {
  data: KnowledgeBaseData;
  updatedAt: ISODateString;
  updatedByUserId: string | null;
}

export interface KnowledgeBasePutRequest {
  data: KnowledgeBaseData;
}

// ─── Analytics (admin only) ────────────────────────────────────────

export interface AnalyticsParams {
  from?: ISODateString;
  to?: ISODateString;
}

export interface AnalyticsResponse {
  from: ISODateString;
  to: ISODateString;
  messages: {
    total: number;
    inbound: number;
    outbound: number;
  };
  autoReplies: number;
  escalations: number;
  /** 0..1 = autoReplies / processed inbound batches. */
  autoReplyRate: number;
  /** 0..1 = escalations / processed inbound batches. */
  escalationRate: number;
  /** Mean seconds from customer message to first outbound reply (AI or human). null if no data. */
  avgResponseTimeSeconds: number | null;
  /** Mean seconds from escalation created to first human reply. */
  avgHumanResponseTimeSeconds?: number | null;
  byChannel?: Record<ChannelType, { inbound: number; outbound: number }>;
  byReason?: Partial<Record<EscalationReason, number>>;
  daily?: Array<{ date: string; inbound: number; autoReplies: number; escalations: number }>;
}

// ─── Audit log (admin only) ────────────────────────────────────────

export interface AuditLogParams extends PageParams {
  actorId?: string;
  action?: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  pagination: Pagination;
}

// ─── Push ────────────────────────────────────────────────────────────────────

/** POST /push/subscribe body = PushSubscription.toJSON(). */
export interface PushSubscribeRequest {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

// ─── Simulate (exists, demo only) ────────────────────────────────────────────

export interface SimulateRequest {
  customerName: string;
  channel: ChannelType;
  text: string;
  imageUrl?: string;
}

/** 202 Accepted: the AI runs asynchronously after a 10s batching window. */
export interface SimulateResponse {
  ok: true;
  messageId: string | null;
  conversationId: string;
  state: ConvState;
  /** "queued" = new job, "batched" = merged into a pending job, "inline" = in-process fallback */
  queued: "queued" | "batched" | "inline";
  /** Always null now; the decision arrives later via realtime events / GET /conversations/:id. */
  decision: null;
}

// ─── Real-time events ─────────────────────────────────────────────

export interface ConversationUpdatedEvent {
  conversationId: string;
  state: ConvState;
  tag: ConvTag | null;
}

export interface EscalationNewEvent {
  escalationId: string;
  conversationId: string;
  reason: EscalationReason;
  customerName: string;
}

export interface EscalationAssignedEvent {
  escalationId: string;
  conversationId: string;
  assignedToUserId: string | null;
}

export interface MessageNewEvent {
  conversationId: string;
  message: Message;
}

/** Admin only: automation was paused/resumed (by this or another admin session). */
export interface SettingsUpdatedEvent {
  paused: boolean;
}

/** Server acknowledgement of a `message:new:<id>` subscribe frame. */
export interface SubscribedEvent {
  event: string;
}

/** A subscribe frame was refused (staff without access, or an unsubscribable event name). */
export interface SubscriptionDeniedEvent {
  event: string;
  reason: "forbidden" | "unknown_event";
}

/** Staff lost access to a conversation they were following (resolved or reassigned). */
export interface SubscriptionRevokedEvent {
  event: string;
  conversationId: string;
}

/**
 * Event name → payload. Dynamic names (`escalation:assigned:${userId}`,
 * `message:new:${conversationId}`) share the payload of their base event.
 */
export interface SocketEventMap {
  "conversation:updated": ConversationUpdatedEvent;
  "escalation:new": EscalationNewEvent;
  "escalation:assigned": EscalationAssignedEvent;
  "message:new": MessageNewEvent;
  "settings:updated": SettingsUpdatedEvent;
  subscribed: SubscribedEvent;
  "subscription:denied": SubscriptionDeniedEvent;
  "subscription:revoked": SubscriptionRevokedEvent;
  [key: `escalation:assigned:${string}`]: EscalationAssignedEvent;
  [key: `message:new:${string}`]: MessageNewEvent;
}

export type SocketEventName = keyof SocketEventMap;
