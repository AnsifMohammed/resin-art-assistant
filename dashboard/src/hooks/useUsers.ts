import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listUsers, updateUser } from "../api/users.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type { CreateUserRequest, UserListResponse } from "../types/index.ts";

/** Admin only: GET /users (staff accounts). */
export function useUsers(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: ({ signal }) => listUsers(signal),
    select: (res) => res.users,
    enabled: opts.enabled ?? true,
  });
}

/** Admin only: POST /users. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserRequest) => createUser(body),
    onSuccess: (res) => {
      qc.setQueryData<UserListResponse>(queryKeys.users.all, (prev) =>
        prev ? { users: [...prev.users.filter((u) => u.id !== res.user.id), res.user] } : prev,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.users.all }),
  });
}

/** Admin only: PATCH /users/:id { active }. Optimistic toggle with rollback. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateUser(id, { active }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.users.all });
      const previous = qc.getQueryData<UserListResponse>(queryKeys.users.all);
      qc.setQueryData<UserListResponse>(queryKeys.users.all, (prev) =>
        prev ? { users: prev.users.map((u) => (u.id === id ? { ...u, active } : u)) } : prev,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.users.all, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users.all });
      // Deactivated staff may hold assigned escalations.
      void qc.invalidateQueries({ queryKey: queryKeys.escalations.all });
    },
  });
}
