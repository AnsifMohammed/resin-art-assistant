import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, setPaused } from "../api/settings.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { SettingsResponse } from "../types/index.ts";

/** Admin only: GET /settings. Pass enabled:false for staff (the endpoint is 403 for them). */
export function useSettings(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: ({ signal }) => getSettings(signal),
    enabled: opts.enabled ?? true,
  });
}

/** Admin only: POST /settings/pause. Optimistic with rollback. */
export function usePause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) => setPaused(paused),
    onMutate: async (paused) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings.all });
      const previous = qc.getQueryData<SettingsResponse>(queryKeys.settings.all);
      qc.setQueryData<SettingsResponse>(queryKeys.settings.all, (prev) => (prev ? { ...prev, paused } : prev));
      return { previous };
    },
    onError: (_err, _paused, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.settings.all, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.settings.all });
      // Pausing may move conversations to/from the "paused" state.
      void qc.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}
