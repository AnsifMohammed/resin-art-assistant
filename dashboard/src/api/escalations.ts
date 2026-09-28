import type { AssignResponse, EscalationListParams, EscalationListResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /escalations — staff: only open, assigned to them or unassigned (server-enforced) */
export const listEscalations = (params: EscalationListParams = {}, signal?: AbortSignal) =>
  api.get<EscalationListResponse>("/escalations", params, signal);

/** POST /escalations/:id/assign (admin only) */
export const assignEscalation = (id: string, userId: string | null) =>
  api.post<AssignResponse>(`/escalations/${encodeURIComponent(id)}/assign`, { userId });
