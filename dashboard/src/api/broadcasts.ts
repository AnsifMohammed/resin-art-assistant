import type {
  AudienceParams,
  AudienceResponse,
  BroadcastDetailResponse,
  BroadcastListParams,
  BroadcastListResponse,
  BroadcastResponse,
  CreateBroadcastRequest,
  PageParams,
  UpdateBroadcastRequest,
} from "../types/index.ts";
import { api } from "./client.ts";

const enc = encodeURIComponent;

/** GET /broadcasts/audience → { count, max }. WhatsApp-only, opted-out always excluded. */
export const getAudienceCount = (params: AudienceParams = {}, signal?: AbortSignal) =>
  api.get<AudienceResponse>("/broadcasts/audience", params, signal);

/** GET /broadcasts — newest first. */
export const listBroadcasts = (params: BroadcastListParams = {}, signal?: AbortSignal) =>
  api.get<BroadcastListResponse>("/broadcasts", params, signal);

/** GET /broadcasts/:id — pages the recipients (default limit 50, max 200). */
export const getBroadcast = (id: string, params: PageParams = {}, signal?: AbortSignal) =>
  api.get<BroadcastDetailResponse>(`/broadcasts/${enc(id)}`, params, signal);

/**
 * POST /broadcasts → 201. Errors: 400 VALIDATION_ERROR (details), TEMPLATE_NOT_APPROVED,
 * TEMPLATE_VARIABLES_MISSING (details path = variable), EMPTY_AUDIENCE; 409 AUDIENCE_TOO_LARGE ({ count, max }).
 */
export const createBroadcast = (body: CreateBroadcastRequest) => api.post<BroadcastResponse>("/broadcasts", body);

/** PATCH /broadcasts/:id (draft | scheduled only, else 409 BROADCAST_LOCKED). */
export const updateBroadcast = (id: string, body: UpdateBroadcastRequest) =>
  api.patch<BroadcastResponse>(`/broadcasts/${enc(id)}`, body);

/** POST /broadcasts/:id/cancel (scheduled | sending). */
export const cancelBroadcast = (id: string) => api.post<BroadcastResponse>(`/broadcasts/${enc(id)}/cancel`);

/** DELETE /broadcasts/:id (drafts only) → 204. */
export const deleteBroadcast = (id: string) => api.delete<void>(`/broadcasts/${enc(id)}`);
