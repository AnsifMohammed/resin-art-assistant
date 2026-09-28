import type { KnowledgeBaseData, KnowledgeBaseResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /knowledge-base (admin only) */
export const getKnowledgeBase = (signal?: AbortSignal) =>
  api.get<KnowledgeBaseResponse>("/knowledge-base", undefined, signal);

/** PUT /knowledge-base (admin only) — replaces the full KB */
export const putKnowledgeBase = (data: KnowledgeBaseData) =>
  api.put<KnowledgeBaseResponse>("/knowledge-base", { data });
