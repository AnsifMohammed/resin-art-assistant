import type {
  CreateTemplateRequest,
  TemplateListParams,
  TemplateListResponse,
  TemplateResponse,
  UpdateTemplateRequest,
} from "../types/index.ts";
import { api } from "./client.ts";

const enc = encodeURIComponent;

/** GET /templates (admin + staff; staff always get active only). Sorted by category, name. */
export const listTemplates = (params: TemplateListParams = {}, signal?: AbortSignal) =>
  api.get<TemplateListResponse>("/templates", params, signal);

/** GET /templates/:id */
export const getTemplate = (id: string, signal?: AbortSignal) =>
  api.get<TemplateResponse>(`/templates/${enc(id)}`, undefined, signal);

/** POST /templates (admin only). 409 TEMPLATE_NAME_TAKEN, 400 VALIDATION_ERROR with details. */
export const createTemplate = (body: CreateTemplateRequest) => api.post<TemplateResponse>("/templates", body);

/** PATCH /templates/:id (admin only) — any subset of the create fields. */
export const updateTemplate = (id: string, body: UpdateTemplateRequest) =>
  api.patch<TemplateResponse>(`/templates/${enc(id)}`, body);

/** DELETE /templates/:id (admin only) → 204. */
export const deleteTemplate = (id: string) => api.delete<void>(`/templates/${enc(id)}`);

/** POST /templates/:id/duplicate (admin only) → copy named "<name> (Copy)". */
export const duplicateTemplate = (id: string) => api.post<TemplateResponse>(`/templates/${enc(id)}/duplicate`);
