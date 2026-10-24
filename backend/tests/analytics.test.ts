import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyTestEnv } from "./env.ts";
import { fake, render, type FakeQuery } from "./fakeDb.ts";

applyTestEnv();

const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitEscalationNew: vi.fn(),
  emitEscalationAssigned: vi.fn(),
  emitConversationAccessChanged: vi.fn(),
  emitSettingsUpdated: vi.fn(),
  emitCustomerUpdated: vi.fn(),
  emitBroadcastUpdated: vi.fn(),
  disconnectUserEverywhere: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const dialect = new PgDialect();
const fieldSql = (q: FakeQuery, key: string) => dialect.sqlToQuery(q.fields![key]).sql;
const whereSql = (q: FakeQuery) => render(q.where).sql;
/** Current-range queries end with `<= to`; previous-period ones with `< from`. */
const isPrevious = (q: FakeQuery, table: string) => whereSql(q).includes(`"${table}"."created_at" < $`);

// Oct 1 00:00 IST → Oct 3 23:59:59.999 IST (3 IST days, length ~3 days)
const FROM = "2026-09-30T18:30:00.000Z";
const TO = "2026-10-03T18:29:59.999Z";

interface Answers {
  msg: Record<string, number>;
  prevMsg: Record<string, number>;
  msgDaily: Array<Record<string, unknown>>;
  msgByChannel: Array<Record<string, unknown>>;
  esc: Record<string, number | null>;
  prevEsc: Record<string, number | null>;
  reasons: Array<Record<string, unknown>>;
  orders: Record<string, unknown>;
  prevOrders: Record<string, unknown>;
  orderDaily: Array<Record<string, unknown>>;
  orderByChannel: Array<Record<string, unknown>>;
  top: Array<Record<string, unknown>>;
  openEsc: number;
  windows: number;
  orderState: Record<string, unknown>;
}

let answers: Answers;

function baseAnswers(): Answers {
  return {
    msg: {
      total: 20, inbound: 12, outbound: 8, autoReplies: 6,
      sentByAi: 6, sentByOwner: 1, sentByStaff: 1, sentBySystem: 0,
      deliveryFailed: 1, deliveryRead: 4,
    },
    prevMsg: { prevTotal: 10, prevAutoReplies: 3 },
    msgDaily: [{ date: "2026-10-02", inbound: 12, outbound: 8 }],
    msgByChannel: [
      { type: "whatsapp", inbound: 9, outbound: 6 },
      { type: "instagram", inbound: 3, outbound: 2 },
    ],
    esc: { totalEscalations: 2, avgResolutionSeconds: 300 },
    prevEsc: { totalEscalations: 1, avgResolutionSeconds: 600 },
    reasons: [{ reason: "intent_refund", count: 2 }],
    orders: { revenue: "4800.40", orders: 3, confirmed: 2 },
    prevOrders: { revenue: 2400, orders: 2, confirmed: 1 },
    orderDaily: [
      { date: "2026-10-01", revenue: "1200.00", orders: 1 },
      { date: "2026-10-03", revenue: 3600.4, orders: 2 },
    ],
    orderByChannel: [
      { orderChannel: "whatsapp", revenue: "3600.40", orders: 2 },
      { orderChannel: "instagram", revenue: 1200, orders: 1 },
    ],
    top: [
      { productId: null, name: "Custom name plate", imageUrl: null, units: 1, revenue: "800" },
      { productId: "prod-1", name: "Ocean Coaster Set of 4", imageUrl: "https://img/1.jpg", units: 3, revenue: "3600.4" },
    ],
    openEsc: 4,
    windows: 1,
    orderState: { pendingOrders: 5, unpaidBalance: "1500.6" },
  };
}

function answer(q: FakeQuery): any[] | undefined {
  if (q.op !== "select" || !q.fields) return undefined;
  const f = q.fields;
  switch (q.table) {
    case "messages":
      if ("total" in f) return [answers.msg];
      if ("prevTotal" in f) return [answers.prevMsg];
      if ("date" in f) return answers.msgDaily;
      if ("type" in f) return answers.msgByChannel;
      return undefined;
    case "escalations":
      if ("totalEscalations" in f) return [isPrevious(q, "escalations") ? answers.prevEsc : answers.esc];
      if ("reason" in f) return answers.reasons;
      if ("openEscalations" in f) return [{ openEscalations: answers.openEsc }];
      return undefined;
    case "orders":
      if ("confirmed" in f) return [isPrevious(q, "orders") ? answers.prevOrders : answers.orders];
      if ("date" in f) return answers.orderDaily;
      if ("orderChannel" in f) return answers.orderByChannel;
      if ("pendingOrders" in f) return [answers.orderState];
      return undefined;
    case "order_items":
      return answers.top;
    case "conversations":
      if ("windowsClosingSoon" in f) return [{ windowsClosingSoon: answers.windows }];
      return undefined;
    default:
      return undefined;
  }
}

let app: any;
let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
  adminToken = app.jwt.sign({ sub: "admin-1", businessId: "biz-1", role: "admin", name: "Asha" });
  staffToken = app.jwt.sign({ sub: "staff-1", businessId: "biz-1", role: "staff", name: "Priya" });
});

beforeEach(() => {
  fake.reset();
  answers = baseAnswers();
  fake.onSelect = answer;
});

const get = (query = `from=${FROM}&to=${TO}`, token = adminToken) =>
  app.inject({ method: "GET", url: `/analytics${query ? `?${query}` : ""}`, headers: { authorization: `Bearer ${token}` } });

const queriesOn = (table: string, key: string) =>
  fake.queries.filter((q) => q.op === "select" && q.table === table && q.fields && key in q.fields);

describe("GET /analytics", () => {
  it("returns the existing fields with the fixed rate formulas", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe(FROM);
    expect(body.to).toBe(TO);
    expect(body.messages).toEqual({ total: 20, inbound: 12, outbound: 8 });
    expect(body.autoReplies).toBe(6);
    expect(body.escalations).toBe(2);
    // autoReplies / (autoReplies + escalations), not / inbound
    expect(body.autoReplyRate).toBe(0.75);
    expect(body.escalationRate).toBe(0.25);
    expect(body.avgResponseTimeSeconds).toBe(300);
    expect(body.byChannel).toEqual({ whatsapp: { inbound: 9, outbound: 6 }, instagram: { inbound: 3, outbound: 2 } });
    expect(body.byReason).toEqual({ intent_refund: 2 });
  });

  it("rates are 0 when there are no auto-replies and no escalations", async () => {
    answers.msg = { ...answers.msg, autoReplies: 0 };
    answers.esc = { totalEscalations: 0, avgResolutionSeconds: null };
    const body = (await get()).json();
    expect(body.autoReplyRate).toBe(0);
    expect(body.escalationRate).toBe(0);
    expect(body.avgResponseTimeSeconds).toBeNull();
  });

  it("zero-fills messagesDaily and revenue.daily for every IST day in range", async () => {
    const body = (await get()).json();
    expect(body.messagesDaily).toEqual([
      { date: "2026-10-01", inbound: 0, outbound: 0 },
      { date: "2026-10-02", inbound: 12, outbound: 8 },
      { date: "2026-10-03", inbound: 0, outbound: 0 },
    ]);
    expect(body.revenue.daily).toEqual([
      { date: "2026-10-01", revenue: 1200, orders: 1 },
      { date: "2026-10-02", revenue: 0, orders: 0 },
      { date: "2026-10-03", revenue: 3600, orders: 2 },
    ]);
  });

  it("groups days in Asia/Kolkata", async () => {
    await get();
    const [msgDaily] = queriesOn("messages", "date");
    const [orderDaily] = queriesOn("orders", "date");
    expect(fieldSql(msgDaily!, "date")).toContain(`at time zone 'UTC') at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`);
    expect(fieldSql(orderDaily!, "date")).toContain("Asia/Kolkata");
    expect(msgDaily!.groupBy).toBe(true);
    expect(orderDaily!.groupBy).toBe(true);
  });

  it("defaults to the last 7 days (8 IST calendar days, zero-filled)", async () => {
    const res = await get("");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Date.parse(body.to) - Date.parse(body.from)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(body.messagesDaily.length).toBe(8);
    expect(body.revenue.daily.length).toBe(8);
  });

  it("returns revenue, orders, channels and trends with whole-rupee money", async () => {
    const body = (await get()).json();
    expect(body.revenue.total).toBe(4800);
    expect(body.revenue.previous).toBe(2400);
    expect(body.orders).toEqual({ confirmed: 2, previousConfirmed: 1, pending: 5 });
    expect(body.channels).toEqual({
      whatsapp: { messages: 15, revenue: 3600, orders: 2 },
      instagram: { messages: 5, revenue: 1200, orders: 1 },
    });
    expect(body.trends).toEqual({
      revenue: { current: 4800, previous: 2400, changePct: 100 },
      orders: { current: 2, previous: 1, changePct: 100 },
      messages: { current: 20, previous: 10, changePct: 100 },
      // prev: 3 / (3 + 1) = 0.75 → current 0.75
      autoReplyRate: { current: 0.75, previous: 0.75, changePct: 0 },
      avgResponseTimeSeconds: { current: 300, previous: 600, changePct: -50 },
    });
  });

  it("changePct is null when previous is 0 or avg response time is missing", async () => {
    answers.prevOrders = { revenue: 0, orders: 0, confirmed: 0 };
    answers.prevMsg = { prevTotal: 0, prevAutoReplies: 0 };
    answers.prevEsc = { totalEscalations: 0, avgResolutionSeconds: null };
    const body = (await get()).json();
    expect(body.trends.revenue).toEqual({ current: 4800, previous: 0, changePct: null });
    expect(body.trends.orders.changePct).toBeNull();
    expect(body.trends.messages.changePct).toBeNull();
    expect(body.trends.autoReplyRate).toEqual({ current: 0.75, previous: 0, changePct: null });
    expect(body.trends.avgResponseTimeSeconds).toEqual({ current: 300, previous: 0, changePct: null });

    answers = baseAnswers();
    answers.esc = { totalEscalations: 2, avgResolutionSeconds: null };
    const again = (await get()).json();
    expect(again.trends.avgResponseTimeSeconds).toEqual({ current: 0, previous: 600, changePct: null });
  });

  it("queries the previous period of equal length ending at `from` (exclusive)", async () => {
    await get();
    const length = Date.parse(TO) - Date.parse(FROM);
    const prevFrom = new Date(Date.parse(FROM) - length).getTime();
    const from = Date.parse(FROM);

    for (const [table, key] of [["messages", "prevTotal"], ["escalations", "totalEscalations"], ["orders", "confirmed"]] as const) {
      const prev = queriesOn(table, key).filter((q) => isPrevious(q, table));
      expect(prev.length, `${table} previous query`).toBe(1);
      const { sql, params } = render(prev[0]!.where);
      expect(sql).toContain(`"${table}"."created_at" >= $`);
      const dates = params.filter((p): p is string => typeof p === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p)).map(Date.parse);
      const dateParams = params.filter((p) => p instanceof Date).map((d) => (d as Date).getTime());
      expect([...dates, ...dateParams]).toEqual(expect.arrayContaining([prevFrom, from]));
    }
  });

  it("revenue/order queries exclude deleted and cancelled orders and count confirmed statuses", async () => {
    await get();
    const [current] = queriesOn("orders", "confirmed").filter((q) => !isPrevious(q, "orders"));
    const where = render(current!.where);
    expect(where.sql).toContain(`"orders"."is_deleted" = $`);
    expect(where.sql).toContain(`"orders"."status" <> $`);
    expect(where.params).toContain("cancelled");
    expect(where.params).toContain(false);
    const confirmed = dialect.sqlToQuery(current!.fields!.confirmed);
    expect(confirmed.params).toEqual(["confirmed", "in_production", "ready", "dispatched", "delivered"]);
  });

  it("returns topProducts with every item, sorted by revenue desc", async () => {
    const body = (await get()).json();
    expect(body.topProducts).toEqual([
      { productId: "prod-1", name: "Ocean Coaster Set of 4", imageUrl: "https://img/1.jpg", units: 3, revenue: 3600 },
      { productId: null, name: "Custom name plate", imageUrl: null, units: 1, revenue: 800 },
    ]);
    const [q] = fake.queries.filter((x) => x.table === "order_items");
    expect(q!.joins).toEqual(["orders", "products"]);
    expect(q!.limit).toBeUndefined();
    expect(q!.groupBy).toBe(true);
    expect(fieldSql(q!, "imageUrl")).toContain(`"products"."images" ->> 0`);
    expect(fieldSql(q!, "revenue")).toContain(`sum("order_items"."quantity" * "order_items"."unit_price")`);
    expect(whereSql(q!)).toContain(`"order_items"."is_deleted" = $`);
  });

  it("returns attention, repliesBySender and delivery", async () => {
    const body = (await get()).json();
    expect(body.attention).toEqual({ openEscalations: 4, windowsClosingSoon: 1, pendingOrders: 5, unpaidBalance: 1501 });
    expect(body.repliesBySender).toEqual({ ai: 6, owner: 1, staff: 1, system: 0 });
    expect(body.delivery).toEqual({ failed: 1, read: 4 });

    const [open] = queriesOn("escalations", "openEscalations");
    expect(whereSql(open!)).toContain(`"escalations"."resolved_at" is null`);
    expect(whereSql(open!)).not.toContain("created_at");

    const [win] = queriesOn("conversations", "windowsClosingSoon");
    const w = render(win!.where);
    expect(w.sql).toContain(`"conversations"."state" in ('escalated', 'owner_handling')`);
    expect(w.sql).toContain(`"conversations"."window_closes_at" >= $`);
    expect(w.sql).toContain(`"conversations"."window_closes_at" <= $`);
    const [lo, hi] = w.params.filter((p): p is string => typeof p === "string" && /^\d{4}-/.test(p)).map(Date.parse);
    expect(hi! - lo!).toBe(2 * 60 * 60 * 1000);

    const [state] = queriesOn("orders", "pendingOrders");
    expect(whereSql(state!)).not.toContain("created_at");
    const unpaid = dialect.sqlToQuery(state!.fields!.unpaidBalance);
    expect(unpaid.sql).toContain("greatest(0,");
    expect(unpaid.sql).toContain(`"payments"."status" = 'paid'`);
    expect(unpaid.sql).toContain(`"payments"."order_id" = "orders"."id"`);
  });

  it("applies no channel filter by default", async () => {
    await get();
    for (const w of fake.wheres({ op: "select" })) {
      expect(w.params).not.toContain("whatsapp");
      expect(w.params).not.toContain("instagram");
    }
  });

  it("filters messages, escalations and orders by ?channel=, but not `channels`", async () => {
    const res = await get(`from=${FROM}&to=${TO}&channel=instagram`);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const msgFilter = `"messages"."conversation_id" in (select "conversations"."id" from "conversations" inner join "channels" on "channels"."id" = "conversations"."channel_id" where "conversations"."business_id" = $`;
    for (const key of ["total", "prevTotal", "date"]) {
      const [q] = queriesOn("messages", key);
      const w = render(q!.where);
      expect(w.sql, key).toContain(msgFilter);
      expect(w.params).toContain("instagram");
    }
    for (const key of ["totalEscalations", "reason", "openEscalations"]) {
      for (const q of queriesOn("escalations", key)) {
        const w = render(q.where);
        expect(w.sql, key).toContain(`"escalations"."conversation_id" in (select "conversations"."id"`);
        expect(w.params).toContain("instagram");
      }
    }
    for (const key of ["confirmed", "date", "pendingOrders"]) {
      for (const q of queriesOn("orders", key)) {
        const w = render(q.where);
        expect(w.sql, key).toContain(`"orders"."channel" = $`);
        expect(w.params).toContain("instagram");
      }
    }
    const [top] = fake.queries.filter((q) => q.table === "order_items");
    expect(render(top!.where).params).toContain("instagram");
    const [win] = queriesOn("conversations", "windowsClosingSoon");
    expect(render(win!.where).sql).toContain(`"conversations"."channel_id" in (select "channels"."id" from "channels"`);
    expect(render(win!.where).params).toContain("instagram");

    // `channels` stays computed for both channels from unfiltered queries
    for (const q of [...queriesOn("messages", "type"), ...queriesOn("orders", "orderChannel")]) {
      expect(render(q.where).params).not.toContain("instagram");
    }
    expect(body.channels.whatsapp).toEqual({ messages: 15, revenue: 3600, orders: 2 });
    expect(body.channels.instagram).toEqual({ messages: 5, revenue: 1200, orders: 1 });
    // byChannel follows the filter
    expect(body.byChannel).toEqual({ whatsapp: { inbound: 0, outbound: 0 }, instagram: { inbound: 3, outbound: 2 } });
  });

  it("rejects an unknown channel or an inverted range (400)", async () => {
    expect((await get(`channel=telegram`)).statusCode).toBe(400);
    expect((await get(`from=${TO}&to=${FROM}`)).statusCode).toBe(400);
    expect((await get(`from=yesterday`)).statusCode).toBe(400);
  });

  it("forbids staff (403)", async () => {
    const res = await get(undefined, staffToken);
    expect(res.statusCode).toBe(403);
    expect(fake.queries.length).toBe(0);
  });
});

describe("analytics helpers", () => {
  it("istDaysInRange covers each IST calendar day", async () => {
    const { istDaysInRange } = await import("../src/routes/analytics.ts");
    // 23:00 UTC = 04:30 IST next day
    expect(istDaysInRange(new Date("2026-10-01T23:00:00Z"), new Date("2026-10-02T23:00:00Z"))).toEqual([
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(istDaysInRange(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-01T11:00:00Z"))).toEqual(["2026-10-01"]);
  });

  it("changePct rounds and returns null for a missing/zero baseline", async () => {
    const { changePct } = await import("../src/routes/analytics.ts");
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(1, 3)).toBe(-67);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(null, 5)).toBeNull();
    expect(changePct(5, null)).toBeNull();
  });
});
