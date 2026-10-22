import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  getAudienceCount,
  getBroadcast,
  listBroadcasts,
  updateBroadcast,
} from "../api/broadcasts.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  AudienceParams,
  BroadcastListParams,
  CreateBroadcastRequest,
  UpdateBroadcastRequest,
} from "../types/index.ts";
import { useDebounced } from "./useDebounced.ts";

const AUDIENCE_DEBOUNCE_MS = 300;

/** Admin only: GET /broadcasts (newest first). */
export function useBroadcasts(params: BroadcastListParams = {}) {
  return useQuery({
    queryKey: queryKeys.broadcasts.list(params),
    queryFn: ({ signal }) => listBroadcasts(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Admin only: GET /broadcasts/:id with a page of recipients. Pass null to skip. */
export function useBroadcast(id: string | null | undefined, params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.broadcasts.detail(id ?? "", params),
    queryFn: ({ signal }) => getBroadcast(id as string, params, signal),
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });
}

/** Strip empty values so equal audiences share one cache key. */
function normalizeAudience(params: AudienceParams): AudienceParams {
  const out: AudienceParams = { segment: params.segment ?? "all" };
  const city = params.city?.trim();
  const language = params.language?.trim();
  if (city) out.city = city;
  if (language) out.language = language;
  if (params.excludeComplaints) out.excludeComplaints = true;
  return out;
}

/** Admin only: GET /broadcasts/audience, debounced (300 ms) and keyed by the normalized params. */
export function useAudienceCount(params: AudienceParams, opts: { enabled?: boolean } = {}) {
  const normalized = normalizeAudience(params);
  const debounced = useDebounced(JSON.stringify(normalized), AUDIENCE_DEBOUNCE_MS);
  const key = JSON.parse(debounced) as AudienceParams;
  const query = useQuery({
    queryKey: queryKeys.broadcasts.audience(key),
    queryFn: ({ signal }) => getAudienceCount(key, signal),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
  /** True while the inputs changed but the debounced request has not caught up yet. */
  const settling = debounced !== JSON.stringify(normalized);
  return Object.assign(query, { settling });
}

/** Admin only: POST /broadcasts. */
export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBroadcastRequest) => createBroadcast(body),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.broadcasts.all }),
  });
}

/** Admin only: PATCH /broadcasts/:id. */
export function useUpdateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBroadcastRequest }) => updateBroadcast(id, body),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.broadcasts.all }),
  });
}

/** Admin only: POST /broadcasts/:id/cancel. */
export function useCancelBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBroadcast(id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.broadcasts.all }),
  });
}

/** Admin only: DELETE /broadcasts/:id (drafts only). */
export function useDeleteBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBroadcast(id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.broadcasts.all }),
  });
}
