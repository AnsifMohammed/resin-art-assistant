import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  auditLog,
  channels,
  conversations,
  customers,
  messages,
  messageTemplates,
  orderItems,
  orders,
  payments,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { derivePaymentSummary } from "./payments.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { sendMessage } from "../services/send.ts";
import { renderTemplate } from "../lib/templates.ts";
import { emitConversationUpdated, emitMessageNew } from "../realtime/events.ts";
import { ensureDefaultProductionTemplates } from "./templates.ts";

const orderStatusEnumValues = [
  "pending",
  "confirmed",
  "in_production",
  "ready",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

type OrderStatus = (typeof orderStatusEnumValues)[number];

const orderItemInputSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(1, "Product name is required"),
  productDescription: z.string().optional().nullable(),
  quantity: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().nonnegative(),
  customizations: z.record(z.string(), z.unknown()).optional().default({}),
});

const createOrderSchema = z.object({
  orderNo: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  channel: z.enum(["whatsapp", "instagram"]).default("whatsapp"),
  status: z.enum(orderStatusEnumValues).default("pending"),
  shippingAddress: z.string().optional().nullable(),
  courier: z.string().optional().nullable(),
  trackingId: z.string().optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  deliveryCharge: z.coerce.number().nonnegative().optional().default(0),
  discountAmount: z.coerce.number().nonnegative().optional().default(0),
  items: z.array(orderItemInputSchema).min(1, "At least one item is required"),
});

const updateOrderSchema = z.object({
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  channel: z.enum(["whatsapp", "instagram"]).optional(),
  status: z.enum(orderStatusEnumValues).optional(),
  shippingAddress: z.string().optional().nullable(),
  courier: z.string().optional().nullable(),
  trackingId: z.string().optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  deliveryCharge: z.coerce.number().nonnegative().optional(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  items: z.array(orderItemInputSchema).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(orderStatusEnumValues),
  trackingId: z.string().optional().nullable(),
  courier: z.string().optional().nullable(),
  sendNotification: z.boolean().optional().default(true),
  customMessage: z.string().optional().nullable(),
});

export function deriveProductionInfo(order: typeof orders.$inferSelect) {
  if (order.status !== "in_production") {
    return {
      productionDays: 0,
      urgency: "normal" as const,
    };
  }
  const start = order.productionStartedAt || order.createdAt;
  const startTime = new Date(start).getTime();
  const days = isNaN(startTime) ? 0 : Math.max(0, Math.floor((Date.now() - startTime) / (1000 * 60 * 60 * 24)));
  const urgency = days >= 45 ? ("overdue" as const) : days >= 35 ? ("approaching" as const) : ("normal" as const);
  return {
    productionDays: days,
    urgency,
  };
}

export function computeOrderPlaceholders(
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect> = [],
  newStatus?: OrderStatus,
  trackingId?: string | null,
  courier?: string | null
): Record<string, string> {
  const currentStatus = newStatus || order.status;
  const statusLabels: Record<OrderStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    in_production: "In Production",
    ready: "Ready",
    dispatched: "Dispatched",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  const statusLabel = statusLabels[currentStatus] || currentStatus;

  const productName =
    items.length > 0
      ? items.map((it) => it.productName).join(", ")
      : "custom handmade resin art";

  const prodStart = order.productionStartedAt || order.createdAt;
  const prodStartTime = new Date(prodStart).getTime();
  const now = Date.now();
  const productionDays = isNaN(prodStartTime) ? 0 : Math.max(0, Math.floor((now - prodStartTime) / (1000 * 60 * 60 * 24)));

  const remainingDays = order.expectedDeliveryDate
    ? Math.max(0, Math.ceil((new Date(order.expectedDeliveryDate).getTime() - now) / (1000 * 60 * 60 * 24)))
    : Math.max(0, 45 - productionDays);

  const prodStartDateFormatted = !isNaN(prodStartTime)
    ? new Date(prodStartTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Recently";

  const expectedCompletionFormatted = order.expectedDeliveryDate
    ? new Date(order.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Soon";

  const track = trackingId || order.trackingId || "";
  const cour = courier || order.courier || "";

  return {
    CustomerName: order.customerName,
    customerName: order.customerName,
    OrderNumber: order.orderNo,
    orderNumber: order.orderNo,
    orderNo: order.orderNo,
    ProductName: productName,
    productName: productName,
    product: productName,
    ProductionStartDate: prodStartDateFormatted,
    productionStartDate: prodStartDateFormatted,
    ExpectedCompletionDate: expectedCompletionFormatted,
    expectedCompletionDate: expectedCompletionFormatted,
    deliveryDate: expectedCompletionFormatted,
    ProductionDays: String(productionDays),
    productionDays: String(productionDays),
    RemainingDays: String(remainingDays),
    remainingDays: String(remainingDays),
    CurrentStatus: statusLabel,
    currentStatus: statusLabel,
    status: statusLabel,
    trackingId: track,
    courier: cour,
  };
}

export async function findOrCreateCustomerConversation(
  businessId: string,
  order: typeof orders.$inferSelect,
  targetChannel?: "whatsapp" | "instagram"
): Promise<{ customer: typeof customers.$inferSelect; conversation: typeof conversations.$inferSelect; channelType: "whatsapp" | "instagram" } | null> {
  try {
    const channelType: "whatsapp" | "instagram" =
      targetChannel || (order.channel as "whatsapp" | "instagram") || "whatsapp";

    let customer: typeof customers.$inferSelect | undefined;
    if (order.customerId) {
      const [c] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, order.customerId), eq(customers.businessId, businessId)));
      customer = c;
    }

    if (!customer && order.customerPhone) {
      const [c] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.handleOrPhone, order.customerPhone), eq(customers.businessId, businessId)));
      customer = c;
    }

    if (!customer && order.customerName) {
      const [c] = await db
        .select()
        .from(customers)
        .where(and(ilike(customers.name, order.customerName), eq(customers.businessId, businessId)));
      customer = c;
    }

    const [matchedChannel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.businessId, businessId), eq(channels.type, channelType), eq(channels.status, "active")));

    const [fallbackChannel] = !matchedChannel
      ? await db.select().from(channels).where(eq(channels.businessId, businessId)).limit(1)
      : [matchedChannel];

    const channelId = matchedChannel?.id || fallbackChannel?.id || `ch_${channelType}_default`;

    if (!customer) {
      const handle =
        order.customerPhone || order.customerName.toLowerCase().replace(/[^a-z0-9_]/g, "_") || "customer";
      try {
        const [newCust] = await db
          .insert(customers)
          .values({
            businessId,
            channelId,
            name: order.customerName,
            handleOrPhone: handle,
          })
          .returning();
        customer = newCust;
        if (newCust) {
          await db.update(orders).set({ customerId: newCust.id }).where(eq(orders.id, order.id));
        }
      } catch {
        const [existing] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.handleOrPhone, handle), eq(customers.channelId, channelId)));
        customer = existing;
      }
    }

    if (!customer) return null;

    let [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.customerId, customer.id));

    if (!conv) {
      try {
        const [newConv] = await db
          .insert(conversations)
          .values({
            businessId,
            customerId: customer.id,
            channelId: customer.channelId || channelId,
            state: "owner_handling",
          })
          .returning();
        conv = newConv;
      } catch {
        const [existingConv] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.customerId, customer.id));
        conv = existingConv;
      }
    }

    if (!conv) return null;
    return { customer, conversation: conv, channelType };
  } catch {
    return null;
  }
}

async function findTemplateForStatus(
  businessId: string,
  status: OrderStatus,
  channelType?: "whatsapp" | "instagram"
): Promise<typeof messageTemplates.$inferSelect | null> {
  await ensureDefaultProductionTemplates(businessId);

  let templateName = "";
  if (status === "confirmed") {
    templateName = "Order confirmed";
  } else if (status === "in_production") {
    templateName = "Production Progress Update";
  } else if (status === "ready") {
    templateName = "Production Completion Update";
  } else if (status === "dispatched") {
    templateName = "Order dispatched";
  } else if (status === "delivered") {
    templateName = "Order delivered";
  }

  if (templateName) {
    const list = await db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.businessId, businessId),
          ilike(messageTemplates.name, templateName)
        )
      );
    if (list.length > 0) {
      const match = list.find((t) => !channelType || t.channel === "both" || t.channel === channelType);
      if (match) return match;
      return list[0]!;
    }
  }

  const allTemplates = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.businessId, businessId));

  const match = allTemplates.find((t) => {
    if (channelType && t.channel !== "both" && t.channel !== channelType) return false;
    const n = t.name.toLowerCase();
    if (status === "confirmed" && n.includes("confirm")) return true;
    if (status === "in_production" && (n.includes("progress") || t.category === "production_progress")) return true;
    if (status === "ready" && (n.includes("completion") || n.includes("ready"))) return true;
    if (status === "dispatched" && n.includes("dispatch")) return true;
    if (status === "delivered" && n.includes("deliver")) return true;
    return false;
  });

  return match || null;
}

export async function sendOrderStatusNotification({
  businessId,
  order,
  items = [],
  actorId,
  newStatus,
  trackingId,
  courier,
  customText,
}: {
  businessId: string;
  order: typeof orders.$inferSelect;
  items?: Array<typeof orderItems.$inferSelect> | undefined;
  actorId: string;
  newStatus: OrderStatus;
  trackingId?: string | null | undefined;
  courier?: string | null | undefined;
  customText?: string | null | undefined;
}): Promise<{
  sent: boolean;
  deliveryStatus: "sent" | "failed" | "skipped";
  channel: "whatsapp" | "instagram";
  messageId?: string | undefined;
  error?: string | undefined;
  preview?: string | undefined;
}> {
  const targetChannel: "whatsapp" | "instagram" = (order.channel as "whatsapp" | "instagram") || "whatsapp";
  let messageText = customText?.trim() || "";
  let template: typeof messageTemplates.$inferSelect | null = null;

  if (!messageText) {
    template = await findTemplateForStatus(businessId, newStatus, targetChannel);
    if (template) {
      if (!template.isActive) {
        try {
          await db.insert(auditLog).values({
            businessId,
            actorId,
            actorType: "admin",
            action: "order_notification_skipped",
            details: {
              orderId: order.id,
              orderNo: order.orderNo,
              status: newStatus,
              templateName: template.name,
              channel: targetChannel,
              reason: "template_inactive",
            },
          });
        } catch {}
        return {
          sent: false,
          deliveryStatus: "skipped",
          channel: targetChannel,
          error: `Template "${template.name}" is inactive. Automatic message was not sent.`,
        };
      }

      const placeholders = computeOrderPlaceholders(order, items, newStatus, trackingId, courier);
      const rendered = renderTemplate(template.body, placeholders);
      messageText = rendered.text;
    } else {
      const placeholders = computeOrderPlaceholders(order, items, newStatus, trackingId, courier);
      messageText = `Hi ${placeholders.CustomerName}! Your order #${placeholders.OrderNumber} status has been updated to ${placeholders.CurrentStatus}. Thank you for choosing Saba Art!`;
    }
  }

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
  } catch (err: any) {
    deliveryStatus = "failed";
    if (err instanceof AppError) {
      const metaMessage = (err.details as any)?.metaMessage;
      errorMsg = metaMessage ? `${err.message}: ${metaMessage}` : err.message;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    } else {
      errorMsg = String(err);
    }
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
          senderId: actorId,
          content: messageText,
          deliveryStatus,
          metaMessageId,
          metadata: {
            orderId: order.id,
            orderNo: order.orderNo,
            status: newStatus,
            templateId: template?.id || null,
            templateName: template?.name || null,
            channel: resolvedChannel,
            type: newStatus === "in_production" ? "production_progress" : "order_status_update",
            error: errorMsg,
          },
        })
        .returning();
      createdMessage = msg;
    } catch {}
  }

  try {
    await db.insert(auditLog).values({
      businessId,
      actorId,
      actorType: "admin",
      action: deliveryStatus === "sent" ? "order_notification_sent" : "order_notification_failed",
      details: {
        orderId: order.id,
        orderNo: order.orderNo,
        status: newStatus,
        messageId: createdMessage?.id,
        deliveryStatus,
        channel: resolvedChannel,
        error: errorMsg,
        preview: messageText.slice(0, 100),
      },
    });
  } catch {}

  if (createdMessage) {
    try {
      emitMessageNew(createdMessage);
      emitConversationUpdated(businessId, {
        conversationId: createdMessage.conversationId,
        state: "owner_handling",
        tag: "order_confirmed",
      });
    } catch {}
  }

  return {
    sent: deliveryStatus === "sent",
    deliveryStatus,
    channel: resolvedChannel,
    messageId: createdMessage?.id,
    error: errorMsg || undefined,
    preview: messageText,
  };
}

export const sendOrderStatusInstagramDm = sendOrderStatusNotification;

export const orderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /orders - List orders with status counts & search
  app.get(
    "/orders",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const query = request.query as {
        status?: string;
        search?: string;
        dueFrom?: string;
        dueTo?: string;
      };

      const conditions = [
        eq(orders.businessId, businessId),
        eq(orders.isDeleted, false),
      ];

      if (query.status && query.status !== "all") {
        conditions.push(eq(orders.status, query.status as OrderStatus));
      }

      if (query.dueFrom && query.dueFrom.trim()) {
        conditions.push(gte(orders.expectedDeliveryDate, query.dueFrom.trim()));
      }

      if (query.dueTo && query.dueTo.trim()) {
        conditions.push(lte(orders.expectedDeliveryDate, query.dueTo.trim()));
      }

      if (query.search && query.search.trim()) {
        const q = `%${query.search.trim()}%`;
        conditions.push(
          or(
            ilike(orders.orderNo, q),
            ilike(orders.customerName, q),
            ilike(orders.customerPhone, q),
            ilike(orders.shippingAddress, q),
            ilike(orders.trackingId, q)
          )!
        );
      }

      const orderList = await db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

      // Fetch items for all matching orders
      const orderIds = orderList.map((o) => o.id);
      const items =
        orderIds.length > 0
          ? await db
              .select()
              .from(orderItems)
              .where(
                and(
                  inArray(orderItems.orderId, orderIds),
                  eq(orderItems.isDeleted, false)
                )
              )
          : [];

      const itemsByOrderId = new Map<string, typeof items>();
      for (const item of items) {
        const list = itemsByOrderId.get(item.orderId) || [];
        list.push(item);
        itemsByOrderId.set(item.orderId, list);
      }

      // Fetch payments for all matching orders in one query
      const allPayments =
        orderIds.length > 0
          ? await db
              .select()
              .from(payments)
              .where(inArray(payments.orderId, orderIds))
          : [];

      const paymentsByOrderId = new Map<string, typeof allPayments>();
      for (const p of allPayments) {
        const list = paymentsByOrderId.get(p.orderId) || [];
        list.push(p);
        paymentsByOrderId.set(p.orderId, list);
      }

      // Calculate status counts for all orders of this business
      const allBusinessOrders = await db
        .select({
          status: orders.status,
          count: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        )
        .groupBy(orders.status);

      const statusCounts: Record<OrderStatus | "all", number> = {
        all: 0,
        pending: 0,
        confirmed: 0,
        in_production: 0,
        ready: 0,
        dispatched: 0,
        delivered: 0,
        cancelled: 0,
      };

      let totalAll = 0;
      for (const row of allBusinessOrders) {
        statusCounts[row.status] = row.count;
        totalAll += row.count;
      }
      statusCounts.all = totalAll;

      const results = orderList.map((o) => {
        const orderPayments = paymentsByOrderId.get(o.id) || [];
        return {
          ...o,
          items: itemsByOrderId.get(o.id) || [],
          paymentSummary: derivePaymentSummary(orderPayments, Math.round(Number(o.totalAmount))),
          ...deriveProductionInfo(o),
        };
      });

      return {
        orders: results,
        statusCounts,
        total: results.length,
      };
    }
  );

  // GET /orders/:id - Get single order with items
  app.get(
    "/orders/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, order.id),
            eq(orderItems.isDeleted, false)
          )
        );

      return {
        order: {
          ...order,
          items,
          ...deriveProductionInfo(order),
        },
      };
    }
  );

  // POST /orders - Create order (Admin only)
  app.post(
    "/orders",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const businessId = request.user.businessId;
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const data = parsed.data;

      // Auto-generate order number if omitted or ensure uniqueness
      let orderNo = data.orderNo?.trim();
      if (!orderNo) {
        const existingOrderNos = await db
          .select({ orderNo: orders.orderNo })
          .from(orders)
          .where(eq(orders.businessId, businessId));

        let maxNum = 1047;
        for (const row of existingOrderNos) {
          const match = row.orderNo.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
        orderNo = `SA-${maxNum + 1}`;
      }

      // Ensure unique order number without collisions
      let attempts = 0;
      let candidateOrderNo = orderNo;
      while (attempts < 50) {
        const [existing] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.businessId, businessId),
              eq(orders.orderNo, candidateOrderNo)
            )
          );
        if (!existing) break;

        if (data.orderNo?.trim()) {
          throw new AppError(400, `Order number "${orderNo}" already exists`, "ORDER_EXISTS");
        }

        const match = candidateOrderNo.match(/^(.*?)(\d+)$/);
        if (match && match[1] !== undefined && match[2] !== undefined) {
          const prefix = match[1];
          const num = parseInt(match[2], 10) + 1;
          candidateOrderNo = `${prefix}${num}`;
        } else {
          candidateOrderNo = `${candidateOrderNo}-${attempts + 1}`;
        }
        attempts++;
      }
      orderNo = candidateOrderNo;

      // Verify customerId if provided (must reference a real customer row, or null)
      const cleanCustomerId = data.customerId?.trim() || null;
      let validCustomerId: string | null = null;
      if (cleanCustomerId) {
        const [cust] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, cleanCustomerId));
        if (cust) {
          validCustomerId = cust.id;
        }
      }

      // Compute subtotal and total
      const subtotal = data.items.reduce(
        (sum, it) => sum + it.quantity * it.unitPrice,
        0
      );
      const deliveryCharge = data.deliveryCharge ?? 0;
      const discountAmount = data.discountAmount ?? 0;
      const totalAmount = Math.max(0, subtotal + deliveryCharge - discountAmount);

      let createdOrder: typeof orders.$inferSelect | undefined;
      let createdItems: (typeof orderItems.$inferSelect)[] = [];
      try {
        const [insertedOrder] = await db
          .insert(orders)
          .values({
            businessId,
            orderNo,
            customerId: validCustomerId,
            customerName: data.customerName.trim(),
            customerPhone: data.customerPhone?.trim() || null,
            customerEmail: data.customerEmail?.trim() || null,
            channel: data.channel,
            status: data.status,
            subtotal: subtotal.toFixed(2),
            deliveryCharge: deliveryCharge.toFixed(2),
            discountAmount: discountAmount.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
            shippingAddress: data.shippingAddress?.trim() || null,
            courier: data.courier?.trim() || null,
            trackingId: data.trackingId?.trim() || null,
            expectedDeliveryDate: data.expectedDeliveryDate?.trim() || null,
            customerNotes: data.customerNotes?.trim() || null,
            internalNotes: data.internalNotes?.trim() || null,
            productionStartedAt: data.status === "in_production" ? new Date() : null,
          })
          .returning();

        if (!insertedOrder) {
          throw new AppError(500, "Failed to create order", "INTERNAL_ERROR");
        }
        createdOrder = insertedOrder;

        createdItems = await db
          .insert(orderItems)
          .values(
            data.items.map((it) => ({
              orderId: insertedOrder.id,
              productId: it.productId?.trim() || null,
              productName: it.productName.trim(),
              productDescription: it.productDescription?.trim() || null,
              quantity: it.quantity,
              unitPrice: it.unitPrice.toFixed(2),
              customizations: it.customizations ?? {},
            }))
          )
          .returning();
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        if (err?.code === "23505") {
          throw new AppError(400, `An order with number "${orderNo}" already exists`, "ORDER_EXISTS");
        }
        throw new AppError(500, err?.message || "Failed to create order", "INTERNAL_ERROR");
      }

      if (!createdOrder) {
        throw new AppError(500, "Failed to create order", "INTERNAL_ERROR");
      }

      // Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "order_created",
        details: {
          orderId: createdOrder.id,
          orderNo: createdOrder.orderNo,
          customerName: createdOrder.customerName,
          total: totalAmount,
        },
      });

      reply.status(201);
      return {
        ok: true,
        order: {
          ...createdOrder,
          items: createdItems,
        },
      };
    }
  );

  // PATCH /orders/:id - Update order details (Admin only)
  app.patch(
    "/orders/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const parsed = updateOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const [existing] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!existing) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const data = parsed.data;
      const updateData: Partial<typeof orders.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (data.customerName !== undefined) updateData.customerName = data.customerName;
      if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
      if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail;
      if (data.channel !== undefined) updateData.channel = data.channel;
      if (data.shippingAddress !== undefined) updateData.shippingAddress = data.shippingAddress;
      if (data.courier !== undefined) updateData.courier = data.courier;
      if (data.trackingId !== undefined) updateData.trackingId = data.trackingId;
      if (data.expectedDeliveryDate !== undefined) updateData.expectedDeliveryDate = data.expectedDeliveryDate;
      if (data.customerNotes !== undefined) updateData.customerNotes = data.customerNotes;
      if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;
      if (data.deliveryCharge !== undefined) updateData.deliveryCharge = data.deliveryCharge.toFixed(2);
      if (data.discountAmount !== undefined) updateData.discountAmount = data.discountAmount.toFixed(2);

      if (data.status !== undefined) {
        updateData.status = data.status;
        if (data.status === "in_production" && !existing.productionStartedAt) {
          updateData.productionStartedAt = new Date();
        }
        if (data.status === "dispatched" && !existing.dispatchedAt) {
          updateData.dispatchedAt = new Date();
        }
        if (data.status === "delivered" && !existing.deliveredAt) {
          updateData.deliveredAt = new Date();
        }
      }

      // If items are provided, replace them and recalculate subtotal & total
      let updatedItems = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, existing.id),
            eq(orderItems.isDeleted, false)
          )
        );

      if (data.items && data.items.length > 0) {
        // Soft delete old items
        await db
          .update(orderItems)
          .set({ isDeleted: true, deletedAt: new Date() })
          .where(eq(orderItems.orderId, existing.id));

        // Insert new items
        updatedItems = await db
          .insert(orderItems)
          .values(
            data.items.map((it) => ({
              orderId: existing.id,
              productId: it.productId ?? null,
              productName: it.productName,
              productDescription: it.productDescription ?? null,
              quantity: it.quantity,
              unitPrice: it.unitPrice.toFixed(2),
              customizations: it.customizations ?? {},
            }))
          )
          .returning();

        const subtotal = data.items.reduce(
          (sum, it) => sum + it.quantity * it.unitPrice,
          0
        );
        const delCharge = data.deliveryCharge ?? Number(existing.deliveryCharge);
        const discAmount = data.discountAmount ?? Number(existing.discountAmount);
        const totalAmount = Math.max(0, subtotal + delCharge - discAmount);

        updateData.subtotal = subtotal.toFixed(2);
        updateData.totalAmount = totalAmount.toFixed(2);
      } else if (data.deliveryCharge !== undefined || data.discountAmount !== undefined) {
        const subtotal = Number(existing.subtotal);
        const delCharge = data.deliveryCharge ?? Number(existing.deliveryCharge);
        const discAmount = data.discountAmount ?? Number(existing.discountAmount);
        updateData.totalAmount = Math.max(0, subtotal + delCharge - discAmount).toFixed(2);
      }

      const [updatedOrder] = await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, existing.id))
        .returning();

      // Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "order_updated",
        details: {
          orderId: existing.id,
          orderNo: existing.orderNo,
          updatedFields: Object.keys(updateData),
        },
      });

      return {
        ok: true,
        order: {
          ...updatedOrder,
          items: updatedItems,
        },
      };
    }
  );

  // POST /orders/:id/status - Update order status with optional notification (Admin only)
  app.post(
    "/orders/:id/status",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const parsed = updateStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const [existing] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!existing) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const { status, trackingId, courier, sendNotification } = parsed.data;

      const updateData: Partial<typeof orders.$inferInsert> = {
        status,
        updatedAt: new Date(),
      };

      if (trackingId) updateData.trackingId = trackingId;
      if (courier) updateData.courier = courier;
      if (status === "in_production" && !existing.productionStartedAt) {
        updateData.productionStartedAt = new Date();
      }
      if (status === "dispatched" && !existing.dispatchedAt) {
        updateData.dispatchedAt = new Date();
      }
      if (status === "delivered" && !existing.deliveredAt) {
        updateData.deliveredAt = new Date();
      }

      const [updatedOrder] = await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, existing.id))
        .returning();

      if (!updatedOrder) {
        throw new AppError(500, "Failed to update order", "INTERNAL_ERROR");
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, existing.id),
            eq(orderItems.isDeleted, false)
          )
        );

      // Send notification if order status changed and notification not suppressed
      let notificationResult: {
        sent: boolean;
        deliveryStatus: "sent" | "failed" | "skipped";
        channel?: "whatsapp" | "instagram";
        messageId?: string | undefined;
        error?: string | undefined;
        preview?: string | undefined;
      } = {
        sent: false,
        deliveryStatus: "skipped",
      };

      if (sendNotification !== false && existing.status !== status) {
        notificationResult = await sendOrderStatusNotification({
          businessId,
          order: updatedOrder,
          items,
          actorId: request.user.sub,
          newStatus: status,
          trackingId: trackingId || updatedOrder.trackingId,
          courier: courier || updatedOrder.courier,
          customText: parsed.data.customMessage ?? null,
        });
      }

      // Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "order_status_changed",
        details: {
          orderId: existing.id,
          orderNo: existing.orderNo,
          fromStatus: existing.status,
          toStatus: status,
          notificationSent: notificationResult.sent,
          notificationStatus: notificationResult.deliveryStatus,
        },
      });

      return {
        ok: true,
        order: {
          ...updatedOrder,
          items,
          ...deriveProductionInfo(updatedOrder),
        },
        notification: notificationResult,
      };
    }
  );

  // GET /orders/:id/messages - Get communication history for an order
  app.get(
    "/orders/:id/messages",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      // Find messages linked by metadata.orderId
      const orderMsgs = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.businessId, businessId),
            sql`(${messages.metadata}->>'orderId') = ${id}`
          )
        )
        .orderBy(desc(messages.createdAt));

      return {
        orderId: id,
        messages: orderMsgs,
      };
    }
  );

  // POST /orders/:id/progress-update - Send manual or template production progress update via Instagram
  app.post(
    "/orders/:id/progress-update",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const parsed = z
        .object({
          templateId: z.string().optional().nullable(),
          text: z.string().min(1, "Message content is required"),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR", parsed.error.issues);
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, order.id),
            eq(orderItems.isDeleted, false)
          )
        );

      if (parsed.data.templateId) {
        const [tpl] = await db
          .select()
          .from(messageTemplates)
          .where(
            and(
              eq(messageTemplates.id, parsed.data.templateId),
              eq(messageTemplates.businessId, businessId)
            )
          );
        if (tpl && !tpl.isActive) {
          throw new AppError(400, "Cannot use an inactive template for progress updates", "TEMPLATE_INACTIVE");
        }
      }

      const result = await sendOrderStatusNotification({
        businessId,
        order,
        items,
        actorId: request.user.sub,
        newStatus: order.status,
        customText: parsed.data.text,
      });

      return {
        ok: result.sent,
        deliveryStatus: result.deliveryStatus,
        channel: result.channel,
        messageId: result.messageId,
        error: result.error,
        preview: result.preview,
      };
    }
  );

  // POST /orders/:id/retry-notification/:messageId - Retry a failed notification
  app.post(
    "/orders/:id/retry-notification/:messageId",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id, messageId } = request.params as { id: string; messageId: string };
      const businessId = request.user.businessId;

      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!order) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      const [msg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, messageId),
            eq(messages.businessId, businessId)
          )
        );

      if (!msg) {
        throw new AppError(404, "Message not found", "NOT_FOUND");
      }

      const targetChannel: "whatsapp" | "instagram" =
        ((msg.metadata as any)?.channel as "whatsapp" | "instagram") ||
        (order.channel as "whatsapp" | "instagram") ||
        "whatsapp";

      const custConv = await findOrCreateCustomerConversation(businessId, order, targetChannel);
      const recipient =
        custConv?.customer?.handleOrPhone ||
        order.customerPhone ||
        order.customerName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

      let deliveryStatus: "sent" | "failed" = "sent";
      let metaMessageId: string | null = null;
      let errorMsg: string | null = null;

      try {
        const res = await sendMessage({
          channelType: targetChannel,
          recipient,
          text: msg.content || "",
          businessId,
          conversationId: msg.conversationId,
        });
        metaMessageId = res.metaMessageId;
      } catch (err: any) {
        deliveryStatus = "failed";
        if (err instanceof AppError) {
          const metaMessage = (err.details as any)?.metaMessage;
          errorMsg = metaMessage ? `${err.message}: ${metaMessage}` : err.message;
        } else if (err instanceof Error) {
          errorMsg = err.message;
        } else {
          errorMsg = String(err);
        }
      }

      const [updated] = await db
        .update(messages)
        .set({
          deliveryStatus,
          metaMessageId,
          metadata: {
            ...((msg.metadata as any) || {}),
            channel: targetChannel,
            retriedAt: new Date(),
            error: errorMsg,
          },
        })
        .where(eq(messages.id, msg.id))
        .returning();

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: deliveryStatus === "sent" ? "order_notification_retried_success" : "order_notification_retried_failed",
        details: {
          orderId: order.id,
          messageId: msg.id,
          channel: targetChannel,
          deliveryStatus,
          error: errorMsg,
        },
      });

      if (updated) {
        emitMessageNew(updated);
      }

      return {
        ok: deliveryStatus === "sent",
        deliveryStatus,
        channel: targetChannel,
        message: updated,
        error: errorMsg || undefined,
      };
    }
  );

  // DELETE /orders/:id - Soft delete order (Admin only)
  app.delete(
    "/orders/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params as { id: string };
      const businessId = request.user.businessId;

      const [existing] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, id),
            eq(orders.businessId, businessId),
            eq(orders.isDeleted, false)
          )
        );

      if (!existing) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }

      await db
        .update(orders)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: request.user.sub,
        })
        .where(eq(orders.id, existing.id));

      await db
        .update(orderItems)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: request.user.sub,
        })
        .where(eq(orderItems.orderId, existing.id));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "order_cancelled",
        details: {
          orderId: existing.id,
          orderNo: existing.orderNo,
          customerName: existing.customerName,
        },
      });

      return {
        ok: true,
        id: existing.id,
      };
    }
  );
};

