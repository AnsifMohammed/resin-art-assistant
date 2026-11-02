import type {
  AnalyticsParams,
  AudienceParams,
  AuditLogParams,
  BroadcastListParams,
  ConversationListParams,
  CustomerListParams,
  EscalationListParams,
  TemplateListParams,
} from "../types/index.ts";

/**
 * Central query-key factory. Keys are hierarchical so invalidating a prefix
 * (e.g. queryKeys.conversations.all) also refreshes lists and details.
 */
export const queryKeys = {
  me: ["auth", "me"] as const,
  conversations: {
    all: ["conversations"] as const,
    lists: () => [...queryKeys.conversations.all, "list"] as const,
    list: (params: ConversationListParams) => [...queryKeys.conversations.lists(), params] as const,
    details: () => [...queryKeys.conversations.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.conversations.details(), id] as const,
    orders: (id: string) => [...queryKeys.conversations.all, "orders", id] as const,
  },
  escalations: {
    all: ["escalations"] as const,
    list: (params: EscalationListParams) => [...queryKeys.escalations.all, "list", params] as const,
  },
  users: {
    all: ["users"] as const,
  },
  templates: {
    all: ["templates"] as const,
    lists: () => [...queryKeys.templates.all, "list"] as const,
    list: (params: TemplateListParams) => [...queryKeys.templates.lists(), params] as const,
    detail: (id: string) => [...queryKeys.templates.all, "detail", id] as const,
  },
  settings: {
    all: ["settings"] as const,
  },
  knowledgeBase: {
    all: ["knowledge-base"] as const,
  },
  products: {
    all: ["products"] as const,
    list: (active?: string) => [...queryKeys.products.all, "list", active ?? "active"] as const,
    detail: (id: string) => [...queryKeys.products.all, "detail", id] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    range: (params: AnalyticsParams) => [...queryKeys.analytics.all, params] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (params?: { status?: string | undefined; search?: string | undefined }) =>
      [...queryKeys.orders.all, "list", params] as const,
    detail: (id: string) => [...queryKeys.orders.all, "detail", id] as const,
  },
  customers: {
    all: ["customers"] as const,
    lists: () => [...queryKeys.customers.all, "list"] as const,
    list: (params: CustomerListParams) => [...queryKeys.customers.lists(), params] as const,
    /** Infinite list (pages of CustomerListResponse). Lives under lists() so list invalidation/patching covers it. */
    infinite: (params: CustomerListParams) => [...queryKeys.customers.lists(), "infinite", params] as const,
    details: () => [...queryKeys.customers.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.customers.details(), id] as const,
    orders: (id: string) => [...queryKeys.customers.all, "orders", id] as const,
  },
  broadcasts: {
    all: ["broadcasts"] as const,
    lists: () => [...queryKeys.broadcasts.all, "list"] as const,
    list: (params: BroadcastListParams) => [...queryKeys.broadcasts.lists(), params] as const,
    details: () => [...queryKeys.broadcasts.all, "detail"] as const,
    detail: (id: string, params: { page?: number; limit?: number } = {}) =>
      [...queryKeys.broadcasts.details(), id, params] as const,
    audienceAll: () => [...queryKeys.broadcasts.all, "audience"] as const,
    audience: (params: AudienceParams) => [...queryKeys.broadcasts.audienceAll(), params] as const,
  },
  auditLog: {
    all: ["audit-log"] as const,
    list: (params: AuditLogParams) => [...queryKeys.auditLog.all, params] as const,
  },
  payments: {
    all: ["payments"] as const,
    byOrder: (orderId: string) => [...queryKeys.payments.all, "order", orderId] as const,
  },
  igComments: {
    all: ["igComments"] as const,
    lists: () => [...queryKeys.igComments.all, "list"] as const,
    list: (params?: unknown) => [...queryKeys.igComments.lists(), params] as const,
    stats: () => [...queryKeys.igComments.all, "stats"] as const,
    details: () => [...queryKeys.igComments.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.igComments.details(), id] as const,
    rules: () => [...queryKeys.igComments.all, "rules"] as const,
    media: () => [...queryKeys.igComments.all, "media"] as const,
    mediaSummary: () => [...queryKeys.igComments.all, "mediaSummary"] as const,
    settings: () => [...queryKeys.igComments.all, "settings"] as const,
  },
};

