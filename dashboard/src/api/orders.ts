import type {
  CreateOrderRequest,
  OrderListResponse,
  OrderMessage,
  OrderResponse,
  SendProgressUpdateRequest,
  UpdateOrderRequest,
  UpdateOrderStatusRequest,
} from "../types/index.ts";
import { api } from "./client.ts";

export interface ListOrdersQuery {
  status?: string | undefined;
  search?: string | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
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
  api.post<OrderResponse & { notification?: { sent: boolean; deliveryStatus: string; error?: string; preview?: string } }>(
    `/orders/${encodeURIComponent(id)}/status`,
    body
  );

/** DELETE /orders/:id - Soft delete order (Admin only) */
export const deleteOrder = (id: string) =>
  api.delete<{ ok: boolean; id: string }>(`/orders/${encodeURIComponent(id)}`);

/** GET /orders/:id/messages - Get communication history for an order */
export const getOrderMessages = (id: string, signal?: AbortSignal) =>
  api.get<{ messages: OrderMessage[] }>(`/orders/${encodeURIComponent(id)}/messages`, undefined, signal);

/** POST /orders/:id/progress-update - Send progress update via order's channel (Instagram or WhatsApp) */
export const sendProgressUpdate = (id: string, body: SendProgressUpdateRequest) =>
  api.post<{ ok: boolean; deliveryStatus: string; channel?: string; messageId?: string; error?: string; preview?: string }>(
    `/orders/${encodeURIComponent(id)}/progress-update`,
    body
  );

/** POST /orders/:id/retry-notification/:messageId - Retry sending a failed message */
export const retryOrderNotification = (id: string, messageId: string) =>
  api.post<{ ok: boolean; deliveryStatus?: string; channel?: string; message: OrderMessage; error?: string }>(
    `/orders/${encodeURIComponent(id)}/retry-notification/${encodeURIComponent(messageId)}`,
    {}
  );
