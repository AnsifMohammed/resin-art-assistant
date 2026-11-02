import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createIgRule,
  deleteIgRule,
  dismissIgComment,
  getIgComment,
  getIgCommentStats,
  getIgMediaSummary,
  getIgSettings,
  listIgComments,
  listIgMedia,
  listIgRules,
  reorderIgRules,
  replyIgComment,
  simulateIgComment,
  testIgRule,
  updateIgRule,
  updateIgSettings,
  type FetchCommentsParams,
} from "../api/igComments.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { IgRule, IgSettings } from "../types/index.ts";
import { useDebounced } from "./useDebounced.ts";

/** GET /ig/comments with keepPreviousData for smooth pagination/filtering. */
export function useIgComments(params: FetchCommentsParams = {}) {
  return useQuery({
    queryKey: queryKeys.igComments.list(params),
    queryFn: ({ signal }) => listIgComments(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** GET /ig/comments/stats */
export function useIgCommentStats() {
  return useQuery({
    queryKey: queryKeys.igComments.stats(),
    queryFn: ({ signal }) => getIgCommentStats(signal),
  });
}

/** GET /ig/comments/:id */
export function useIgComment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.igComments.detail(id ?? ""),
    queryFn: ({ signal }) => getIgComment(id!, signal),
    select: (res) => res.comment,
    enabled: Boolean(id),
  });
}

/** GET /ig/rules */
export function useIgRules() {
  return useQuery({
    queryKey: queryKeys.igComments.rules(),
    queryFn: ({ signal }) => listIgRules(signal),
    select: (res) => res.rules,
  });
}

/** POST /ig/rules */
export function useCreateIgRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IgRule>) => createIgRule(body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.rules() });
    },
  });
}

/** PATCH /ig/rules/:id with optimistic update for toggling isActive. */
export function useUpdateIgRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<IgRule> }) => updateIgRule(id, body),
    onMutate: async ({ id, body }) => {
      if (body.isActive === undefined) return;
      await qc.cancelQueries({ queryKey: queryKeys.igComments.rules() });
      const previous = qc.getQueryData<{ rules: IgRule[] }>(queryKeys.igComments.rules());
      if (previous) {
        qc.setQueryData<{ rules: IgRule[] }>(queryKeys.igComments.rules(), {
          rules: previous.rules.map((r) => (r.id === id ? { ...r, ...body } : r)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.igComments.rules(), context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.rules() });
    },
  });
}

/** DELETE /ig/rules/:id */
export function useDeleteIgRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIgRule(id),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.rules() });
    },
  });
}

/** POST /ig/rules/reorder */
export function useReorderIgRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => reorderIgRules(ids),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.rules() });
    },
  });
}

/** POST /ig/rules/test with 400ms debounce */
export function useTestIgRule(text: string, mediaId?: string) {
  const debouncedText = useDebounced(text.trim(), 400);
  const debouncedMediaId = useDebounced(mediaId, 400);

  return useQuery({
    queryKey: [...queryKeys.igComments.all, "test", debouncedText, debouncedMediaId ?? ""],
    queryFn: () => testIgRule({ text: debouncedText, mediaId: debouncedMediaId || undefined }),
    enabled: Boolean(debouncedText),
  });
}

/** GET /ig/media */
export function useIgMedia() {
  return useQuery({
    queryKey: queryKeys.igComments.media(),
    queryFn: ({ signal }) => listIgMedia(signal),
    select: (res) => res.media,
    staleTime: 5 * 60 * 1000,
  });
}

/** GET /ig-comments/media-summary */
export function useIgMediaSummary() {
  return useQuery({
    queryKey: queryKeys.igComments.mediaSummary(),
    queryFn: ({ signal }) => getIgMediaSummary(signal),
    select: (res) => res.media,
  });
}

/** GET /ig/settings */
export function useIgSettings() {
  return useQuery({
    queryKey: queryKeys.igComments.settings(),
    queryFn: ({ signal }) => getIgSettings(signal),
  });
}

/** PATCH /ig/settings */
export function useUpdateIgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IgSettings>) => updateIgSettings(body),
    onSuccess: (data) => {
      qc.setQueryData<IgSettings>(queryKeys.igComments.settings(), data);
    },
  });
}

/** POST /ig/comments/:id/reply (Manual reply) */
export function useManualReplyIgComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      mode,
      publicText,
      dmText,
    }: {
      id: string;
      mode: "public" | "dm" | "both";
      publicText?: string | undefined;
      dmText?: string | undefined;
    }) => replyIgComment(id, { mode, publicText, dmText }),
    onSettled: (_data, _error, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.all });
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

/** POST /ig/comments/:id/dismiss */
export function useDismissIgComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissIgComment(id),
    onSettled: (_data, _error, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.all });
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.detail(id) });
    },
  });
}

/** POST /simulate/ig-comment */
export function useSimulateIgComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      username: string;
      text: string;
      mediaId?: string | undefined;
    }) => simulateIgComment(body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.igComments.all });
    },
  });
}
