import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAuditLog } from "../api/audit-log.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { ActorType, AuditLogEntry, AuditLogParams } from "../types/index.ts";

/** Admin only: GET /audit-log (paginated). */
export function useAuditLog(params: AuditLogParams = {}) {
  return useQuery({
    queryKey: queryKeys.auditLog.list(params),
    queryFn: ({ signal }) => getAuditLog(params, signal),
    placeholderData: keepPreviousData,
  });
}

export interface InfiniteAuditLogParams {
  actorType?: ActorType | undefined;
  /** Matches actions starting with this prefix, e.g. "order_". */
  actionPrefix?: string | undefined;
  limit?: number | undefined;
}

/** Admin only: GET /audit-log as an infinite list. */
export function useInfiniteAuditLog(params: InfiniteAuditLogParams = {}) {
  const limit = params.limit ?? 30;
  const actorType = params.actorType;
  const actionPrefix = params.actionPrefix;

  const queryParams: AuditLogParams = {
    limit,
    actorType,
    actionPrefix,
  };

  const query = useInfiniteQuery({
    queryKey: [...queryKeys.auditLog.all, "infinite", { actorType, actionPrefix, limit }] as const,
    queryFn: ({ pageParam = 1, signal }) =>
      getAuditLog(
        {
          ...queryParams,
          page: Number(pageParam),
        },
        signal
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, limit: pageLimit, total } = last.pagination;
      return page * pageLimit < total ? page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: AuditLogEntry[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const entry of page.entries) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          out.push(entry);
        }
      }
    }
    return out;
  }, [query.data?.pages]);

  const total = query.data?.pages[0]?.pagination.total ?? 0;

  return {
    ...query,
    rows,
    total,
  };
}
