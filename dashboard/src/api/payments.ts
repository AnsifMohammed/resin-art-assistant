import { api } from "./client.ts";
import type {
  MarkPaidRequest,
  OrderPaymentsResponse,
  Payment,
  PaymentLinkDetails,
  PaymentSummary,
  PublicPaymentResponse,
  RecordPaymentRequest,
  SendPaymentRequestResponse,
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

/** GET /payments/:id/link - Fetch payment request details, links & pre-filled text */
export const getPaymentLink = (paymentId: string, signal?: AbortSignal) =>
  api.get<PaymentLinkDetails>(`/payments/${paymentId}/link`, undefined, signal);

/** POST /orders/:id/payments/:paymentId/send-request - Dispatch payment request message to customer */
export const sendPaymentRequest = (
  orderId: string,
  paymentId: string,
  customMessage?: string | undefined,
) =>
  api.post<SendPaymentRequestResponse>(
    `/orders/${orderId}/payments/${paymentId}/send-request`,
    customMessage !== undefined ? { customMessage } : {},
  );

/** GET /public/payments/:id - Public customer-facing payment request */
export const getPublicPayment = (paymentId: string, signal?: AbortSignal) =>
  api.get<PublicPaymentResponse>(`/public/payments/${paymentId}`, undefined, signal);

/** POST /public/payments/:id/submit-utr - Public customer reference submission */
export const submitPublicPaymentUtr = (paymentId: string, reference: string) =>
  api.post<{ ok: boolean; message: string; payment: Payment }>(
    `/public/payments/${paymentId}/submit-utr`,
    { reference },
  );

