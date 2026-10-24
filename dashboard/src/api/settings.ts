import type { PauseResponse, SettingsPatchRequest, SettingsResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /settings (admin only) */
export const getSettings = (signal?: AbortSignal) => api.get<SettingsResponse>("/settings", undefined, signal);

/** PATCH /settings (admin only): partial { businessHours?, awayMessage?, windowAlerts? } → full settings */
export const updateSettings = (patch: SettingsPatchRequest) => api.patch<SettingsResponse>("/settings", patch);

/** POST /settings/pause (admin only) */
export const setPaused = (paused: boolean) => api.post<PauseResponse>("/settings/pause", { paused });
