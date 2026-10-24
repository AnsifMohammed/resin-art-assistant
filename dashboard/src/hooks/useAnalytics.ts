import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAnalytics } from "../api/analytics.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { AnalyticsParams } from "../types/index.ts";

/** Admin only: GET /analytics?from&to&channel. The query key includes every param (channel too). */
export function useAnalytics(params: AnalyticsParams = {}) {
  return useQuery({
    queryKey: queryKeys.analytics.range(params),
    queryFn: ({ signal }) => getAnalytics(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
