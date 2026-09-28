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
  listConversations,
  replyToConversation,
  resolveConversation,
} from "../api/conversations.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  ChannelType,
  ConvState,
  ConvTag,
  ConversationDetailResponse,
  ConversationListParams,
  Message,
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

/** POST /conversations/:id/reply. Appends the sent message to the cached thread, then refetches. */
export function useReply(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => replyToConversation(conversationId, text),
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

/** Append a live (realtime) message to a cached thread. No-op if the thread isn't cached or already has it. */
export function appendMessageToCache(qc: QueryClient, conversationId: string, message: Message): void {
  qc.setQueryData<ConversationDetailResponse>(queryKeys.conversations.detail(conversationId), (prev) =>
    prev && !prev.conversation.messages.some((m) => m.id === message.id)
      ? { conversation: { ...prev.conversation, messages: [...prev.conversation.messages, message] } }
      : prev,
  );
}
