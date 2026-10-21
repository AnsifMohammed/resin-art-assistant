import type {
  ConversationDetailResponse,
  ConversationStateResponse,
  ConversationListParams,
  ConversationListResponse,
  ReplyRequest,
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

/** POST /conversations/:id/reply — body is { text } or { templateId, variables? } */
export const replyToConversation = (id: string, body: ReplyRequest) =>
  api.post<ReplyResponse>(`/conversations/${enc(id)}/reply`, body);

/** POST /conversations/:id/read (admin only) → 204 */
export const markConversationRead = (id: string) => api.post<void>(`/conversations/${enc(id)}/read`);

/** POST /conversations/:id/pause (admin only). 409 ESCALATION_OPEN when escalated. */
export const pauseConversation = (id: string) =>
  api.post<ConversationStateResponse>(`/conversations/${enc(id)}/pause`);

/** POST /conversations/:id/resume (admin only). 409 NOT_PAUSED. */
export const resumeConversation = (id: string) =>
  api.post<ConversationStateResponse>(`/conversations/${enc(id)}/resume`);

/** POST /conversations/:id/resolve — returns the conversation to ai_active */
export const resolveConversation = (id: string) =>
  api.post<ResolveResponse>(`/conversations/${enc(id)}/resolve`);
