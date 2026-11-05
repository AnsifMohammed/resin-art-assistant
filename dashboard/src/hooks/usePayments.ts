import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOrderPayments,
  getPaymentLink,
  getPublicPayment,
  markPaymentPaid,
  recordPayment,
  sendPaymentRequest,
  submitPublicPaymentUtr,
  voidPayment,
} from "../api/payments.ts";
import { queryKeys } from "../lib/queryKeys.ts";
import type {
  MarkPaidRequest,
  RecordPaymentRequest,
  VoidPaymentRequest,
} from "../types/index.ts";

/** GET /orders/:id/payments */
export function useOrderPayments(orderId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.payments.byOrder(orderId || ""),
    queryFn: ({ signal }) => getOrderPayments(orderId!, signal),
    enabled: Boolean(orderId),
  });
}

/** GET /payments/:id/link */
export function usePaymentLink(paymentId: string | null | undefined) {
  return useQuery({
    queryKey: ["paymentLink", paymentId],
    queryFn: ({ signal }) => getPaymentLink(paymentId!, signal),
    enabled: Boolean(paymentId),
  });
}

/** POST /orders/:id/payments/:paymentId/send-request */
export function useSendPaymentRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, customMessage }: { paymentId: string; customMessage?: string | undefined }) =>
      sendPaymentRequest(orderId, paymentId, customMessage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: ["orders", orderId, "messages"] });
    },
  });
}

/** GET /public/payments/:id (Public view) */
export function usePublicPayment(paymentId: string | undefined) {
  return useQuery({
    queryKey: ["publicPayment", paymentId],
    queryFn: ({ signal }) => getPublicPayment(paymentId!, signal),
    enabled: Boolean(paymentId),
    refetchInterval: 10000,
  });
}

/** POST /public/payments/:id/submit-utr */
export function useSubmitPaymentUtr(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => submitPublicPaymentUtr(paymentId, reference),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publicPayment", paymentId] });
    },
  });
}

/** POST /orders/:id/payments (admin only) */
export function useRecordPayment(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentRequest) => recordPayment(orderId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** POST /payments/:id/mark-paid (admin only) */
export function useMarkPaymentPaid(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { paymentId: string; data?: MarkPaidRequest } | string) => {
      if (typeof args === "string") {
        return markPaymentPaid(args);
      }
      return markPaymentPaid(args.paymentId, args.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** POST /payments/:id/void (admin only) */
export function useVoidPayment(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      args:
        | { paymentId: string; reason: string }
        | { paymentId: string; data: VoidPaymentRequest },
    ) => {
      const reason = "reason" in args ? args.reason : args.data.reason;
      return voidPayment(args.paymentId, { reason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.payments.byOrder(orderId) });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
