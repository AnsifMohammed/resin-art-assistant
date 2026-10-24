import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, gte, isNull, lt, lte, ne, sql, type AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  channels,
  conversations,
  escalations,
  messages,
  orderItems,
  orders,
  payments,
  products,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";

const analyticsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  channel: z.enum(["whatsapp", "instagram"]).optional(),
});

type ChannelType = "whatsapp" | "instagram";

/** Order statuses that count as a confirmed sale. */
const CONFIRMED_STATUSES = ["confirmed", "in_production", "ready", "dispatched", "delivered"] as const;

/** IST is UTC+5:30 all year (no DST), so a fixed offset is exact. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_SOON_MS = 2 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of a timestamp column in Asia/Kolkata (columns store UTC without zone). */
const istDay = (col: AnyColumn) =>
  sql<string>`to_char((${col} at time zone 'UTC') at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`;

const istDateKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Every IST calendar day touched by [from, to], inclusive. */
export function istDaysInRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  const last = istDateKey(to);
  let cursor = Date.parse(`${istDateKey(from)}T00:00:00Z`);
  for (let i = 0; i < 1000; i++) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    if (key > last) break;
    days.push(key);
    cursor += DAY_MS;
  }
  return days;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** Money in whole rupees. */
const rupees = (v: unknown): number => Math.round(num(v));
const rate = (part: number, whole: number): number => (whole > 0 ? Number((part / whole).toFixed(4)) : 0);

export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const trend = (current: number, previous: number) => ({ current, previous, changePct: changePct(current, previous) });

export const analyticsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    "/analytics",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const parsed = analyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "Invalid query parameters", "VALIDATION_ERROR");
      }

      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 7 * DAY_MS).toISOString();
      const from = parsed.data.from || defaultFrom;
      const to = parsed.data.to || now.toISOString();
      const channel: ChannelType | undefined = parsed.data.channel;

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (fromDate.getTime() > toDate.getTime()) {
        throw new AppError(400, "`from` must be before `to`", "VALIDATION_ERROR");
      }
      // Previous period of equal length, ending where this one starts: [prevFrom, from).
      const prevFromDate = new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime()));
      const businessId = request.user.businessId;

      // ── Channel filters (only when ?channel= is set) ─────────────────────────
      const conversationIdsOfChannel = (type: ChannelType) =>
        sql`(select ${conversations.id} from ${conversations} inner join ${channels} on ${channels.id} = ${conversations.channelId} where ${conversations.businessId} = ${businessId} and ${channels.type} = ${type})`;
      const msgChannel = channel ? [sql`${messages.conversationId} in ${conversationIdsOfChannel(channel)}`] : [];
      const escChannel = channel ? [sql`${escalations.conversationId} in ${conversationIdsOfChannel(channel)}`] : [];
      const convChannel = channel
        ? [sql`${conversations.channelId} in (select ${channels.id} from ${channels} where ${channels.businessId} = ${businessId} and ${channels.type} = ${channel})`]
        : [];
      const orderChannel = channel ? [eq(orders.channel, channel)] : [];

      // ── Base conditions ──────────────────────────────────────────────────────
      const msgIn = (start: Date, end: Date, endInclusive: boolean, filtered = true) => [
        eq(messages.businessId, businessId),
        gte(messages.createdAt, start),
        endInclusive ? lte(messages.createdAt, end) : lt(messages.createdAt, end),
        ...(filtered ? msgChannel : []),
      ];
      const escIn = (start: Date, end: Date, endInclusive: boolean) => [
        eq(escalations.businessId, businessId),
        gte(escalations.createdAt, start),
        endInclusive ? lte(escalations.createdAt, end) : lt(escalations.createdAt, end),
        ...escChannel,
      ];
      /** Non-deleted, non-cancelled orders created in the window (a "sale"). */
      const salesIn = (start: Date, end: Date, endInclusive: boolean, filtered = true) => [
        eq(orders.businessId, businessId),
        eq(orders.isDeleted, false),
        ne(orders.status, "cancelled"),
        gte(orders.createdAt, start),
        endInclusive ? lte(orders.createdAt, end) : lt(orders.createdAt, end),
        ...(filtered ? orderChannel : []),
      ];

      const confirmedList = sql.join(CONFIRMED_STATUSES.map((s) => sql`${s}`), sql`, `);
      const orderTotals = {
        revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::float8`,
        orders: sql<number>`count(*)::int`,
        confirmed: sql<number>`count(*) filter (where ${orders.status} in (${confirmedList}))::int`,
      };
      const escTotals = {
        totalEscalations: sql<number>`count(*)::int`,
        avgResolutionSeconds: sql<number | null>`avg(extract(epoch from (${escalations.resolvedAt} - ${escalations.createdAt}))) filter (where ${escalations.resolvedAt} is not null)::int`,
      };
      const msgDayExpr = istDay(messages.createdAt);
      const orderDayExpr = istDay(orders.createdAt);
      const paidForOrder = sql`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.status} = 'paid')`;
      const productRevenue = sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}), 0)::float8`;

      const [
        msgStatsRows,
        prevMsgRows,
        msgDailyRows,
        msgByChannelRows,
        escStatsRows,
        prevEscRows,
        reasonRows,
        orderRows,
        prevOrderRows,
        orderDailyRows,
        orderByChannelRows,
        topProductRows,
        openEscRows,
        windowRows,
        orderStateRows,
      ] = await Promise.all([
        // Messages in range: totals, replies by sender, delivery outcomes
        db
          .select({
            total: sql<number>`count(*)::int`,
            inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
            outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
            autoReplies: sql<number>`count(*) filter (where ${messages.senderType} = 'ai')::int`,
            sentByAi: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.senderType} = 'ai')::int`,
            sentByOwner: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.senderType} = 'owner')::int`,
            sentByStaff: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.senderType} = 'staff')::int`,
            sentBySystem: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.senderType} = 'system')::int`,
            deliveryFailed: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.deliveryStatus} = 'failed')::int`,
            deliveryRead: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.deliveryStatus} = 'read')::int`,
          })
          .from(messages)
          .where(and(...msgIn(fromDate, toDate, true))),

        // Messages in previous period
        db
          .select({
            prevTotal: sql<number>`count(*)::int`,
            prevAutoReplies: sql<number>`count(*) filter (where ${messages.senderType} = 'ai')::int`,
          })
          .from(messages)
          .where(and(...msgIn(prevFromDate, fromDate, false))),

        // Messages per IST day
        db
          .select({
            date: msgDayExpr,
            inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
            outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
          })
          .from(messages)
          .where(and(...msgIn(fromDate, toDate, true)))
          .groupBy(msgDayExpr),

        // Messages per channel (never channel-filtered: feeds `channels` and `byChannel`)
        db
          .select({
            type: channels.type,
            inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
            outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
          })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .innerJoin(channels, eq(conversations.channelId, channels.id))
          .where(and(...msgIn(fromDate, toDate, true, false)))
          .groupBy(channels.type),

        // Escalations in range / previous period / by reason
        db.select(escTotals).from(escalations).where(and(...escIn(fromDate, toDate, true))),
        db.select(escTotals).from(escalations).where(and(...escIn(prevFromDate, fromDate, false))),
        db
          .select({ reason: escalations.reason, count: sql<number>`count(*)::int` })
          .from(escalations)
          .where(and(...escIn(fromDate, toDate, true)))
          .groupBy(escalations.reason),

        // Orders in range / previous period
        db.select(orderTotals).from(orders).where(and(...salesIn(fromDate, toDate, true))),
        db.select(orderTotals).from(orders).where(and(...salesIn(prevFromDate, fromDate, false))),

        // Revenue per IST day
        db
          .select({
            date: orderDayExpr,
            revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::float8`,
            orders: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(and(...salesIn(fromDate, toDate, true)))
          .groupBy(orderDayExpr),

        // Revenue per channel (never channel-filtered)
        db
          .select({
            orderChannel: orders.channel,
            revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)::float8`,
            orders: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(and(...salesIn(fromDate, toDate, true, false)))
          .groupBy(orders.channel),

        // Top products: every item sold in range, grouped by product (or name when unlinked)
        db
          .select({
            productId: orderItems.productId,
            name: sql<string>`coalesce(max(${products.name}), max(${orderItems.productName}))`,
            imageUrl: sql<string | null>`max(${products.images} ->> 0)`,
            units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
            revenue: productRevenue,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .leftJoin(products, and(eq(products.id, orderItems.productId), eq(products.businessId, businessId)))
          .where(and(eq(orderItems.isDeleted, false), ...salesIn(fromDate, toDate, true)))
          .groupBy(
            orderItems.productId,
            sql`case when ${orderItems.productId} is null then ${orderItems.productName} end`,
          )
          .orderBy(desc(productRevenue)),

        // Attention (current, not range-bound)
        db
          .select({
            openEscalations: sql<number>`count(*)::int`,
            oldestOpenEscalationAt: sql<Date | null>`min(${escalations.createdAt})`,
          })
          .from(escalations)
          .where(and(eq(escalations.businessId, businessId), isNull(escalations.resolvedAt), ...escChannel)),
        db
          .select({ windowsClosingSoon: sql<number>`count(*)::int` })
          .from(conversations)
          .where(
            and(
              eq(conversations.businessId, businessId),
              sql`${conversations.state} in ('escalated', 'owner_handling')`,
              gte(conversations.windowClosesAt, now),
              lte(conversations.windowClosesAt, new Date(now.getTime() + WINDOW_SOON_MS)),
              ...convChannel,
            ),
          ),
        db
          .select({
            pendingOrders: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
            unpaidBalance: sql<number>`coalesce(sum(greatest(0, ${orders.totalAmount} - ${paidForOrder})) filter (where ${orders.status} <> 'cancelled'), 0)::float8`,
          })
          .from(orders)
          .where(and(eq(orders.businessId, businessId), eq(orders.isDeleted, false), ...orderChannel)),
      ]);

      // ── Messages ─────────────────────────────────────────────────────────────
      const msgStats = msgStatsRows[0];
      const total = num(msgStats?.total);
      const inbound = num(msgStats?.inbound);
      const outbound = num(msgStats?.outbound);
      const autoReplies = num(msgStats?.autoReplies);
      const prevTotal = num(prevMsgRows[0]?.prevTotal);
      const prevAutoReplies = num(prevMsgRows[0]?.prevAutoReplies);

      const days = istDaysInRange(fromDate, toDate);
      const msgByDay = new Map(msgDailyRows.filter((r) => r.date).map((r) => [r.date, r]));
      const messagesDaily = days.map((date) => ({
        date,
        inbound: num(msgByDay.get(date)?.inbound),
        outbound: num(msgByDay.get(date)?.outbound),
      }));

      // ── Escalations / rates ──────────────────────────────────────────────────
      const escalationCount = num(escStatsRows[0]?.totalEscalations);
      const prevEscalations = num(prevEscRows[0]?.totalEscalations);
      const decided = autoReplies + escalationCount;
      const prevDecided = prevAutoReplies + prevEscalations;
      const autoReplyRate = rate(autoReplies, decided);
      const escalationRate = rate(escalationCount, decided);
      const prevAutoReplyRate = rate(prevAutoReplies, prevDecided);

      const avgOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
      // Average time from escalation creation to resolution (resolved escalations created in range).
      const avgResponseTimeSeconds = avgOrNull(escStatsRows[0]?.avgResolutionSeconds);
      const prevAvgResponseTimeSeconds = avgOrNull(prevEscRows[0]?.avgResolutionSeconds);

      const byReason: Record<string, number> = {};
      for (const row of reasonRows) {
        if (row.reason) byReason[row.reason] = num(row.count);
      }

      // ── Channels ─────────────────────────────────────────────────────────────
      const channelStats = {
        whatsapp: { messages: 0, revenue: 0, orders: 0 },
        instagram: { messages: 0, revenue: 0, orders: 0 },
      };
      const byChannel = {
        whatsapp: { inbound: 0, outbound: 0 },
        instagram: { inbound: 0, outbound: 0 },
      };
      for (const row of msgByChannelRows) {
        if (row.type !== "whatsapp" && row.type !== "instagram") continue;
        const counts = { inbound: num(row.inbound), outbound: num(row.outbound) };
        channelStats[row.type].messages = counts.inbound + counts.outbound;
        // byChannel follows the channel filter (the other channel stays 0).
        if (!channel || channel === row.type) byChannel[row.type] = counts;
      }
      for (const row of orderByChannelRows) {
        if (row.orderChannel !== "whatsapp" && row.orderChannel !== "instagram") continue;
        channelStats[row.orderChannel].revenue = rupees(row.revenue);
        channelStats[row.orderChannel].orders = num(row.orders);
      }

      // ── Revenue / orders ─────────────────────────────────────────────────────
      const revenueTotal = rupees(orderRows[0]?.revenue);
      const revenuePrevious = rupees(prevOrderRows[0]?.revenue);
      const orderByDay = new Map(orderDailyRows.filter((r) => r.date).map((r) => [r.date, r]));
      const revenueDaily = days.map((date) => ({
        date,
        revenue: rupees(orderByDay.get(date)?.revenue),
        orders: num(orderByDay.get(date)?.orders),
      }));
      const ordersTotal = num(orderRows[0]?.orders);
      const ordersPreviousTotal = num(prevOrderRows[0]?.orders);
      const confirmed = num(orderRows[0]?.confirmed);
      const previousConfirmed = num(prevOrderRows[0]?.confirmed);
      const pendingOrders = num(orderStateRows[0]?.pendingOrders);

      const topProducts = topProductRows
        .map((r) => ({
          productId: r.productId ?? null,
          name: r.name ?? "",
          imageUrl: r.imageUrl ?? null,
          units: num(r.units),
          revenue: rupees(r.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const outboundSender = {
        ai: num(msgStats?.sentByAi),
        owner: num(msgStats?.sentByOwner),
        staff: num(msgStats?.sentByStaff),
        system: num(msgStats?.sentBySystem),
      };

      const oldestOpenEsc = openEscRows[0]?.oldestOpenEscalationAt;

      return {
        from,
        to,
        messages: {
          total,
          inbound,
          outbound,
        },
        autoReplies,
        escalations: escalationCount,
        autoReplyRate,
        escalationRate,
        avgResponseTimeSeconds,
        byChannel,
        byReason,
        messagesDaily,
        revenue: {
          total: revenueTotal,
          previous: revenuePrevious,
          daily: revenueDaily,
        },
        orders: {
          total: ordersTotal,
          previousTotal: ordersPreviousTotal,
          confirmed,
          previousConfirmed,
          pending: pendingOrders,
        },
        channels: channelStats,
        topProducts,
        attention: {
          openEscalations: num(openEscRows[0]?.openEscalations),
          oldestOpenEscalationAt: oldestOpenEsc ? new Date(oldestOpenEsc).toISOString() : null,
          windowsClosingSoon: num(windowRows[0]?.windowsClosingSoon),
          pendingOrders,
          unpaidBalance: rupees(orderStateRows[0]?.unpaidBalance),
        },
        trends: {
          revenue: trend(revenueTotal, revenuePrevious),
          orders: trend(ordersTotal, ordersPreviousTotal),
          messages: trend(total, prevTotal),
          autoReplyRate: trend(autoReplyRate, prevAutoReplyRate),
          avgResponseTimeSeconds: {
            current: avgResponseTimeSeconds ?? 0,
            previous: prevAvgResponseTimeSeconds ?? 0,
            changePct: changePct(avgResponseTimeSeconds, prevAvgResponseTimeSeconds),
          },
        },
        repliesBySender: outboundSender,
        delivery: {
          failed: num(msgStats?.deliveryFailed),
          read: num(msgStats?.deliveryRead),
        },
      };
    },
  );
};
