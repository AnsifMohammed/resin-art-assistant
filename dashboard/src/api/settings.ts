import type { PauseResponse, SettingsResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /settings (admin only) */
export const getSettings = (signal?: AbortSignal) => api.get<SettingsResponse>("/settings", undefined, signal);

/** POST /settings/pause (admin only) */
export const setPaused = (paused: boolean) => api.post<PauseResponse>("/settings/pause", { paused });
