// Customer segments shared by GET /customers and the broadcast audience.
//
// "Orders" always means the customer's orders rows with is_deleted = false and
// status <> 'cancelled'. Order stats come from one grouped subquery
// (orderStatsSubquery) that callers LEFT JOIN on customers.id, so a list query
// stays a single round trip.

import { and, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import {
  broadcastSegmentEnum,
  conversations,
  customers,
  escalations,
  orders,
} from "../db/schema.ts";

/** Customers created within this many days are "new". */
export const NEW_DAYS = 14;
/** Buyers whose latest order is older than this many days are "inactive". */
export const INACTIVE_DAYS = 90;

export type Segment = (typeof broadcastSegmentEnum.enumValues)[number];
export const SEGMENTS: readonly Segment[] = broadcastSegmentEnum.enumValues;

/** Segments a single customer can belong to (every customer is in "all"). */
export type CustomerSegment = Exclude<Segment, "all">;

export interface SegmentFilters {
  /** Case-insensitive exact match on the trimmed city. */
  city?: string | undefined;
  /** Exact match on customers.language. */
  language?: string | undefined;
  /** Exclude customers with any complaint/refund escalation. */
  excludeComplaints?: boolean | undefined;
}

/** Escalation reasons that count as a complaint for excludeComplaints. */
export const COMPLAINT_REASONS = ["intent_complaint", "intent_refund"] as const;

// Builds SQL without a db connection (and without the tests' fake db).
const qb = new QueryBuilder();

/**
 * Per-customer order stats for one business: ordersCount, totalSpend (numeric
 * as string), lastOrderAt. LEFT JOIN it on `orderStats.customerId = customers.id`;
 * customers without orders get NULLs (use ordersCountSql / totalSpendSql).
 */
export function orderStatsSubquery(businessId: string) {
  return qb
    .select({
      customerId: orders.customerId,
      ordersCount: sql<number>`count(*)::int`.as("orders_count"),
      totalSpend: sql<string>`sum(${orders.totalAmount})`.as("total_spend"),
      lastOrderAt: sql<Date>`max(${orders.createdAt})`.as("last_order_at"),
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.isDeleted, false),
        ne(orders.status, "cancelled"),
        isNotNull(orders.customerId),
      ),
    )
    .groupBy(orders.customerId)
    .as(ORDER_STATS);
}

const ORDER_STATS = "order_stats";

export type OrderStats = ReturnType<typeof orderStatsSubquery>;

// Drizzle renders subquery fields inside sql`` as the bare alias ("orders_count");
// qualify them so they can never clash with a column of another joined table.
// The OrderStats argument documents (and type-checks) that the join is present.
const statsColumn = (_s: OrderStats, name: "orders_count" | "total_spend" | "last_order_at") =>
  sql.raw(`"${ORDER_STATS}"."${name}"`);

export const ordersCountSql = (s: OrderStats) =>
  sql<number>`coalesce(${statsColumn(s, "orders_count")}, 0)`.mapWith(Number);
/** Rupees; numeric arrives as a string from the driver. */
export const totalSpendSql = (s: OrderStats) =>
  sql<number>`coalesce(${statsColumn(s, "total_spend")}, 0)`.mapWith(Number);
/** Decoded like orders.created_at (timestamp without time zone → Date). */
export const lastOrderAtSql = (s: OrderStats) =>
  sql<Date | null>`${statsColumn(s, "last_order_at")}`.mapWith(orders.createdAt);

const newSince = sql.raw(`(now() - interval '${NEW_DAYS} days')`);
const inactiveBefore = sql.raw(`(now() - interval '${INACTIVE_DAYS} days')`);

/** WHERE condition for one segment; undefined for "all". Needs the order stats join. */
export function segmentCondition(segment: Segment, stats: OrderStats): SQL | undefined {
  switch (segment) {
    case "all":
      return undefined;
    case "favourites":
      return eq(customers.isFavourite, true);
    case "priority":
      return eq(customers.isPriority, true);
    case "previous_buyers":
      return sql`${ordersCountSql(stats)} >= 1`;
    case "repeat_buyers":
      return sql`${ordersCountSql(stats)} >= 2`;
    case "never_ordered":
      return sql`${ordersCountSql(stats)} = 0`;
    case "new":
      return sql`${customers.createdAt} >= ${newSince}`;
    case "inactive":
      return sql`(${ordersCountSql(stats)} >= 1 and ${lastOrderAtSql(stats)} < ${inactiveBefore})`;
  }
}

/** Customer has an escalation (any state) with a complaint/refund reason. */
export function hasComplaintCondition(businessId: string): SQL {
  return sql`exists (select 1 from ${escalations}
    inner join ${conversations} on ${conversations.id} = ${escalations.conversationId}
    where ${conversations.customerId} = ${customers.id}
      and ${escalations.businessId} = ${businessId}
      and ${inArray(escalations.reason, [...COMPLAINT_REASONS])})`;
}

/** AND of the optional filters; undefined when none is set. */
export function filtersCondition(businessId: string, filters: SegmentFilters): SQL | undefined {
  const conditions: SQL[] = [];
  const city = filters.city?.trim();
  if (city) conditions.push(sql`lower(btrim(${customers.city})) = ${city.toLowerCase()}`);
  const language = filters.language?.trim();
  if (language) conditions.push(eq(customers.language, language));
  if (filters.excludeComplaints) conditions.push(sql`not ${hasComplaintCondition(businessId)}`);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Business scope + segment + filters (needs the order stats join). */
export function segmentWhere(
  businessId: string,
  segment: Segment,
  filters: SegmentFilters,
  stats: OrderStats,
): SQL {
  return and(
    eq(customers.businessId, businessId),
    segmentCondition(segment, stats),
    filtersCondition(businessId, filters),
  )!;
}

/** `count(*) filter (where <segment>)` per segment, for the counts in GET /customers. */
export function segmentCountsSelect(stats: OrderStats): Record<Segment, SQL<number>> {
  const out = {} as Record<Segment, SQL<number>>;
  for (const segment of SEGMENTS) {
    const cond = segmentCondition(segment, stats) ?? sql`true`;
    out[segment] = sql<number>`(count(*) filter (where ${cond}))::int`.mapWith(Number);
  }
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (v: Date | string | null | undefined): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v);

/** Which segments (besides "all") a customer belongs to. Mirrors segmentCondition. */
export function segmentsFor(
  c: {
    isFavourite: boolean;
    isPriority: boolean;
    createdAt: Date | string;
    ordersCount: number;
    lastOrderAt: Date | string | null;
  },
  now: Date = new Date(),
): CustomerSegment[] {
  const out: CustomerSegment[] = [];
  if (c.isFavourite) out.push("favourites");
  if (c.isPriority) out.push("priority");
  if (c.ordersCount >= 1) out.push("previous_buyers");
  if (c.ordersCount >= 2) out.push("repeat_buyers");
  const createdAt = toDate(c.createdAt);
  if (createdAt && createdAt.getTime() >= now.getTime() - NEW_DAYS * DAY_MS) out.push("new");
  if (c.ordersCount === 0) out.push("never_ordered");
  const lastOrderAt = toDate(c.lastOrderAt);
  if (c.ordersCount >= 1 && lastOrderAt && lastOrderAt.getTime() < now.getTime() - INACTIVE_DAYS * DAY_MS) {
    out.push("inactive");
  }
  return out;
}
