import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getKnowledgeBase, putKnowledgeBase } from "../api/knowledge-base.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { KnowledgeBaseData } from "../types/index.ts";

/** Admin only: GET /knowledge-base. */
export function useKnowledgeBase() {
  return useQuery({
    queryKey: queryKeys.knowledgeBase.all,
    queryFn: ({ signal }) => getKnowledgeBase(signal),
    // Editing form: don't clobber in-progress edits by refetching on focus.
    refetchOnWindowFocus: false,
  });
}

/** Admin only: PUT /knowledge-base (full replace). */
export function usePutKnowledgeBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: KnowledgeBaseData) => putKnowledgeBase(data),
    onSuccess: (res) => qc.setQueryData(queryKeys.knowledgeBase.all, res),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.knowledgeBase.all }),
  });
}
