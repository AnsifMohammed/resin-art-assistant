import type { AnalyticsParams, AnalyticsResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /analytics?from&to (admin only) */
export const getAnalytics = (params: AnalyticsParams = {}, signal?: AbortSignal) =>
  api.get<AnalyticsResponse>("/analytics", params, signal);
