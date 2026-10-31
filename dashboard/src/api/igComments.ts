import type {
  IgComment,
  IgCommentsResponse,
  IgMedia,
  IgRule,
  IgSettings,
  IgStats,
  IgTestResult,
} from "../types/index.ts";
import { api } from "./client.ts";

const enc = encodeURIComponent;

export interface FetchCommentsParams {
  [key: string]: unknown;
  action?: string | undefined;
  category?: string | undefined;
  mediaId?: string | undefined;
  mediaType?: "post" | "reel" | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface IgMediaSummaryItem {
  mediaId: string;
  mediaType: "post" | "reel";
  mediaCaption: string | null;
  mediaThumbnailUrl: string | null;
  mediaPermalink: string | null;
  counts: {
    total: number;
    needs_attention: number;
    replied: number;
    skipped: number;
    failed: number;
  };
}

/** GET /ig/comments */
export const listIgComments = (params: FetchCommentsParams = {}, signal?: AbortSignal) =>
  api.get<IgCommentsResponse>("/ig/comments", params, signal);

/** GET /ig-comments/media-summary */
export const getIgMediaSummary = (signal?: AbortSignal) =>
  api.get<{ media: IgMediaSummaryItem[] }>("/ig-comments/media-summary", undefined, signal);

/** GET /ig/comments/stats */
export const getIgCommentStats = (signal?: AbortSignal) =>
  api.get<IgStats>("/ig/comments/stats", undefined, signal);

/** GET /ig/comments/:id */
export const getIgComment = (id: string, signal?: AbortSignal) =>
  api.get<{ comment: IgComment }>(`/ig/comments/${enc(id)}`, undefined, signal);

/** POST /ig/comments/:id/reply */
export const replyIgComment = (
  id: string,
  body: {
    mode: "public" | "dm" | "both";
    publicText?: string | undefined;
    dmText?: string | undefined;
  },
) => api.post<{ comment: IgComment }>(`/ig/comments/${enc(id)}/reply`, body);

/** POST /ig/comments/:id/dismiss */
export const dismissIgComment = (id: string) =>
  api.post<{ comment: IgComment }>(`/ig/comments/${enc(id)}/dismiss`, {});

/** GET /ig/rules */
export const listIgRules = (signal?: AbortSignal) =>
  api.get<{ rules: IgRule[] }>("/ig/rules", undefined, signal);

/** POST /ig/rules */
export const createIgRule = (body: Partial<IgRule>) =>
  api.post<{ rule: IgRule }>("/ig/rules", body);

/** PATCH /ig/rules/:id */
export const updateIgRule = (id: string, body: Partial<IgRule>) =>
  api.patch<{ rule: IgRule }>(`/ig/rules/${enc(id)}`, body);

/** DELETE /ig/rules/:id */
export const deleteIgRule = (id: string) =>
  api.delete<{ ok: boolean }>(`/ig/rules/${enc(id)}`);

/** POST /ig/rules/reorder */
export const reorderIgRules = (ids: string[]) =>
  api.post<{ ok: boolean; rules: IgRule[] }>("/ig/rules/reorder", { ids });

/** POST /ig/rules/test */
export const testIgRule = (body: { text: string; mediaId?: string | undefined }) =>
  api.post<IgTestResult>("/ig/rules/test", body);

/** GET /ig/media */
export const listIgMedia = (signal?: AbortSignal) =>
  api.get<{ media: IgMedia[] }>("/ig/media", undefined, signal);

/** GET /ig/settings */
export const getIgSettings = (signal?: AbortSignal) =>
  api.get<IgSettings>("/ig/settings", undefined, signal);

/** PATCH /ig/settings */
export const updateIgSettings = (body: Partial<IgSettings>) =>
  api.patch<IgSettings>("/ig/settings", body);

/** POST /simulate/ig-comment (DEMO_MODE only) */
export const simulateIgComment = (body: {
  username: string;
  text: string;
  mediaId?: string | undefined;
}) =>
  api.post<{ ok: boolean; comment: IgComment }>("/simulate/ig-comment", body);
