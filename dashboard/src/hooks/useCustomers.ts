import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { getCustomer, getCustomerOrders, listCustomers, updateCustomer } from "../api/customers.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  CustomerListItem,
  CustomerListParams,
  CustomerListResponse,
  CustomerResponse,
  UpdateCustomerRequest,
} from "../types/index.ts";

/** Admin only: GET /customers. Keeps the previous page visible while filtering/paging. */
export function useCustomers(params: CustomerListParams = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: ({ signal }) => listCustomers(params, signal),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

const CUSTOMERS_PAGE_SIZE = 50;

/**
 * Admin only: GET /customers as an infinite list (50 per page).
 * Keeps the previous rows visible while params change. `rows` is flattened and de-duplicated
 * (offset paging can repeat a row when the order shifts between pages); `total` and `counts`
 * come from the first page.
 */
export function useInfiniteCustomers(params: Omit<CustomerListParams, "page" | "limit"> = {}) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.customers.infinite(params),
    queryFn: ({ pageParam, signal }) =>
      listCustomers({ ...params, page: pageParam, limit: CUSTOMERS_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, limit, total } = last.pagination;
      return page * limit < total ? page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: CustomerListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const c of page.customers) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }, [query.data]);

  const first = query.data?.pages[0];
  return { ...query, rows, total: first?.pagination.total ?? 0, counts: first?.counts };
}

/** Admin only: GET /customers/:id. Pass null/undefined to skip. */
export function useCustomer(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ""),
    queryFn: ({ signal }) => getCustomer(id as string, signal),
    select: (res) => res.customer,
    enabled: Boolean(id),
  });
}

/** Admin only: GET /customers/:id/orders (newest first). */
export function useCustomerOrders(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.orders(id ?? ""),
    queryFn: ({ signal }) => getCustomerOrders(id as string, signal),
    select: (res) => res.orders,
    enabled: Boolean(id),
  });
}

type CustomerFlags = Pick<CustomerListItem, "isFavourite" | "isPriority" | "optedOut" | "optedOutAt">;

/** Flag fields applied optimistically; the rest waits for the server's answer. */
function optimisticPatch(body: UpdateCustomerRequest): Partial<CustomerFlags> {
  const patch: Partial<CustomerFlags> = {};
  if (body.isFavourite !== undefined) patch.isFavourite = body.isFavourite;
  if (body.isPriority !== undefined) patch.isPriority = body.isPriority;
  if (body.optedOut !== undefined) {
    patch.optedOut = body.optedOut;
    patch.optedOutAt = body.optedOut ? new Date().toISOString() : null;
  }
  return patch;
}

/**
 * Admin only: PATCH /customers/:id.
 * isFavourite / isPriority / optedOut flip immediately in every cached list and the detail, and roll back on error.
 */
export function useUpdateCustomer() {
  const qc = useQueryClient();

  const patchCaches = (id: string, fn: (c: CustomerListItem) => CustomerListItem) => {
    const patchList = (res: CustomerListResponse): CustomerListResponse => ({
      ...res,
      customers: res.customers.map((c) => (c.id === id ? fn(c) : c)),
    });
    // lists() covers both shapes: paged (CustomerListResponse) and infinite (pages[]).
    qc.setQueriesData<CustomerListResponse | InfiniteData<CustomerListResponse, number>>(
      { queryKey: queryKeys.customers.lists() },
      (old) => {
        if (!old) return old;
        if ("pages" in old) return { ...old, pages: old.pages.map(patchList) };
        return patchList(old);
      },
    );
    qc.setQueryData<CustomerResponse>(queryKeys.customers.detail(id), (old) =>
      old ? { customer: fn(old.customer) } : old,
    );
  };

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomerRequest }) => updateCustomer(id, body),
    onMutate: async ({ id, body }) => {
      const patch = optimisticPatch(body);
      if (Object.keys(patch).length === 0) return { snapshots: [] as Array<[readonly unknown[], unknown]> };
      await qc.cancelQueries({ queryKey: queryKeys.customers.lists() });
      await qc.cancelQueries({ queryKey: queryKeys.customers.detail(id) });
      const snapshots: Array<[readonly unknown[], unknown]> = [
        ...qc.getQueriesData({ queryKey: queryKeys.customers.lists() }),
        [queryKeys.customers.detail(id), qc.getQueryData(queryKeys.customers.detail(id))],
      ];
      patchCaches(id, (c) => ({ ...c, ...patch }));
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (res, { id }) => {
      patchCaches(id, () => res.customer);
    },
    // Segment counts and membership (favourites/priority tabs) come from the server.
    // Opt-out also changes broadcast audiences.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.customers.all }),
        qc.invalidateQueries({ queryKey: queryKeys.broadcasts.audienceAll() }),
      ]),
  });
}
