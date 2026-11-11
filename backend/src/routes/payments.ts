import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, knowledgeBase, messages, orders, payments } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";
import { emitOrderUpdated } from "../realtime/events.ts";
import { sendMessage } from "../services/send.ts";
import { config } from "../config.ts";
import { findOrCreateCustomerConversation } from "./orders.ts";

export type PaymentRow = typeof payments.$inferSelect;

/** The order's total in whole rupees, read from the database (never trusted from the client). */
async function orderTotalFor(businessId: string, orderId: string): Promise<number | undefined> {
  const [order] = await db
    .select({ total: orders.totalAmount })
    .from(orders)
    .where(and(eq(orders.businessId, businessId), eq(orders.id, orderId)));
  return order ? Math.round(Number(order.total)) : undefined;
}

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

async function getBusinessPaymentConfig(businessId: string): Promise<{ businessName: string; upiId: string }> {
  try {
    const [kb] = await db
      .select({ data: knowledgeBase.data })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.businessId, businessId));
    const kbData = (kb?.data as Record<string, unknown>) || {};
    const businessName = typeof kbData.business_name === "string" ? kbData.business_name : "Saba Art";
    const payObj = (kbData.payment as Record<string, unknown>) || {};
    const upiId = typeof payObj.upi_id === "string" ? payObj.upi_id : "sabaart@upi";
    return { businessName, upiId };
  } catch {
    return { businessName: "Saba Art", upiId: "sabaart@upi" };
  }
}

function getBaseUrl(request: { headers: Record<string, unknown> }): string {
  const origin = request.headers.origin || request.headers.referer;
  if (origin && typeof origin === "string") {
    try {
      const url = new URL(origin);
      return url.origin;
    } catch {}
  }
  return config.DASHBOARD_URL || "http://localhost:5173";
}

export function buildPaymentLinks({
  baseUrl,
  paymentId,
  amount,
  orderNo,
  kind,
  businessName,
  upiId,
}: {
  baseUrl: string;
  paymentId: string;
  amount: number;
  orderNo: string;
  kind: string;
  businessName: string;
  upiId: string;
}) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const paymentUrl = `${cleanBase}/pay/${paymentId}`;
  const note = `Order #${orderNo || paymentId} ${kind === "advance" ? "Advance" : kind === "balance" ? "Balance" : "Payment"}`;
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(businessName)}&am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`;
  return { paymentUrl, upiLink };
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

const sendPaymentRequestSchema = z.object({
  customMessage: z.string().trim().optional(),
});

const submitUtrSchema = z.object({
  reference: z.string().trim().min(4, "Please enter a valid reference / UTR number"),
});

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ─── Public routes (No auth) ───────────────────────────────────────────────
  // A. GET /public/payments/:id - Public customer-facing payment request view
  app.get("/public/payments/:id", async (request) => {
    const { id: paymentId } = request.params as { id: string };

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));

    if (!payment) {
      throw new AppError(404, "Payment request not found", "NOT_FOUND");
    }

    const [order] = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        customerName: orders.customerName,
        totalAmount: orders.totalAmount,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, payment.orderId));

    const paymentConfig = await getBusinessPaymentConfig(payment.businessId);
    const baseUrl = getBaseUrl(request);
    const links = buildPaymentLinks({
      baseUrl,
      paymentId: payment.id,
      amount: payment.amount,
      orderNo: order?.orderNo || "",
      kind: payment.kind,
      businessName: paymentConfig.businessName,
      upiId: paymentConfig.upiId,
    });

    return {
      payment: {
        id: payment.id,
        kind: payment.kind,
        amount: payment.amount,
        status: payment.status,
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
        paymentLink: links.paymentUrl,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      },
      order: order || null,
      business: {
        name: paymentConfig.businessName,
        upiId: paymentConfig.upiId,
      },
      upiLink: links.upiLink,
      paymentUrl: links.paymentUrl,
    };
  });

  // B. POST /public/payments/:id/submit-utr - Customer submits UTR/Txn reference
  app.post("/public/payments/:id/submit-utr", async (request) => {
    const { id: paymentId } = request.params as { id: string };
    const body = submitUtrSchema.parse(request.body);

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));

    if (!payment) {
      throw new AppError(404, "Payment request not found", "NOT_FOUND");
    }

    if (payment.status === "void") {
      throw new AppError(400, "This payment request has been cancelled", "PAYMENT_VOIDED");
    }

    const [updated] = await db
      .update(payments)
      .set({
        reference: body.reference,
      })
      .where(eq(payments.id, paymentId))
      .returning();

    await db.insert(auditLog).values({
      businessId: payment.businessId,
      actorId: null,
      actorType: "customer",
      action: "payment_utr_submitted",
      details: {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        reference: body.reference,
      },
    });

    emitOrderUpdated(payment.businessId, {
      orderId: payment.orderId,
      paymentId: payment.id,
      reference: body.reference,
      status: payment.status,
    });

    return {
      ok: true,
      message: "Thank you! Your reference ID has been submitted and is pending verification.",
      payment: updated,
    };
  });

  // ─── Authenticated Staff / Admin routes ─────────────────────────────────────
  // 1. GET /orders/:id/payments
  app.get(
    "/orders/:id/payments",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: orderId } = request.params as { id: string };

      const [order] = await db
        .select({
          orderNo: orders.orderNo,
          customerName: orders.customerName,
          channel: orders.channel,
        })
        .from(orders)
        .where(and(eq(orders.businessId, businessId), eq(orders.id, orderId)));

      const rows = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.orderId, orderId)))
        .orderBy(asc(payments.createdAt));

      const paymentConfig = await getBusinessPaymentConfig(businessId);
      const baseUrl = getBaseUrl(request);

      const rowsWithLinks = rows.map((p) => {
        const links = buildPaymentLinks({
          baseUrl,
          paymentId: p.id,
          amount: p.amount,
          orderNo: order?.orderNo || "",
          kind: p.kind,
          businessName: paymentConfig.businessName,
          upiId: paymentConfig.upiId,
        });
        return {
          ...p,
          paymentLink: links.paymentUrl,
          upiLink: links.upiLink,
        };
      });

      const summary = derivePaymentSummary(rows, await orderTotalFor(businessId, orderId));

      return {
        payments: rowsWithLinks,
        businessInfo: {
          businessName: paymentConfig.businessName,
          upiId: paymentConfig.upiId,
        },
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
      const body = createPaymentSchema.parse(request.body);

      const isPaidImmediately = Boolean(body.markPaidImmediately);

      const [order] = await db
        .select({
          orderNo: orders.orderNo,
          customerName: orders.customerName,
        })
        .from(orders)
        .where(and(eq(orders.businessId, businessId), eq(orders.id, orderId)));

      const paymentConfig = await getBusinessPaymentConfig(businessId);
      const baseUrl = getBaseUrl(request);

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

      if (!newPayment) {
        throw new AppError(500, "Failed to record payment", "INTERNAL_ERROR");
      }

      const links = buildPaymentLinks({
        baseUrl,
        paymentId: newPayment.id,
        amount: newPayment.amount,
        orderNo: order?.orderNo || "",
        kind: newPayment.kind,
        businessName: paymentConfig.businessName,
        upiId: paymentConfig.upiId,
      });

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

      const summary = derivePaymentSummary(allPayments, await orderTotalFor(businessId, orderId));

      reply.status(201);
      return {
        payment: {
          ...newPayment,
          paymentLink: links.paymentUrl,
          upiLink: links.upiLink,
        },
        links,
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

  // 3. GET /payments/:id/link (Staff or Admin) - Generate link / request payload
  app.get(
    "/payments/:id/link",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };

      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId)));

      if (!payment) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.businessId, businessId), eq(orders.id, payment.orderId)));

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const paymentConfig = await getBusinessPaymentConfig(businessId);
      const baseUrl = getBaseUrl(request);
      const links = buildPaymentLinks({
        baseUrl,
        paymentId: payment.id,
        amount: payment.amount,
        orderNo: order.orderNo,
        kind: payment.kind,
        businessName: paymentConfig.businessName,
        upiId: paymentConfig.upiId,
      });

      const kindLabel =
        payment.kind === "advance"
          ? "Advance payment"
          : payment.kind === "balance"
            ? "Balance payment"
            : "Payment";

      const formattedMessage = `Hi ${order.customerName}! 🌸\n\nHere is your payment request for Order #${order.orderNo} (${kindLabel}):\nAmount: ₹${payment.amount.toLocaleString("en-IN")}\n\n💳 Pay via Payment Link:\n${links.paymentUrl}\n\n📱 UPI ID: ${paymentConfig.upiId}\n\nOnce paid, please reply with your screenshot or UTR reference ID. Thank you! - ${paymentConfig.businessName}`;

      return {
        paymentId: payment.id,
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        channel: order.channel,
        amount: payment.amount,
        kind: payment.kind,
        status: payment.status,
        paymentUrl: links.paymentUrl,
        upiLink: links.upiLink,
        upiId: paymentConfig.upiId,
        businessName: paymentConfig.businessName,
        formattedMessage,
      };
    },
  );

  // 4. POST /orders/:id/payments/:paymentId/send-request (Admin only) - Send to customer chat
  app.post(
    "/orders/:id/payments/:paymentId/send-request",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: orderId, paymentId } = request.params as { id: string; paymentId: string };
      const body = sendPaymentRequestSchema.parse(request.body ?? {});

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.businessId, businessId), eq(orders.id, orderId)));

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.businessId, businessId), eq(payments.id, paymentId), eq(payments.orderId, orderId)));

      if (!payment) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

      if (payment.status === "void") {
        throw new AppError(400, "Cannot send payment request for a voided payment", "PAYMENT_VOIDED");
      }

      const paymentConfig = await getBusinessPaymentConfig(businessId);
      const baseUrl = getBaseUrl(request);
      const links = buildPaymentLinks({
        baseUrl,
        paymentId: payment.id,
        amount: payment.amount,
        orderNo: order.orderNo,
        kind: payment.kind,
        businessName: paymentConfig.businessName,
        upiId: paymentConfig.upiId,
      });

      const kindLabel =
        payment.kind === "advance"
          ? "Advance payment"
          : payment.kind === "balance"
            ? "Balance payment"
            : "Payment";

      const messageText =
        body.customMessage?.trim() ||
        `Hi ${order.customerName}! 🌸\n\nHere is your payment request for Order #${order.orderNo} (${kindLabel}):\nAmount: ₹${payment.amount.toLocaleString("en-IN")}\n\n💳 Pay via Payment Link:\n${links.paymentUrl}\n\n📱 UPI ID: ${paymentConfig.upiId}\n\nOnce paid, please reply with your screenshot or UTR number so we can confirm right away. Thank you! - ${paymentConfig.businessName}`;

      const targetChannel = (order.channel as "whatsapp" | "instagram") || "whatsapp";
      const custConv = await findOrCreateCustomerConversation(businessId, order, targetChannel);
      const resolvedChannel = custConv?.channelType || targetChannel;
      const recipient =
        custConv?.customer?.handleOrPhone ||
        order.customerPhone ||
        order.customerName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const conversationId = custConv?.conversation?.id || null;

      let deliveryStatus: "sent" | "failed" = "sent";
      let metaMessageId: string | null = null;
      let errorMsg: string | null = null;

      try {
        const result = await sendMessage({
          channelType: resolvedChannel,
          recipient,
          text: messageText,
          businessId,
          conversationId,
        });
        metaMessageId = result.metaMessageId;
      } catch (err: unknown) {
        deliveryStatus = "failed";
        errorMsg = err instanceof Error ? err.message : String(err);
      }

      let createdMessage: typeof messages.$inferSelect | undefined;
      if (conversationId) {
        try {
          const [msg] = await db
            .insert(messages)
            .values({
              conversationId,
              businessId,
              direction: "outbound",
              senderType: "owner",
              content: messageText,
              deliveryStatus,
              metaMessageId,
              metadata: {
                orderId: order.id,
                orderNo: order.orderNo,
                paymentId: payment.id,
                amount: payment.amount,
                type: "payment_request",
              },
            })
            .returning();
          createdMessage = msg;
        } catch {}
      }

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: deliveryStatus === "sent" ? "payment_request_sent" : "payment_request_failed",
        details: {
          orderId: order.id,
          orderNo: order.orderNo,
          paymentId: payment.id,
          amount: payment.amount,
          channel: resolvedChannel,
          deliveryStatus,
          error: errorMsg,
        },
      });

      return {
        ok: deliveryStatus === "sent",
        sent: deliveryStatus === "sent",
        deliveryStatus,
        channel: resolvedChannel,
        messageId: createdMessage?.id,
        preview: messageText.slice(0, 120),
        error: errorMsg,
      };
    },
  );

  // 5. POST /payments/:id/mark-paid (Admin only)
  app.post(
    "/payments/:id/mark-paid",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };
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

        if (!row) {
          throw new AppError(404, "Payment not found", "NOT_FOUND");
        }

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

      if (!updated) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

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

      const summary = derivePaymentSummary(allPayments, await orderTotalFor(businessId, updated.orderId));

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

  // 6. POST /payments/:id/void (Admin only)
  app.post(
    "/payments/:id/void",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const { id: paymentId } = request.params as { id: string };
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

      if (!updated) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

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

      const summary = derivePaymentSummary(allPayments, await orderTotalFor(businessId, updated.orderId));

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

  // 7. PATCH /payments/:id (Admin only)
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

      if (!updated) {
        throw new AppError(404, "Payment not found", "NOT_FOUND");
      }

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
