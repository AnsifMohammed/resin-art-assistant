import type {
  AnalyticsParams,
  AuditLogParams,
  ConversationListParams,
  EscalationListParams,
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
  },
  escalations: {
    all: ["escalations"] as const,
    list: (params: EscalationListParams) => [...queryKeys.escalations.all, "list", params] as const,
  },
  users: {
    all: ["users"] as const,
  },
  settings: {
    all: ["settings"] as const,
  },
  knowledgeBase: {
    all: ["knowledge-base"] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    range: (params: AnalyticsParams) => [...queryKeys.analytics.all, params] as const,
  },
  auditLog: {
    all: ["audit-log"] as const,
    list: (params: AuditLogParams) => [...queryKeys.auditLog.all, params] as const,
  },
};
