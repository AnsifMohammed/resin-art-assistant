import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, customers, orderItems, orders } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";

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
  sendNotification: z.boolean().optional().default(false),
});

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
      };

      const conditions = [
        eq(orders.businessId, businessId),
        eq(orders.isDeleted, false),
      ];

      if (query.status && query.status !== "all") {
        conditions.push(eq(orders.status, query.status as OrderStatus));
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

      const results = orderList.map((o) => ({
        ...o,
        items: itemsByOrderId.get(o.id) || [],
      }));

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

      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, existing.id),
            eq(orderItems.isDeleted, false)
          )
        );

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
          notificationSent: sendNotification,
        },
      });

      return {
        ok: true,
        order: {
          ...updatedOrder,
          items,
        },
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

