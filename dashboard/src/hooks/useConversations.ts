import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  getConversation,
  getConversationOrders,
  listConversations,
  markConversationRead,
  pauseConversation,
  replyToConversation,
  resolveConversation,
  resumeConversation,
} from "../api/conversations.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  ChannelType,
  ConvState,
  ConvTag,
  ConversationDetailResponse,
  ConversationListParams,
  ConversationListResponse,
  Message,
  ReplyRequest,
} from "../types/index.ts";

/** Admin only: GET /conversations. Keeps the previous page visible while paging/filtering. */
export function useConversations(params: ConversationListParams = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.conversations.list(params),
    queryFn: ({ signal }) => listConversations(params, signal),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

const CONVERSATIONS_PAGE_SIZE = 20;

export interface ConversationFilters {
  state?: ConvState | undefined;
  tag?: ConvTag | undefined;
  channel?: ChannelType | undefined;
  /** Free-text search (trimmed; empty is ignored). */
  search?: string | undefined;
  /** Only conversations with unread customer messages. */
  unread?: boolean | undefined;
}

/**
 * "Load more" pagination over GET /conversations.
 * Keyed under conversations.lists() so the shared invalidations (reply, resolve, realtime) refresh it.
 */
export function useInfiniteConversations(filters: ConversationFilters) {
  const params: ConversationListParams = {};
  if (filters.state) params.state = filters.state;
  if (filters.tag) params.tag = filters.tag;
  if (filters.channel) params.channel = filters.channel;
  const search = filters.search?.trim().slice(0, 100);
  if (search) params.search = search;
  if (filters.unread) params.unread = "true";
  return useInfiniteQuery({
    queryKey: [...queryKeys.conversations.lists(), "infinite", params],
    queryFn: ({ pageParam, signal }) => listConversations({ ...params, page: pageParam, limit: CONVERSATIONS_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, limit, total } = last.pagination;
      return page * limit < total ? page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });
}

/** GET /conversations/:id — full thread. Pass undefined to disable. */
export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id ?? ""),
    queryFn: ({ signal }) => getConversation(id as string, signal),
    enabled: Boolean(id),
    select: (res) => res.conversation,
  });
}

/** Admin or assigned staff: GET /conversations/:id/orders */
export function useConversationOrders(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.orders(conversationId ?? ""),
    queryFn: ({ signal }) => getConversationOrders(conversationId as string, signal),
    select: (res) => res.orders,
    enabled: Boolean(conversationId),
  });
}

/** POST /conversations/:id/reply ({ text } or { templateId, variables }). Appends the sent message, then refetches. */
export function useReply(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReplyRequest) => replyToConversation(conversationId, body),
    onSuccess: (res) => {
      qc.setQueryData<ConversationDetailResponse>(queryKeys.conversations.detail(conversationId), (prev) =>
        prev
          ? {
              conversation: {
                ...prev.conversation,
                state: res.conversation.state,
                messages: prev.conversation.messages.some((m) => m.id === res.message.id)
                  ? prev.conversation.messages
                  : [...prev.conversation.messages, res.message],
              },
            }
          : prev,
      );
    },
    onSettled: () => {
      // Human reply moves the conversation to owner_handling: lists and the queue change too.
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
    },
  });
}

/** POST /conversations/:id/resolve — returns the conversation to ai_active and closes its escalation. */
export function useResolve(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resolveConversation(conversationId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
    },
  });
}

type InfiniteConversations = { pages: ConversationListResponse[]; pageParams: unknown[] };

/** Admin only: POST /conversations/:id/read. Clears the unread dot in every cached list. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: (_res, conversationId) => {
      const clear = (list: ConversationListResponse): ConversationListResponse => ({
        ...list,
        conversations: list.conversations.map((c) =>
          c.id === conversationId ? { ...c, unread: false, adminLastReadAt: new Date().toISOString() } : c,
        ),
      });
      qc.setQueriesData<ConversationListResponse | InfiniteConversations>(
        { queryKey: queryKeys.conversations.lists() },
        (prev) => {
          if (!prev) return prev;
          if ("pages" in prev) return { ...prev, pages: prev.pages.map(clear) };
          if ("conversations" in prev) return clear(prev);
          return prev;
        },
      );
      // An "Unread only" list should drop the row on its next fetch.
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.lists(), refetchType: "none" });
    },
  });
}

function useStateChange(conversationId: string, fn: (id: string) => Promise<{ conversation: { state: ConvState } }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fn(conversationId),
    onSuccess: (res) => {
      qc.setQueryData<ConversationDetailResponse>(queryKeys.conversations.detail(conversationId), (prev) =>
        prev ? { conversation: { ...prev.conversation, state: res.conversation.state } } : prev,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
    },
  });
}

/** Admin only: POST /conversations/:id/pause (stop the AI for this conversation). */
export function usePauseConversation(conversationId: string) {
  return useStateChange(conversationId, pauseConversation);
}

/** Admin only: POST /conversations/:id/resume (hand back to the AI). */
export function useResumeConversation(conversationId: string) {
  return useStateChange(conversationId, resumeConversation);
}

/** Append a live (realtime) message to a cached thread. No-op if the thread isn't cached or already has it. */
export function appendMessageToCache(qc: QueryClient, conversationId: string, message: Message): void {
  qc.setQueryData<ConversationDetailResponse>(queryKeys.conversations.detail(conversationId), (prev) =>
    prev && !prev.conversation.messages.some((m) => m.id === message.id)
      ? { conversation: { ...prev.conversation, messages: [...prev.conversation.messages, message] } }
      : prev,
  );
}
