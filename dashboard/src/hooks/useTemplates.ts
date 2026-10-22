import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  updateTemplate,
} from "../api/templates.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { CreateTemplateRequest, TemplateListParams, UpdateTemplateRequest } from "../types/index.ts";

/** GET /templates. Returns the template array. */
export function useTemplates(params: TemplateListParams = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.templates.list(params),
    queryFn: ({ signal }) => listTemplates(params, signal),
    select: (res) => res.templates,
    enabled: opts.enabled ?? true,
  });
}

/** Admin only: POST /templates. */
export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateRequest) => createTemplate(body),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.templates.all }),
  });
}

/** Admin only: PATCH /templates/:id. */
export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTemplateRequest }) => updateTemplate(id, body),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.templates.all }),
  });
}

/** Admin only: DELETE /templates/:id. */
export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.templates.all }),
  });
}

/** Admin only: POST /templates/:id/duplicate. */
export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateTemplate(id),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.templates.all }),
  });
}
