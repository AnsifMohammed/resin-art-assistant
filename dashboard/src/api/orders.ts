import type {
  CreateOrderRequest,
  OrderListResponse,
  OrderResponse,
  UpdateOrderRequest,
  UpdateOrderStatusRequest,
} from "../types/index.ts";
import { api } from "./client.ts";

export interface ListOrdersQuery {
  status?: string | undefined;
  search?: string | undefined;
}

/** GET /orders - List orders with status filter & search */
export const listOrders = (query?: ListOrdersQuery, signal?: AbortSignal) =>
  api.get<OrderListResponse>("/orders", query, signal);

/** GET /orders/:id - Get single order */
export const getOrder = (id: string, signal?: AbortSignal) =>
  api.get<OrderResponse>(`/orders/${encodeURIComponent(id)}`, undefined, signal);

/** POST /orders - Create order (Admin only) */
export const createOrder = (body: CreateOrderRequest) =>
  api.post<OrderResponse>("/orders", body);

/** PATCH /orders/:id - Update order details (Admin only) */
export const updateOrder = (id: string, body: UpdateOrderRequest) =>
  api.patch<OrderResponse>(`/orders/${encodeURIComponent(id)}`, body);

/** POST /orders/:id/status - Update order status (Admin only) */
export const updateOrderStatus = (id: string, body: UpdateOrderStatusRequest) =>
  api.post<OrderResponse>(`/orders/${encodeURIComponent(id)}/status`, body);

/** DELETE /orders/:id - Soft delete order (Admin only) */
export const deleteOrder = (id: string) =>
  api.delete<{ ok: boolean; id: string }>(`/orders/${encodeURIComponent(id)}`);
