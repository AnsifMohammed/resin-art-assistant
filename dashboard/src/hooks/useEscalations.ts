import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignEscalation, listEscalations } from "../api/escalations.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { EscalationListParams } from "../types/index.ts";

/** GET /escalations. Server scopes staff to open + (assigned to them | unassigned). */
export function useEscalations(params: EscalationListParams = {}) {
  return useQuery({
    queryKey: queryKeys.escalations.list(params),
    queryFn: ({ signal }) => listEscalations(params, signal),
    select: (res) => res.escalations,
  });
}

/** Admin only: POST /escalations/:id/assign. userId null = unassign. */
export function useAssignEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ escalationId, userId }: { escalationId: string; userId: string | null }) =>
      assignEscalation(escalationId, userId),
    onSettled: (res) => {
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
      if (res) {
        void qc.invalidateQueries({ queryKey: queryKeys.conversations.detail(res.escalation.conversationId) });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
    },
  });
}
