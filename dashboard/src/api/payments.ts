import { api } from "./client.ts";
import type {
  MarkPaidRequest,
  OrderPaymentsResponse,
  Payment,
  PaymentSummary,
  RecordPaymentRequest,
  VoidPaymentRequest,
} from "../types/index.ts";

export interface PaymentMutationResponse {
  payment: Payment;
  summary: PaymentSummary;
}

/** GET /orders/:id/payments */
export const getOrderPayments = (orderId: string, signal?: AbortSignal) =>
  api.get<OrderPaymentsResponse>(`/orders/${orderId}/payments`, undefined, signal);

/** POST /orders/:id/payments (admin only) */
export const recordPayment = (orderId: string, data: RecordPaymentRequest) =>
  api.post<PaymentMutationResponse>(`/orders/${orderId}/payments`, data);

/** POST /payments/:id/mark-paid (admin only) */
export const markPaymentPaid = (paymentId: string, data?: MarkPaidRequest) =>
  api.post<PaymentMutationResponse>(`/payments/${paymentId}/mark-paid`, data ?? {});

/** POST /payments/:id/void (admin only) */
export const voidPayment = (paymentId: string, data: VoidPaymentRequest) =>
  api.post<PaymentMutationResponse>(`/payments/${paymentId}/void`, data);

/** PATCH /payments/:id (admin only) */
export const updatePayment = (paymentId: string, data: Partial<Payment>) =>
  api.patch<{ payment: Payment }>(`/payments/${paymentId}`, data);
