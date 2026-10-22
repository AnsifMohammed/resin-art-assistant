import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, broadcastSegmentEnum, channels, conversations, customers, orderItems, orders } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import {
  lastOrderAtSql,
  orderStatsSubquery,
  ordersCountSql,
  segmentCountsSelect,
  segmentsFor,
  segmentWhere,
  totalSpendSql,
  type OrderStats,
  type Segment,
} from "../lib/segments.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { emitCustomerUpdated } from "../realtime/events.ts";

type CustomerRow = typeof customers.$inferSelect;

const listQuerySchema = z.object({
  segment: z.enum(broadcastSegmentEnum.enumValues).default("all"),
  // Empty search is ignored rather than rejected.
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  city: z.string().trim().max(80).optional().transform((v) => v || undefined),
  language: z.string().trim().max(40).optional().transform((v) => v || undefined),
  channel: z.enum(["whatsapp", "instagram"]).optional(),
  sort: z.enum(["recent", "spend", "orders", "name"]).default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v));

const patchSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).nullable(),
  city: nullableText(80),
  notes: nullableText(2000),
  isFavourite: z.boolean(),
  isPriority: z.boolean(),
  optedOut: z.boolean(),
}).partial();

function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      400,
      message,
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** Escape LIKE wildcards so user input matches literally. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, "\\$&");

const qb = new QueryBuilder();

/** Latest conversation per customer (LATERAL join on the outer customers row). */
const latestConversation = () =>
  qb
    .select({
      id: conversations.id,
      state: conversations.state,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .where(eq(conversations.customerId, customers.id))
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.createdAt))
    .limit(1)
    .as("latest_conv");

/** Fields for CustomerListItem: customer + channel + latest conversation + order stats. */
function itemFields(stats: OrderStats, latest: ReturnType<typeof latestConversation>) {
  return {
    customer: customers,
    channelType: channels.type,
    conversationId: latest.id,
    conversationState: latest.state,
    lastMessageAt: latest.lastMessageAt,
    ordersCount: ordersCountSql(stats),
    totalSpend: totalSpendSql(stats),
    lastOrderAt: lastOrderAtSql(stats),
  };
}

interface ItemRow {
  customer: CustomerRow;
  channelType: "whatsapp" | "instagram" | null;
  conversationId: string | null;
  conversationState: string | null;
  lastMessageAt: Date | null;
  ordersCount: number | null;
  totalSpend: number | string | null;
  lastOrderAt: Date | null;
}

/** Public CustomerListItem shape (docs/contracts.md, "Customers"). */
export function toCustomerItem(row: ItemRow, now: Date = new Date()) {
  const c = row.customer;
  const ordersCount = Number(row.ordersCount ?? 0);
  const lastOrderAt = row.lastOrderAt ?? null;
  return {
    id: c.id,
    name: c.name,
    handleOrPhone: c.handleOrPhone,
    channel: (row.channelType ?? "whatsapp") as "whatsapp" | "instagram",
    city: c.city ?? null,
    language: c.language ?? null,
    notes: c.notes ?? null,
    isFavourite: Boolean(c.isFavourite),
    isPriority: Boolean(c.isPriority),
    optedOut: Boolean(c.optedOut),
    optedOutAt: c.optedOutAt ?? null,
    createdAt: c.createdAt,
    conversationId: row.conversationId ?? null,
    conversationState: row.conversationState ?? null,
    lastMessageAt: row.lastMessageAt ?? null,
    ordersCount,
    totalSpend: Number(row.totalSpend ?? 0),
    lastOrderAt,
    segments: segmentsFor(
      {
        isFavourite: Boolean(c.isFavourite),
        isPriority: Boolean(c.isPriority),
        createdAt: c.createdAt,
        ordersCount,
        lastOrderAt,
      },
      now,
    ),
  };
}

const ORDER_BY: Record<"recent" | "spend" | "orders" | "name", (s: OrderStats, l: ReturnType<typeof latestConversation>) => SQL[]> = {
  recent: (_s, l) => [sql`${l.lastMessageAt} desc nulls last`, desc(customers.createdAt), asc(customers.id)],
  spend: (s) => [sql`${totalSpendSql(s)} desc`, desc(customers.createdAt), asc(customers.id)],
  orders: (s) => [sql`${ordersCountSql(s)} desc`, desc(customers.createdAt), asc(customers.id)],
  name: () => [sql`${customers.name} asc nulls last`, asc(customers.id)],
};

/** One customer as a CustomerListItem, or 404. */
async function loadCustomerItem(id: string, businessId: string) {
  const stats = orderStatsSubquery(businessId);
  const latest = latestConversation();
  const [row] = await db
    .select(itemFields(stats, latest))
    .from(customers)
    .leftJoin(channels, eq(channels.id, customers.channelId))
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .leftJoinLateral(latest, sql`true`)
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
  if (!row) throw new AppError(404, "Customer not found", "NOT_FOUND");
  return toCustomerItem(row as ItemRow);
}

async function findCustomer(id: string, businessId: string): Promise<CustomerRow> {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
  if (!row) throw new AppError(404, "Customer not found", "NOT_FOUND");
  return row;
}

export const customerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /customers - Admin only. Paged list + per-segment counts.
  app.get("/customers", { preHandler: [authenticate, requireAdmin] }, async (request) => {
    const q = parseOrThrow(listQuerySchema, request.query, "Invalid query parameters");
    const businessId = request.user.businessId;
    const stats = orderStatsSubquery(businessId);
    const latest = latestConversation();

    const conditions: SQL[] = [segmentWhere(businessId, q.segment, { city: q.city, language: q.language }, stats)];
    if (q.channel) conditions.push(eq(channels.type, q.channel));
    if (q.search) {
      const pattern = `%${escapeLike(q.search)}%`;
      conditions.push(
        or(
          sql`${customers.name} ilike ${pattern}`,
          sql`${customers.handleOrPhone} ilike ${pattern}`,
          sql`${customers.city} ilike ${pattern}`,
        )!,
      );
    }
    const where = and(...conditions);

    const [rows, totalRows, countRows] = await Promise.all([
      db
        .select(itemFields(stats, latest))
        .from(customers)
        .leftJoin(channels, eq(channels.id, customers.channelId))
        .leftJoin(stats, eq(stats.customerId, customers.id))
        .leftJoinLateral(latest, sql`true`)
        .where(where)
        .orderBy(...ORDER_BY[q.sort](stats, latest))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(customers)
        .leftJoin(channels, eq(channels.id, customers.channelId))
        .leftJoin(stats, eq(stats.customerId, customers.id))
        .where(where),
      // Per-segment totals for the whole business (search and filters are not applied).
      db
        .select(segmentCountsSelect(stats))
        .from(customers)
        .leftJoin(stats, eq(stats.customerId, customers.id))
        .where(eq(customers.businessId, businessId)),
    ]);

    const now = new Date();
    const countsRow = (countRows[0] ?? {}) as Partial<Record<Segment, number>>;
    const counts = Object.fromEntries(
      broadcastSegmentEnum.enumValues.map((s) => [s, Number(countsRow[s] ?? 0)]),
    ) as Record<Segment, number>;

    return {
      customers: rows.map((r) => toCustomerItem(r as ItemRow, now)),
      pagination: { page: q.page, limit: q.limit, total: Number(totalRows[0]?.count ?? 0) },
      counts,
    };
  });

  // GET /customers/:id - Admin only
  app.get<{ Params: { id: string } }>(
    "/customers/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => ({ customer: await loadCustomerItem(request.params.id, request.user.businessId) }),
  );

  // PATCH /customers/:id - Admin only. Profile, segment flags and opt-out.
  app.patch<{ Params: { id: string } }>(
    "/customers/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const input = parseOrThrow(patchSchema, request.body ?? {}, "Invalid customer payload");
      const businessId = request.user.businessId;
      const existing = await findCustomer(request.params.id, businessId);

      const set: Partial<CustomerRow> = {};
      const changed: string[] = [];
      for (const key of ["name", "city", "notes", "isFavourite", "isPriority"] as const) {
        const value = input[key];
        if (value === undefined || value === existing[key]) continue;
        (set as Record<string, unknown>)[key] = value;
        changed.push(key);
      }

      const optChange =
        input.optedOut !== undefined && input.optedOut !== existing.optedOut ? input.optedOut : undefined;
      if (optChange !== undefined) {
        Object.assign(
          set,
          optChange
            ? { optedOut: true, optedOutAt: new Date(), optOutSource: "admin" }
            : { optedOut: false, optedOutAt: null, optOutSource: null },
        );
        changed.push("optedOut");
      }

      if (changed.length > 0) {
        const [updated] = await db
          .update(customers)
          .set(set)
          .where(and(eq(customers.id, existing.id), eq(customers.businessId, businessId)))
          .returning({ id: customers.id });
        if (!updated) throw new AppError(404, "Customer not found", "NOT_FOUND");

        const audit = (action: string, details: Record<string, unknown>) =>
          db.insert(auditLog).values({
            businessId,
            actorId: request.user.sub,
            actorType: request.user.role,
            action,
            details: { customerId: existing.id, ...details },
          });

        const profileFields = changed.filter((f) => f !== "optedOut");
        if (profileFields.length > 0) await audit("customer_updated", { fields: profileFields });
        if (optChange !== undefined) {
          await audit(optChange ? "customer_opted_out" : "customer_opted_in", { source: "admin" });
        }

        emitCustomerUpdated(businessId, { customerId: existing.id });
      }

      return { customer: await loadCustomerItem(existing.id, businessId) };
    },
  );

  // GET /customers/:id/orders - Admin only. Newest first, deleted orders excluded.
  app.get<{ Params: { id: string } }>(
    "/customers/:id/orders",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const customer = await findCustomer(request.params.id, businessId);

      const rows = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          status: orders.status,
          totalAmount: orders.totalAmount,
          createdAt: orders.createdAt,
          itemsCount: sql<number>`(select count(*)::int from ${orderItems}
            where ${orderItems.orderId} = ${orders.id} and ${orderItems.isDeleted} = false)`.mapWith(Number),
        })
        .from(orders)
        .where(
          and(eq(orders.businessId, businessId), eq(orders.customerId, customer.id), eq(orders.isDeleted, false)),
        )
        .orderBy(desc(orders.createdAt));

      return {
        orders: rows.map((o) => ({
          id: o.id,
          orderNo: o.orderNo,
          status: o.status,
          totalAmount: Number(o.totalAmount ?? 0),
          createdAt: o.createdAt,
          itemsCount: Number(o.itemsCount ?? 0),
        })),
      };
    },
  );
};
