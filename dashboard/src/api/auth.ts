import type { LoginRequest, LoginResponse, MeResponse, OkResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** POST /auth/login — anonymous: a 401 here means bad credentials, not an expired session. */
export const login = (body: LoginRequest) =>
  api.post<LoginResponse>("/auth/login", body, { anonymous: true });

/** GET /auth/me */
export const me = (signal?: AbortSignal) => api.get<MeResponse>("/auth/me", undefined, signal);

/** POST /auth/logout — stateless on the server; the client drops the token. */
export const logout = () => api.post<OkResponse>("/auth/logout");
