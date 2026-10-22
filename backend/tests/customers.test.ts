import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const created = new Date("2026-01-01T00:00:00Z");
const customer = (over: Record<string, any> = {}) => ({
  id: "cust-1",
  businessId: "biz-1",
  channelId: "chan-wa",
  name: "Meera",
  handleOrPhone: "919876543210",
  language: "english",
  notes: null,
  city: "Kochi",
  isFavourite: false,
  isPriority: false,
  optedOut: false,
  optedOutAt: null,
  optOutSource: null,
  createdAt: created,
  updatedAt: created,
  ...over,
});

/** Answer the joined CustomerListItem / count / segment-count selects. */
function answerJoined(q: FakeQuery): any[] | undefined {
  if (q.table !== "customers" || !q.fields) return undefined;
  if ("customer" in q.fields) {
    // Detail lookups bind the customer id; list queries do not.
    const byId = render(q.where).params.find((p) => typeof p === "string" && p.startsWith("cust-"));
    return fake
      .rows("customers")
      .filter((c) => c.businessId === "biz-1" && (!byId || c.id === byId))
      .map((c) => ({
        customer: c,
        channelType: "whatsapp",
        conversationId: "conv-1",
        conversationState: "ai_active",
        lastMessageAt: created,
        ordersCount: 2,
        totalSpend: "2400.50",
        lastOrderAt: created,
      }));
  }
  if ("count" in q.fields) return [{ count: 1 }];
  if ("all" in q.fields) {
    return [{ all: 5, favourites: 1, priority: 0, previous_buyers: 3, repeat_buyers: 2, new: 1, never_ordered: 2, inactive: 1 }];
  }
  return undefined;
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
  fake.reset({
    customers: [customer(), customer({ id: "cust-other", businessId: "biz-2", name: "Other" })],
    orders: [],
    audit_log: [],
  });
  fake.onSelect = answerJoined;
  Object.values(rt).forEach((fn) => fn.mockClear());
});

const call = (method: string, url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload !== undefined ? { payload } : {}) });

const listQuery = () => fake.queries.find((q) => q.op === "select" && q.fields && "customer" in q.fields)!;

describe("GET /customers", () => {
  it("returns items, pagination and per-segment counts", async () => {
    const res = await call("GET", "/customers", adminToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toEqual({ page: 1, limit: 24, total: 1 });
    expect(body.counts).toEqual({
      all: 5, favourites: 1, priority: 0, previous_buyers: 3, repeat_buyers: 2, new: 1, never_ordered: 2, inactive: 1,
    });
    expect(body.customers[0]).toEqual({
      id: "cust-1",
      name: "Meera",
      handleOrPhone: "919876543210",
      channel: "whatsapp",
      city: "Kochi",
      language: "english",
      notes: null,
      isFavourite: false,
      isPriority: false,
      optedOut: false,
      optedOutAt: null,
      createdAt: created.toISOString(),
      conversationId: "conv-1",
      conversationState: "ai_active",
      lastMessageAt: created.toISOString(),
      ordersCount: 2,
      totalSpend: 2400.5,
      lastOrderAt: created.toISOString(),
      segments: ["previous_buyers", "repeat_buyers", "inactive"],
    });
    // One list query with the channel, order-stats and latest-conversation joins.
    expect(listQuery().joins).toEqual(["channels", "subquery", "lateral"]);
    expect(listQuery().limit).toBe(24);
  });

  it("applies segment, filters, channel and escaped search to the WHERE clause", async () => {
    const res = await call(
      "GET",
      "/customers?segment=repeat_buyers&city=Kochi&language=malayalam&channel=whatsapp&search=50%25_off&sort=spend&page=2&limit=10",
      adminToken,
    );
    expect(res.statusCode).toBe(200);
    const q = listQuery();
    const { sql, params } = render(q.where);
    expect(sql).toContain('"customers"."business_id" = $1');
    expect(sql).toContain('coalesce("order_stats"."orders_count", 0) >= 2');
    expect(sql).toContain('lower(btrim("customers"."city")) =');
    expect(sql).toContain('"customers"."language" =');
    expect(sql).toContain('"channels"."type" =');
    expect(sql).toContain('"customers"."name" ilike');
    expect(sql).toContain('"customers"."city" ilike');
    expect(params).toEqual(expect.arrayContaining(["biz-1", "kochi", "malayalam", "whatsapp", "%50\\%\\_off%"]));
    expect(q.limit).toBe(10);
    expect(q.offset).toBe(10);
  });

  it.each([
    "limit=101",
    "limit=0",
    "page=0",
    "segment=vip",
    "sort=price",
    "channel=sms",
    `search=${"x".repeat(101)}`,
  ])("rejects invalid params (%s)", async (qs) => {
    const res = await call("GET", `/customers?${qs}`, adminToken);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});

describe("staff access", () => {
  it.each([
    ["GET", "/customers"],
    ["GET", "/customers/cust-1"],
    ["PATCH", "/customers/cust-1"],
    ["GET", "/customers/cust-1/orders"],
  ])("%s %s → 403", async (method, url) => {
    const res = await call(method, url, staffToken, method === "PATCH" ? { isFavourite: true } : undefined);
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /customers/:id", () => {
  it("returns one customer", async () => {
    const res = await call("GET", "/customers/cust-1", adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().customer).toMatchObject({ id: "cust-1", totalSpend: 2400.5 });
  });

  it("404s for an unknown customer", async () => {
    fake.onSelect = () => [];
    const res = await call("GET", "/customers/nope", adminToken);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });
});

describe("PATCH /customers/:id", () => {
  it("opting out sets source admin + timestamp, audits and emits", async () => {
    const res = await call("PATCH", "/customers/cust-1", adminToken, { optedOut: true, isFavourite: true, city: " Thrissur " });
    expect(res.statusCode).toBe(200);
    const row = fake.rows("customers").find((c) => c.id === "cust-1");
    expect(row).toMatchObject({ optedOut: true, optOutSource: "admin", isFavourite: true, city: "Thrissur" });
    expect(row.optedOutAt).toBeInstanceOf(Date);

    expect(fake.rows("audit_log").map((a) => a.action)).toEqual(["customer_updated", "customer_opted_out"]);
    expect(fake.rows("audit_log")[0]).toMatchObject({
      businessId: "biz-1",
      actorId: "admin-1",
      actorType: "admin",
      details: { customerId: "cust-1", fields: ["city", "isFavourite"] },
    });
    expect(fake.rows("audit_log")[1].details).toEqual({ customerId: "cust-1", source: "admin" });
    expect(rt.emitCustomerUpdated).toHaveBeenCalledWith("biz-1", { customerId: "cust-1" });
    expect(res.json().customer.id).toBe("cust-1");
  });

  it("opting back in clears the timestamp and source", async () => {
    fake.rows("customers")[0]!.optedOut = true;
    fake.rows("customers")[0]!.optedOutAt = created;
    fake.rows("customers")[0]!.optOutSource = "keyword";
    const res = await call("PATCH", "/customers/cust-1", adminToken, { optedOut: false });
    expect(res.statusCode).toBe(200);
    expect(fake.rows("customers")[0]).toMatchObject({ optedOut: false, optedOutAt: null, optOutSource: null });
    expect(fake.rows("audit_log").map((a) => a.action)).toEqual(["customer_opted_in"]);
  });

  it("no actual change → no update, audit or emit", async () => {
    const res = await call("PATCH", "/customers/cust-1", adminToken, { name: "Meera", optedOut: false });
    expect(res.statusCode).toBe(200);
    expect(fake.queries.some((q) => q.op === "update")).toBe(false);
    expect(fake.rows("audit_log")).toHaveLength(0);
    expect(rt.emitCustomerUpdated).not.toHaveBeenCalled();
  });

  it("rejects unknown fields and bad values", async () => {
    for (const payload of [{ role: "x" }, { name: "" }, { notes: "x".repeat(2001) }, { isPriority: "yes" }]) {
      const res = await call("PATCH", "/customers/cust-1", adminToken, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    }
  });

  it("404s for another business's customer", async () => {
    const res = await call("PATCH", "/customers/cust-other", adminToken, { isFavourite: true });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });
});

describe("GET /customers/:id/orders", () => {
  it("returns orders with numeric totals", async () => {
    fake.onSelect = (q) =>
      q.table === "orders"
        ? [{ id: "o-1", orderNo: "ORD-1", status: "delivered", totalAmount: "1200.00", createdAt: created, itemsCount: 2 }]
        : undefined;
    const res = await call("GET", "/customers/cust-1/orders", adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().orders).toEqual([
      { id: "o-1", orderNo: "ORD-1", status: "delivered", totalAmount: 1200, createdAt: created.toISOString(), itemsCount: 2 },
    ]);
    const { sql } = fake.wheres({ table: "orders" })[0]!;
    expect(sql).toContain('"orders"."is_deleted" = $');
    expect(sql).toContain('"orders"."customer_id" = $');
  });

  it("404s for an unknown customer", async () => {
    const res = await call("GET", "/customers/nope/orders", adminToken);
    expect(res.statusCode).toBe(404);
  });
});
