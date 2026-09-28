import type { CreateUserRequest, UpdateUserRequest, UserListResponse, UserResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** GET /users (admin only) — staff only, never the admin */
export const listUsers = (signal?: AbortSignal) => api.get<UserListResponse>("/users", undefined, signal);

/** POST /users (admin only) — role is always "staff" server-side */
export const createUser = (body: CreateUserRequest) => api.post<UserResponse>("/users", body);

/** PATCH /users/:id (admin only) — { active } */
export const updateUser = (id: string, body: UpdateUserRequest) =>
  api.patch<UserResponse>(`/users/${encodeURIComponent(id)}`, body);
