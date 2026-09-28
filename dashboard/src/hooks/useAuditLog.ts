import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAuditLog } from "../api/audit-log.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { AuditLogParams } from "../types/index.ts";

/** Admin only: GET /audit-log (paginated). */
export function useAuditLog(params: AuditLogParams = {}) {
  return useQuery({
    queryKey: queryKeys.auditLog.list(params),
    queryFn: ({ signal }) => getAuditLog(params, signal),
    placeholderData: keepPreviousData,
  });
}
