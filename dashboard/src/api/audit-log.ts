import type { AuditLogParams, AuditLogResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /audit-log?page&limit&actorId&action (admin only) */
export const getAuditLog = (params: AuditLogParams = {}, signal?: AbortSignal) =>
  api.get<AuditLogResponse>("/audit-log", params, signal);
