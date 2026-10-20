import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  updateOrder,
  updateOrderStatus,
  type ListOrdersQuery,
} from "../api/orders.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  CreateOrderRequest,
  OrderListResponse,
  UpdateOrderRequest,
  UpdateOrderStatusRequest,
} from "../types/index.ts";

export function useOrders(params?: ListOrdersQuery) {
  return useQuery({
    queryKey: queryKeys.orders.list(params),
    queryFn: ({ signal }) => listOrders(params, signal),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: ({ signal }) => getOrder(id, signal),
    enabled: Boolean(id),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderRequest) => createOrder(body),
    onSuccess: (res) => {
      // Immediately inject into local cache for instant 0ms UI update
      qc.setQueriesData<OrderListResponse>(
        { queryKey: queryKeys.orders.all },
        (old) => {
          if (!old || !old.orders) return old;
          return {
            ...old,
            orders: [res.order, ...old.orders],
            statusCounts: {
              ...old.statusCounts,
              all: (old.statusCounts?.all || 0) + 1,
              [res.order.status]: (old.statusCounts?.[res.order.status] || 0) + 1,
            },
            total: (old.total || 0) + 1,
          };
        }
      );
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrderRequest }) =>
      updateOrder(id, data),
    onSuccess: (res, vars) => {
      // Immediately update local cache for instant 0ms UI update
      qc.setQueriesData<OrderListResponse>(
        { queryKey: queryKeys.orders.all },
        (old) => {
          if (!old || !old.orders) return old;
          return {
            ...old,
            orders: old.orders.map((o) => (o.id === vars.id ? res.order : o)),
          };
        }
      );
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      void qc.invalidateQueries({ queryKey: queryKeys.orders.detail(vars.id) });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateOrderStatusRequest;
    }) => updateOrderStatus(id, data),
    onSuccess: (res, vars) => {
      qc.setQueriesData<OrderListResponse>(
        { queryKey: queryKeys.orders.all },
        (old) => {
          if (!old || !old.orders) return old;
          const oldOrder = old.orders.find((o) => o.id === vars.id);
          const fromStatus = oldOrder?.status;
          const toStatus = res.order.status;

          const updatedCounts = { ...old.statusCounts };
          if (fromStatus && fromStatus !== toStatus) {
            updatedCounts[fromStatus] = Math.max(0, (updatedCounts[fromStatus] || 0) - 1);
            updatedCounts[toStatus] = (updatedCounts[toStatus] || 0) + 1;
          }

          return {
            ...old,
            orders: old.orders.map((o) => (o.id === vars.id ? res.order : o)),
            statusCounts: updatedCounts,
          };
        }
      );
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      void qc.invalidateQueries({ queryKey: queryKeys.orders.detail(vars.id) });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSuccess: (_, id) => {
      qc.setQueriesData<OrderListResponse>(
        { queryKey: queryKeys.orders.all },
        (old) => {
          if (!old || !old.orders) return old;
          const target = old.orders.find((o) => o.id === id);
          return {
            ...old,
            orders: old.orders.filter((o) => o.id !== id),
            total: Math.max(0, (old.total || 0) - 1),
            statusCounts: target
              ? {
                  ...old.statusCounts,
                  all: Math.max(0, (old.statusCounts?.all || 0) - 1),
                  [target.status]: Math.max(0, (old.statusCounts?.[target.status] || 0) - 1),
                }
              : old.statusCounts,
          };
        }
      );
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}
