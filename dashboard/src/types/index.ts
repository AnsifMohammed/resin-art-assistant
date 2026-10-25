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
  | "off_topic"
  | "greeting";

export type LanguageDetected = "english" | "malayalam" | "manglish";

export type ActorType = "admin" | "staff" | "ai" | "system";

export const TEMPLATE_CATEGORIES = ["delivery", "festive", "custom_order", "payment", "general"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CHANNELS = ["whatsapp", "instagram", "both"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const META_TEMPLATE_STATUSES = ["not_submitted", "pending", "approved", "rejected"] as const;
export type MetaTemplateStatus = (typeof META_TEMPLATE_STATUSES)[number];

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
  city?: string | null;
  isFavourite?: boolean;
  isPriority?: boolean;
  optedOut?: boolean;
  optedOutAt?: ISODateString | null;
  optOutSource?: "keyword" | "admin" | null;
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
  /** Set on every stored message (customer, AI, human reply, echo). */
  lastMessageAt: ISODateString | null;
  /** Last time an admin opened the thread (POST /conversations/:id/read). */
  adminLastReadAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Summary of the AI decision linked to the last customer message of a batch (admin only). */
export interface AiDecisionSummary {
  intent: AiIntent | string;
  escalate: boolean;
  escalateReason: EscalationReason | string | null;
  factsUsed: string[];
  missingFacts: string[];
  languageDetected: LanguageDetected | string | null;
  suggestedTag: ConvTag | string | null;
  sent: boolean;
  createdAt: ISODateString;
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
  /** Admin only: present on inbound customer messages the AI decided on. */
  aiDecision?: AiDecisionSummary;
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

export interface MessageTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  body: string;
  /** Computed server-side from body: unique {variable} names, first-seen order. */
  variables: string[];
  isActive: boolean;
  /** Approved WhatsApp template name (lowercase_underscore). Needed to message after 24h. */
  metaTemplateName: string | null;
  metaStatus: MetaTemplateStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
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
  /** Case-insensitive substring of customer name, handle/phone or last message (max 100). */
  search?: string;
  /** "true" = unread only. */
  unread?: "true" | "false";
}

export interface ConversationListItem extends Conversation {
  customer: CustomerRef;
  channelType: ChannelType;
  lastMessage: MessagePreview | null;
  /** Open (unresolved) escalation, if any. */
  openEscalation: Pick<Escalation, "id" | "reason" | "assignedToUserId" | "createdAt"> | null;
  /** Customer wrote after the admin last opened the thread. */
  unread: boolean;
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

/** Body is exactly one of { text } or { templateId, variables? }. */
export type ReplyRequest =
  | { text: string }
  | { templateId: string; variables?: Record<string, string> };

export interface ReplyResponse {
  message: Message;
  conversation: Pick<Conversation, "id" | "state">;
}

export interface ConversationStateResponse {
  conversation: Pick<Conversation, "id" | "state" | "tag">;
}

export interface ResolveResponse {
  conversation: Pick<Conversation, "id" | "state">;
  escalation: Escalation | null;
}

export interface ConversationOrderItem {
  productName: string;
  quantity: number;
}

export interface ConversationOrder {
  id: string;
  orderNo: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: ISODateString;
  expectedDeliveryDate: string | null;
  items: ConversationOrderItem[];
}

export interface ConversationOrdersResponse {
  orders: ConversationOrder[];
}

// ─── Message templates ─────────────────────────────────────────────

export interface TemplateListParams {
  category?: TemplateCategory;
  /** whatsapp | instagram → that channel's templates plus "both". */
  channel?: ChannelType;
  /** Default "all". Staff always get active only. */
  active?: "true" | "false" | "all";
}

export interface TemplateListResponse {
  templates: MessageTemplate[];
}

export interface TemplateResponse {
  template: MessageTemplate;
}

export interface CreateTemplateRequest {
  name: string;
  category: TemplateCategory;
  channel?: TemplateChannel;
  body: string;
  isActive?: boolean;
  metaTemplateName?: string | null;
  metaStatus?: MetaTemplateStatus;
}

export type UpdateTemplateRequest = Partial<CreateTemplateRequest>;

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

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BusinessHoursSettings {
  enabled: boolean;
  /** "HH:mm" (IST) */
  open: string;
  /** "HH:mm" (IST) */
  close: string;
  days: Weekday[];
}

export interface AwayMessageSettings {
  enabled: boolean;
  text: string;
}

export type WindowAlertThresholdMinutes = 60 | 120 | 240;

export interface WindowAlertSettings {
  enabled: boolean;
  thresholdMinutes: WindowAlertThresholdMinutes;
  target: "push" | "whatsapp";
}

export interface SettingsResponse {
  paused: boolean;
  channels: ChannelStatus[];
  /** Optional so the page still renders against an older backend. */
  businessHours?: BusinessHoursSettings;
  awayMessage?: AwayMessageSettings;
  windowAlerts?: WindowAlertSettings;
}

/** PATCH /settings (partial) → full SettingsResponse. */
export interface SettingsPatchRequest {
  businessHours?: BusinessHoursSettings;
  awayMessage?: AwayMessageSettings;
  windowAlerts?: WindowAlertSettings;
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
    bulk_discount_qty?: number;
    bulk_discount_percent?: number;
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
  from?: ISODateString | undefined;
  to?: ISODateString | undefined;
  channel?: "whatsapp" | "instagram" | undefined;
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
  /** 0..1 = autoReplies / (autoReplies + escalations). */
  autoReplyRate: number;
  /** 0..1 = escalations / (autoReplies + escalations). */
  escalationRate: number;
  /** Mean seconds from escalation created to resolved. null if nothing was resolved in range. */
  avgResponseTimeSeconds: number | null;
  byChannel?: Record<ChannelType, { inbound: number; outbound: number }>;
  byReason?: Partial<Record<EscalationReason, number>>;

  /* Extended fields. Optional so the page shows empty states against an older backend. */
  /** Every day in range, zero-filled, date = "YYYY-MM-DD" (IST). */
  messagesDaily?: AnalyticsDailyMessages[];
  revenue?: {
    total: number;
    previous: number;
    /** Every day in range, zero-filled, date = "YYYY-MM-DD" (IST). */
    daily: AnalyticsDailyRevenue[];
  };
  orders?: {
    total?: number;
    previousTotal?: number;
    confirmed: number;
    previousConfirmed: number;
    pending: number;
  };
  channels?: Record<ChannelType, AnalyticsChannelStats>;
  /** All products sold in range, revenue desc. */
  topProducts?: AnalyticsTopProduct[];
  attention?: AnalyticsAttention;
  trends?: Partial<Record<AnalyticsTrendKey, AnalyticsTrend>>;
  repliesBySender?: Record<"ai" | "owner" | "staff" | "system", number>;
  delivery?: { failed: number; read: number };
}

export interface AnalyticsDailyMessages {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AnalyticsDailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface AnalyticsChannelStats {
  messages: number;
  revenue: number;
  orders: number;
}

export interface AnalyticsTopProduct {
  productId: string | null;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
}

export interface AnalyticsAttention {
  openEscalations: number;
  oldestOpenEscalationAt?: ISODateString | null;
  windowsClosingSoon: number;
  pendingOrders: number;
  unpaidBalance: number;
}

export type AnalyticsTrendKey = "revenue" | "orders" | "messages" | "autoReplyRate" | "avgResponseTimeSeconds";

export interface AnalyticsTrend {
  current: number;
  previous: number;
  /** null when the previous period is 0 (no meaningful % change). */
  changePct: number | null;
}

// ─── Audit log (admin only) ────────────────────────────────────────

export interface AuditLogParams extends PageParams {
  actorId?: string | undefined;
  action?: string | undefined;
  actorType?: ActorType | undefined;
  /** Matches actions starting with this prefix, e.g. "order_". */
  actionPrefix?: string | undefined;
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
  /**
   * "queued" = new job, "batched" = merged into a pending job, "inline" = in-process fallback,
   * "skipped" = STOP/START keyword (see optAction); the AI was not queued.
   */
  queued: "queued" | "batched" | "inline" | "skipped";
  optAction?: "opt_out" | "opt_in" | null;
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

/** Admin only: a customer's profile/flags/opt-out changed (PATCH /customers/:id, STOP/START keyword). */
export interface CustomerUpdatedEvent {
  customerId: string;
}

/** Admin only: a broadcast changed status or made sending/receipt progress. */
export interface BroadcastUpdatedEvent {
  broadcastId: string;
  status: BroadcastStatus;
  stats: BroadcastStats;
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
  "customer:updated": CustomerUpdatedEvent;
  "broadcast:updated": BroadcastUpdatedEvent;
  subscribed: SubscribedEvent;
  "subscription:denied": SubscriptionDeniedEvent;
  "subscription:revoked": SubscriptionRevokedEvent;
  [key: `escalation:assigned:${string}`]: EscalationAssignedEvent;
  [key: `message:new:${string}`]: MessageNewEvent;
}

export type SocketEventName = keyof SocketEventMap;

// ─── Products ────────────────────────────────────────────────────────

export interface ProductSize {
  name: string;
  price: number;
}

export interface Product {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  description: string | null;
  sizes: ProductSize[];
  leadTimeDays: number;
  customizable: boolean;
  customOptions: string[];
  images: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ProductsResponse {
  products: Product[];
}

export interface ProductResponse {
  product: Product;
}

export interface CreateProductRequest {
  name: string;
  slug?: string;
  description?: string | null;
  sizes: ProductSize[];
  leadTimeDays?: number;
  customizable?: boolean;
  customOptions?: string[];
  images?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateProductRequest {
  name?: string;
  slug?: string;
  description?: string | null;
  sizes?: ProductSize[];
  leadTimeDays?: number;
  customizable?: boolean;
  customOptions?: string[];
  images?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface UploadSignatureResponse {
  configured: boolean;
  cloudName?: string;
  apiKey?: string | null;
  timestamp?: number;
  folder?: string;
  signature?: string;
  uploadPreset?: string | null;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentKind = "advance" | "balance" | "other";
export type PaymentStatus = "pending" | "paid" | "void";

export interface Payment {
  id: string;
  businessId: string;
  orderId: string;
  kind: PaymentKind;
  amount: number;
  status: PaymentStatus;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  paidAt?: ISODateString | null;
  recordedByUserId?: string | null;
  voidedReason?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PaymentSummary {
  orderTotal: number;
  totalPaid: number;
  totalPending: number;
  totalVoid?: number;
  balanceDue: number;
  paymentState: "fully_paid" | "partially_paid" | "unpaid";
}

export interface OrderPaymentsResponse {
  payments: Payment[];
  summary: PaymentSummary;
}

export interface RecordPaymentRequest {
  kind: PaymentKind;
  amount: number;
  method?: string;
  reference?: string | null;
  note?: string | null;
  markPaidImmediately?: boolean;
}

export interface MarkPaidRequest {
  method?: string;
  reference?: string | null;
}

export interface VoidPaymentRequest {
  reason: string;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "ready",
  "dispatched",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface DbOrderItem {
  id: string;
  orderId: string;
  productId?: string | null;
  productName: string;
  productDescription?: string | null;
  quantity: number;
  unitPrice: string | number;
  lineTotal?: string | number;
  customizations?: Record<string, unknown>;
  createdAt: ISODateString;
}

export interface DbOrder {
  id: string;
  businessId: string;
  customerId?: string | null;
  orderNo: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  channel: "whatsapp" | "instagram";
  status: OrderStatus;
  subtotal: string | number;
  deliveryCharge: string | number;
  discountAmount: string | number;
  totalAmount: string | number;
  currency: string;
  shippingAddress?: string | null;
  courier?: string | null;
  trackingId?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  expectedDeliveryDate?: string | null;
  dispatchedAt?: ISODateString | null;
  deliveredAt?: ISODateString | null;
  isDeleted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  items: DbOrderItem[];
}

export interface OrderListResponse {
  orders: DbOrder[];
  statusCounts: {
    all: number;
    pending: number;
    confirmed: number;
    in_production: number;
    ready: number;
    dispatched: number;
    delivered: number;
    cancelled: number;
  };
  total: number;
}

export interface OrderResponse {
  ok: boolean;
  order: DbOrder;
}

export interface CreateOrderItemInput {
  productId?: string | null | undefined;
  productName: string;
  productDescription?: string | null | undefined;
  quantity: number;
  unitPrice: number;
  customizations?: Record<string, unknown> | undefined;
}

export interface CreateOrderRequest {
  orderNo?: string | undefined;
  customerName: string;
  customerPhone?: string | null | undefined;
  customerEmail?: string | null | undefined;
  customerId?: string | null | undefined;
  channel?: "whatsapp" | "instagram" | undefined;
  status?: OrderStatus | undefined;
  shippingAddress?: string | null | undefined;
  courier?: string | null | undefined;
  trackingId?: string | null | undefined;
  expectedDeliveryDate?: string | null | undefined;
  customerNotes?: string | null | undefined;
  internalNotes?: string | null | undefined;
  deliveryCharge?: number | undefined;
  discountAmount?: number | undefined;
  items: CreateOrderItemInput[];
}

export interface UpdateOrderRequest {
  customerName?: string | undefined;
  customerPhone?: string | null | undefined;
  customerEmail?: string | null | undefined;
  channel?: "whatsapp" | "instagram" | undefined;
  status?: OrderStatus | undefined;
  shippingAddress?: string | null | undefined;
  courier?: string | null | undefined;
  trackingId?: string | null | undefined;
  expectedDeliveryDate?: string | null | undefined;
  customerNotes?: string | null | undefined;
  internalNotes?: string | null | undefined;
  deliveryCharge?: number | undefined;
  discountAmount?: number | undefined;
  items?: CreateOrderItemInput[] | undefined;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  trackingId?: string | null | undefined;
  courier?: string | null | undefined;
  sendNotification?: boolean | undefined;
}

// ─── Customers (admin only) ──────────────────────────────────────────────────

/** Mirrors backend/src/lib/segments.ts. "all" is not a membership segment. */
export const CUSTOMER_SEGMENTS = [
  "favourites",
  "priority",
  "previous_buyers",
  "repeat_buyers",
  "new",
  "never_ordered",
  "inactive",
] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const SEGMENTS = ["all", ...CUSTOMER_SEGMENTS] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  all: "All",
  favourites: "Favourites",
  priority: "Priority",
  previous_buyers: "Previous buyers",
  repeat_buyers: "Repeat buyers",
  new: "New",
  never_ordered: "Never ordered",
  inactive: "Inactive",
};

export const CUSTOMER_SORTS = ["recent", "spend", "orders", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface CustomerListItem {
  id: string;
  name: string | null;
  handleOrPhone: string;
  channel: ChannelType;
  city: string | null;
  language: string | null;
  notes: string | null;
  isFavourite: boolean;
  isPriority: boolean;
  optedOut: boolean;
  optedOutAt: ISODateString | null;
  createdAt: ISODateString;
  /** Latest conversation (by lastMessageAt, then createdAt). */
  conversationId: string | null;
  conversationState: ConvState | null;
  lastMessageAt: ISODateString | null;
  ordersCount: number;
  /** Rupees. */
  totalSpend: number;
  lastOrderAt: ISODateString | null;
  segments: CustomerSegment[];
}

export interface CustomerListParams extends PageParams {
  segment?: Segment;
  search?: string;
  city?: string;
  language?: string;
  channel?: ChannelType;
  sort?: CustomerSort;
}

export interface CustomerListResponse {
  customers: CustomerListItem[];
  pagination: Pagination;
  /** Per segment for the whole business (search/city/language/channel not applied). */
  counts: Record<Segment, number>;
}

export interface CustomerResponse {
  customer: CustomerListItem;
}

export interface UpdateCustomerRequest {
  name?: string | null;
  city?: string | null;
  notes?: string | null;
  isFavourite?: boolean;
  isPriority?: boolean;
  optedOut?: boolean;
}

export interface CustomerOrderSummary {
  id: string;
  orderNo: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: ISODateString;
  itemsCount: number;
}

export interface CustomerOrdersResponse {
  orders: CustomerOrderSummary[];
}

// ─── Broadcasts (admin only) ─────────────────────────────────────────────────

export const BROADCAST_STATUSES = ["draft", "scheduled", "sending", "sent", "cancelled", "failed"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const BROADCAST_RECIPIENT_STATUSES = ["pending", "sent", "delivered", "read", "failed"] as const;
export type BroadcastRecipientStatus = (typeof BROADCAST_RECIPIENT_STATUSES)[number];

export type BroadcastAction = "draft" | "schedule" | "send_now";

export interface BroadcastFilters {
  city?: string;
  language?: string;
  excludeComplaints?: boolean;
}

/** Recipient counts by status. */
export interface BroadcastStats {
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export interface BroadcastSummary {
  id: string;
  name: string;
  templateId: string;
  templateName: string | null;
  segment: Segment;
  filters: BroadcastFilters;
  variables: Record<string, string>;
  status: BroadcastStatus;
  scheduledAt: ISODateString | null;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  /** Audience snapshot size (0 until sending starts). */
  recipientCount: number;
  error: string | null;
  stats: BroadcastStats;
  createdAt: ISODateString;
  createdByUserId: string | null;
}

export interface BroadcastRecipient {
  id: string;
  customerId: string;
  customerName: string | null;
  phone: string;
  status: BroadcastRecipientStatus;
  error: string | null;
  sentAt: ISODateString | null;
  deliveredAt: ISODateString | null;
  readAt: ISODateString | null;
}

export interface BroadcastListParams extends PageParams {
  status?: BroadcastStatus;
}

export interface BroadcastListResponse {
  broadcasts: BroadcastSummary[];
  pagination: Pagination;
}

export interface BroadcastDetailResponse {
  broadcast: BroadcastSummary;
  recipients: BroadcastRecipient[];
  pagination: Pagination;
}

export interface BroadcastResponse {
  broadcast: BroadcastSummary;
}

export interface AudienceParams {
  segment?: Segment;
  city?: string;
  language?: string;
  excludeComplaints?: boolean;
}

export interface AudienceResponse {
  count: number;
  /** BROADCAST_MAX_RECIPIENTS */
  max: number;
}

export interface CreateBroadcastRequest {
  name: string;
  templateId: string;
  segment: Segment;
  filters?: BroadcastFilters;
  variables?: Record<string, string>;
  /** ISO with offset. Required (≥ now + 1 min) for action "schedule". */
  scheduledAt?: string | null;
  action: BroadcastAction;
}

export interface UpdateBroadcastRequest {
  name?: string;
  templateId?: string;
  segment?: Segment;
  filters?: BroadcastFilters;
  variables?: Record<string, string>;
  scheduledAt?: string | null;
  action?: "schedule" | "send_now";
}
