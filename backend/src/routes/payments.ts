import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, payments } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitOrderUpdated } from "../realtime/events.ts";

export type PaymentRow = typeof payments.$inferSelect;

export interface PaymentSummaryResult {
  orderTotal: number;
  totalPaid: number;
  totalPending: number;
  totalVoid: number;
  balanceDue: number;
  paymentState: "fully_paid" | "partially_paid" | "unpaid";
}

export function derivePaymentSummary(
  paymentsList: PaymentRow[],
  explicitOrderTotal?: number,
): PaymentSummaryResult {
  const totalPaid = paymentsList
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = paymentsList
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const totalVoid = paymentsList
    .filter((p) => p.status === "void")
    .reduce((sum, p) => sum + p.amount, 0);

  const orderTotal =
    explicitOrderTotal !== undefined && !Number.isNaN(explicitOrderTotal)
      ? explicitOrderTotal
      : totalPaid + totalPending;

  const balanceDue = Math.max(0, orderTotal - totalPaid);

  const paymentState =
    balanceDue === 0 && totalPaid > 0
      ? "fully_paid"
      : totalPaid > 0
        ? "partially_paid"
        : "unpaid";

  return {
    orderTotal,
    totalPaid,
    totalPending,
    totalVoid,
    balanceDue,
    paymentState,
  };
}

const createPaymentSchema = z.object({
  kind: z.enum(["advance", "balance", "other"]),
  amount: z
    .number()
    .int("Amount must be whole rupees")
    .positive("Amount must be greater than 0"),
  method: z.string().trim().optional(),
  reference: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  markPaidImmediately: z.boolean().optional().default(false),
});

const markPaidSchema = z
  .object({
    method: z.string().trim().optional(),
    reference: z.string().trim().nullable().optional(),
  })
  .optional();

const voidPaymentSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

const updatePaymentSchema = z.object({
  method: z.string().trim().optional(),
  reference: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
});

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. GET /orders/:id/payments
  app.get(
    "/orders/:id/payments",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: orderId } = request.params as { id: string };
      const query = request.query as { orderTotal?: string };
      const queryTotal = query.orderTotal ? parseInt(query.orderTotal, 10) : undefined;

      const rows = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.orderId, orderId)))
        .orderBy(asc(payments.createdAt));

      const summary = derivePaymentSummary(rows, queryTotal);

      return {
        payments: rows,
        summary: {
          orderTotal: summary.orderTotal,
          totalPaid: summary.totalPaid,
          totalPending: summary.totalPending,
          balanceDue: summary.balanceDue,
          paymentState: summary.paymentState,
        },
      };
    },
  );

  // 2. POST /orders/:id/payments (Admin only)
  app.post(
    "/orders/:id/payments",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const businessId = request.user.businessId;
      const { id: orderId } = request.params as { id: string };
      const query = request.query as { orderTotal?: string };
      const queryTotal = query.orderTotal ? parseInt(query.orderTotal, 10) : undefined;
      const body = createPaymentSchema.parse(request.body);

      const isPaidImmediately = Boolean(body.markPaidImmediately);
      const [newPayment] = await db
        .insert(payments)
        .values({
          businessId,
          orderId,
          kind: body.kind,
          amount: body.amount,
          status: isPaidImmediately ? "paid" : "pending",
          method: body.method || "UPI",
          reference: body.reference ?? null,
          note: body.note ?? null,
          paidAt: isPaidImmediately ? new Date() : null,
          recordedByUserId: isPaidImmediately ? request.user.sub : null,
        })
        .returning();

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "payment_recorded",
        details: {
          paymentId: newPayment.id,
          orderId,
          kind: newPayment.kind,
          amount: newPayment.amount,
        },
      });

      const allPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.orderId, orderId)))
        .orderBy(asc(payments.createdAt));

      const summary = derivePaymentSummary(allPayments, queryTotal);

      reply.status(201);
      return {
        payment: newPayment,
        summary: {
          orderTotal: summary.orderTotal,
          totalPaid: summary.totalPaid,
          totalPending: summary.totalPending,
          balanceDue: summary.balanceDue,
          paymentState: summary.paymentState,
        },
      };
    },
  );

  // 3. POST /payments/:id/mark-paid (Admin only)
  app.post(
    "/payments/:id/mark-paid",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };
      const query = request.query as { orderTotal?: string };
      const queryTotal = query.orderTotal ? parseInt(query.orderTotal, 10) : undefined;
      const body = markPaidSchema.parse(request.body ?? {});

      const [existing] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)));

      if (!existing) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

      if (existing.status === "void") {
        throw new AppError(400, "Cannot mark a voided payment as paid", "PAYMENT_VOIDED");
      }

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(payments)
          .set({
            status: "paid",
            paidAt: new Date(),
            recordedByUserId: request.user.sub,
            ...(body?.method ? { method: body.method } : {}),
            ...(body?.reference !== undefined ? { reference: body.reference } : {}),
          })
          .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)))
          .returning();

        await tx.insert(auditLog).values({
          businessId,
          actorId: request.user.sub,
          actorType: "admin",
          action: "payment_marked_paid",
          details: {
            paymentId: row.id,
            orderId: row.orderId,
            amount: row.amount,
            method: row.method,
          },
        });

        return row;
      });

      emitOrderUpdated(businessId, {
        orderId: updated.orderId,
        paymentId: updated.id,
        status: updated.status,
      });

      const allPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.orderId, updated.orderId)))
        .orderBy(asc(payments.createdAt));

      const summary = derivePaymentSummary(allPayments, queryTotal);

      return {
        payment: updated,
        summary: {
          orderTotal: summary.orderTotal,
          totalPaid: summary.totalPaid,
          totalPending: summary.totalPending,
          balanceDue: summary.balanceDue,
          paymentState: summary.paymentState,
        },
      };
    },
  );

  // 4. POST /payments/:id/void (Admin only)
  app.post(
    "/payments/:id/void",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };
      const query = request.query as { orderTotal?: string };
      const queryTotal = query.orderTotal ? parseInt(query.orderTotal, 10) : undefined;
      const body = voidPaymentSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)));

      if (!existing) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

      const [updated] = await db
        .update(payments)
        .set({
          status: "void",
          voidedReason: body.reason,
        })
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)))
        .returning();

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "payment_voided",
        details: {
          paymentId: updated.id,
          orderId: updated.orderId,
          reason: body.reason,
        },
      });

      emitOrderUpdated(businessId, {
        orderId: updated.orderId,
        paymentId: updated.id,
        status: "void",
        reason: body.reason,
      });

      const allPayments = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.orderId, updated.orderId)))
        .orderBy(asc(payments.createdAt));

      const summary = derivePaymentSummary(allPayments, queryTotal);


      return {
        payment: updated,
        summary: {
          orderTotal: summary.orderTotal,
          totalPaid: summary.totalPaid,
          totalPending: summary.totalPending,
          balanceDue: summary.balanceDue,
          paymentState: summary.paymentState,
        },
      };
    },
  );

  // 5. PATCH /payments/:id (Admin only)
  app.patch(
    "/payments/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };
      const body = updatePaymentSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)));

      if (!existing) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

      const [updated] = await db
        .update(payments)
        .set({
          ...(body.method !== undefined ? { method: body.method } : {}),
          ...(body.reference !== undefined ? { reference: body.reference } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        })
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)))
        .returning();

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "payment_updated",
        details: {
          paymentId: updated.id,
          orderId: updated.orderId,
        },
      });

      return { payment: updated };
    },
  );
};
