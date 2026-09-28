import type {
  ConversationDetailResponse,
  ConversationListParams,
  ConversationListResponse,
  ReplyResponse,
  ResolveResponse,
} from "../types/index.ts";
import { api } from "./client.ts";

const enc = encodeURIComponent;

/** GET /conversations (admin only) */
export const listConversations = (params: ConversationListParams = {}, signal?: AbortSignal) =>
  api.get<ConversationListResponse>("/conversations", params, signal);

/** GET /conversations/:id (admin: any; staff: only with an open escalation assigned to them or unassigned) */
export const getConversation = (id: string, signal?: AbortSignal) =>
  api.get<ConversationDetailResponse>(`/conversations/${enc(id)}`, undefined, signal);

/** POST /conversations/:id/reply */
export const replyToConversation = (id: string, text: string) =>
  api.post<ReplyResponse>(`/conversations/${enc(id)}/reply`, { text });

/** POST /conversations/:id/resolve — returns the conversation to ai_active */
export const resolveConversation = (id: string) =>
  api.post<ResolveResponse>(`/conversations/${enc(id)}/resolve`);
