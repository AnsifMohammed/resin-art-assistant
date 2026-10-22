import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, type FakeQuery } from "./fakeDb.ts";

applyTestEnv({ BROADCAST_MAX_RECIPIENTS: "250" });

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

const enqueueSendBroadcast = vi.hoisted(() => vi.fn(async () => ({ mode: "queued", jobId: "job-1" })));
vi.mock("../src/queue/enqueueBroadcast.ts", () => ({
  enqueueSendBroadcast,
  dispatchBroadcasts: vi.fn(),
  startInlineBroadcastDispatcher: vi.fn(),
  stopInlineBroadcastDispatcher: vi.fn(),
}));

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

let audienceCount = 3;

function answer(q: FakeQuery): any[] | undefined {
  if (!q.fields) return undefined;
  if (q.table === "customers" && "count" in q.fields) return [{ count: audienceCount }];
  if (q.table === "broadcasts" && "count" in q.fields) return [{ count: fake.rows("broadcasts").length }];
  if (q.table === "broadcast_recipients" && "status" in q.fields && "count" in q.fields) {
    const groups = new Map<string, any>();
    for (const r of fake.rows("broadcast_recipients")) {
      const key = `${r.broadcastId}|${r.status}`;
      const g = groups.get(key) ?? { broadcastId: r.broadcastId, status: r.status, count: 0 };
      g.count++;
      groups.set(key, g);
    }
    return [...groups.values()];
  }
  if (q.table === "broadcast_recipients" && "count" in q.fields) return [{ count: fake.rows("broadcast_recipients").length }];
  if (q.table === "broadcast_recipients" && "customerName" in q.fields) {
    return fake.rows("broadcast_recipients").map((r) => ({ ...r, customerName: "Meera" }));
  }
  return undefined;
}

const approved = {
  id: "tpl-ok",
  businessId: "biz-1",
  name: "Diwali offer",
  category: "festive",
  channel: "whatsapp",
  body: "Hi {customerName}, {offer} until {date}!",
  variables: ["customerName", "offer", "date"],
  isActive: true,
  metaTemplateName: "diwali_offer",
  metaStatus: "approved",
};

const bc = (over: Record<string, any>) => ({
  businessId: "biz-1",
  name: "Diwali",
  templateId: "tpl-ok",
  segment: "all",
  filters: {},
  variables: { offer: "10% off", date: "Friday" },
  status: "draft",
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  recipientCount: 0,
  error: null,
  createdByUserId: "admin-1",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  ...over,
});

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

beforeEach(async () => {
  fake.reset({
    message_templates: [
      approved,
      { ...approved, id: "tpl-pending", metaStatus: "pending" },
      { ...approved, id: "tpl-noname", metaTemplateName: null },
      { ...approved, id: "tpl-ig", channel: "instagram" },
      { ...approved, id: "tpl-inactive", isActive: false },
      { ...approved, id: "tpl-other-biz", businessId: "biz-2" },
    ],
    broadcasts: [
      bc({ id: "b-draft", status: "draft" }),
      bc({ id: "b-scheduled", status: "scheduled", scheduledAt: new Date(Date.now() + 3_600_000) }),
      bc({ id: "b-sending", status: "sending", startedAt: new Date() }),
      bc({ id: "b-sent", status: "sent", recipientCount: 2 }),
      bc({ id: "b-other", businessId: "biz-2" }),
    ],
    broadcast_recipients: [
      { id: "r-1", businessId: "biz-1", broadcastId: "b-sent", customerId: "c-1", phone: "911", status: "delivered", createdAt: new Date() },
      { id: "r-2", businessId: "biz-1", broadcastId: "b-sent", customerId: "c-2", phone: "912", status: "failed", error: "x", createdAt: new Date() },
    ],
    audit_log: [],
  });
  fake.onSelect = answer;
  audienceCount = 3;
  enqueueSendBroadcast.mockClear();
  Object.values(rt).forEach((fn) => fn.mockClear());
  (await import("../src/services/broadcastProgress.ts")).resetBroadcastProgressThrottle();
});

const call = (method: string, url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload !== undefined ? { payload } : {}) });

const valid = (over: Record<string, any> = {}) => ({
  name: "Diwali blast",
  templateId: "tpl-ok",
  segment: "previous_buyers",
  filters: { city: "Kochi", excludeComplaints: true },
  variables: { offer: "10% off", date: "Friday" },
  action: "draft",
  ...over,
});

const auditActions = () => fake.rows("audit_log").map((a) => a.action);

describe("staff access", () => {
  it.each([
    ["GET", "/broadcasts"],
    ["GET", "/broadcasts/audience"],
    ["GET", "/broadcasts/b-draft"],
    ["POST", "/broadcasts"],
    ["PATCH", "/broadcasts/b-draft"],
    ["POST", "/broadcasts/b-scheduled/cancel"],
    ["DELETE", "/broadcasts/b-draft"],
  ])("%s %s → 403", async (method, url) => {
    const res = await call(method, url, staffToken, method === "POST" || method === "PATCH" ? {} : undefined);
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /broadcasts/audience", () => {
  it("counts WhatsApp, not-opted-out customers for the segment + filters", async () => {
    audienceCount = 42;
    const res = await call("GET", "/broadcasts/audience?segment=repeat_buyers&city=Kochi&excludeComplaints=true", adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 42, max: 250 });
    const q = fake.queries.find((x) => x.table === "customers" && x.fields && "count" in x.fields)!;
    expect(q.joins).toEqual(["channels", "subquery"]);
    const { sql, params } = fake.wheres({ table: "customers" })[0]!;
    expect(sql).toContain('coalesce("order_stats"."orders_count", 0) >= 2');
    expect(sql).toContain('"channels"."type" = $');
    expect(sql).toContain('"customers"."opted_out" = $');
    expect(sql).toContain("not exists");
    expect(params).toEqual(expect.arrayContaining(["biz-1", "kochi", "whatsapp", false]));
  });

  it("rejects an unknown segment", async () => {
    expect((await call("GET", "/broadcasts/audience?segment=vip", adminToken)).statusCode).toBe(400);
  });
});

describe("GET /broadcasts", () => {
  it("lists summaries with template name and recipient stats", async () => {
    const res = await call("GET", "/broadcasts", adminToken);
    expect(res.statusCode).toBe(200);
    const sent = res.json().broadcasts.find((b: any) => b.id === "b-sent");
    expect(sent).toMatchObject({
      templateName: "Diwali offer",
      status: "sent",
      recipientCount: 2,
      stats: { pending: 0, sent: 0, delivered: 1, read: 0, failed: 1 },
    });
    expect(res.json().pagination).toMatchObject({ page: 1, limit: 20 });
    // Stats come from one grouped query.
    expect(fake.queries.filter((q) => q.table === "broadcast_recipients" && q.groupBy)).toHaveLength(1);
  });

  it("rejects an unknown status filter", async () => {
    expect((await call("GET", "/broadcasts?status=done", adminToken)).statusCode).toBe(400);
  });
});

describe("GET /broadcasts/:id", () => {
  it("returns the summary and paged recipients", async () => {
    const res = await call("GET", "/broadcasts/b-sent", adminToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.broadcast.id).toBe("b-sent");
    expect(body.recipients[0]).toMatchObject({ id: "r-1", customerName: "Meera", phone: "911", status: "delivered" });
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 2 });
  });

  it("404s for another business's broadcast", async () => {
    const res = await call("GET", "/broadcasts/b-other", adminToken);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });
});

describe("POST /broadcasts", () => {
  it("creates a draft", async () => {
    const res = await call("POST", "/broadcasts", adminToken, valid());
    expect(res.statusCode).toBe(201);
    expect(res.json().broadcast).toMatchObject({
      name: "Diwali blast",
      status: "draft",
      segment: "previous_buyers",
      filters: { city: "Kochi", excludeComplaints: true },
      templateName: "Diwali offer",
      stats: { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    });
    expect(auditActions()).toEqual(["broadcast_created"]);
    expect(enqueueSendBroadcast).not.toHaveBeenCalled();
    expect(rt.emitBroadcastUpdated).toHaveBeenCalledWith("biz-1", expect.objectContaining({ status: "draft" }));
  });

  it.each(["tpl-pending", "tpl-noname", "tpl-ig", "tpl-inactive", "tpl-other-biz", "tpl-missing"])(
    "400 TEMPLATE_NOT_APPROVED for %s",
    async (templateId) => {
      const res = await call("POST", "/broadcasts", adminToken, valid({ templateId }));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: "TEMPLATE_NOT_APPROVED", error: "Broadcasts need a WhatsApp template approved by Meta" });
    },
  );

  it("400 TEMPLATE_VARIABLES_MISSING lists every empty variable except customerName", async () => {
    const res = await call("POST", "/broadcasts", adminToken, valid({ variables: { offer: " " } }));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("TEMPLATE_VARIABLES_MISSING");
    expect(res.json().details).toEqual([
      { path: "offer", message: "required" },
      { path: "date", message: "required" },
    ]);
  });

  it("400 EMPTY_AUDIENCE", async () => {
    audienceCount = 0;
    const res = await call("POST", "/broadcasts", adminToken, valid());
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("EMPTY_AUDIENCE");
  });

  it("409 AUDIENCE_TOO_LARGE above BROADCAST_MAX_RECIPIENTS", async () => {
    audienceCount = 251;
    const res = await call("POST", "/broadcasts", adminToken, valid());
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "AUDIENCE_TOO_LARGE", details: { count: 251, max: 250 } });
  });

  it("schedule requires a scheduledAt at least a minute ahead", async () => {
    const missing = await call("POST", "/broadcasts", adminToken, valid({ action: "schedule" }));
    expect(missing.statusCode).toBe(400);
    expect(missing.json().details).toEqual([{ path: "scheduledAt", message: expect.stringContaining("required") }]);

    const soon = await call("POST", "/broadcasts", adminToken, valid({ action: "schedule", scheduledAt: new Date(Date.now() + 10_000).toISOString() }));
    expect(soon.statusCode).toBe(400);
    expect(soon.json().code).toBe("VALIDATION_ERROR");

    const at = new Date(Date.now() + 3_600_000).toISOString();
    const ok = await call("POST", "/broadcasts", adminToken, valid({ action: "schedule", scheduledAt: at }));
    expect(ok.statusCode).toBe(201);
    expect(ok.json().broadcast).toMatchObject({ status: "scheduled", scheduledAt: at });
    expect(auditActions()).toEqual(["broadcast_created", "broadcast_scheduled"]);
  });

  it("send_now marks it sending and enqueues the send job", async () => {
    const res = await call("POST", "/broadcasts", adminToken, valid({ action: "send_now" }));
    expect(res.statusCode).toBe(201);
    const { broadcast } = res.json();
    expect(broadcast.status).toBe("sending");
    expect(broadcast.startedAt).toEqual(expect.any(String));
    expect(enqueueSendBroadcast).toHaveBeenCalledWith({ broadcastId: broadcast.id, businessId: "biz-1" });
    expect(auditActions()).toEqual(["broadcast_created", "broadcast_started"]);
  });

  it("rejects bad payloads", async () => {
    for (const payload of [
      valid({ action: "later" }),
      valid({ name: "" }),
      valid({ segment: "vip" }),
      valid({ variables: { offer: "x".repeat(1001) } }),
      valid({ filters: { region: "south" } }),
      valid({ extra: true }),
      valid({ scheduledAt: "tomorrow" }),
    ]) {
      const res = await call("POST", "/broadcasts", adminToken, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("PATCH /broadcasts/:id", () => {
  it("edits a draft and can move it forward to scheduled", async () => {
    const at = new Date(Date.now() + 7_200_000).toISOString();
    const res = await call("PATCH", "/broadcasts/b-draft", adminToken, { name: "Renamed", action: "schedule", scheduledAt: at });
    expect(res.statusCode).toBe(200);
    expect(res.json().broadcast).toMatchObject({ name: "Renamed", status: "scheduled", scheduledAt: at });
    expect(auditActions()).toEqual(["broadcast_updated", "broadcast_scheduled"]);
  });

  it("send_now on a draft enqueues", async () => {
    const res = await call("PATCH", "/broadcasts/b-draft", adminToken, { action: "send_now" });
    expect(res.statusCode).toBe(200);
    expect(res.json().broadcast.status).toBe("sending");
    expect(enqueueSendBroadcast).toHaveBeenCalledWith({ broadcastId: "b-draft", businessId: "biz-1" });
  });

  it("re-validates the template", async () => {
    const res = await call("PATCH", "/broadcasts/b-scheduled", adminToken, { templateId: "tpl-pending" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("TEMPLATE_NOT_APPROVED");
  });

  it.each(["b-sending", "b-sent"])("409 BROADCAST_LOCKED for %s", async (id) => {
    const res = await call("PATCH", `/broadcasts/${id}`, adminToken, { name: "x" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("BROADCAST_LOCKED");
  });
});

describe("POST /broadcasts/:id/cancel", () => {
  it.each(["b-scheduled", "b-sending"])("cancels %s", async (id) => {
    const res = await call("POST", `/broadcasts/${id}/cancel`, adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().broadcast.status).toBe("cancelled");
    expect(fake.rows("broadcasts").find((b) => b.id === id).status).toBe("cancelled");
    expect(auditActions()).toEqual(["broadcast_cancelled"]);
    expect(rt.emitBroadcastUpdated).toHaveBeenCalledWith("biz-1", expect.objectContaining({ broadcastId: id, status: "cancelled" }));
  });

  it.each(["b-draft", "b-sent"])("409 BROADCAST_LOCKED for %s", async (id) => {
    const res = await call("POST", `/broadcasts/${id}/cancel`, adminToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("BROADCAST_LOCKED");
  });

  it("the cancel UPDATE is guarded on the status that was read", async () => {
    await call("POST", "/broadcasts/b-scheduled/cancel", adminToken);
    const { sql, params } = fake.wheres({ op: "update", table: "broadcasts" })[0]!;
    expect(sql).toContain('"broadcasts"."status" = $');
    expect(params).toContain("scheduled");
  });
});

describe("DELETE /broadcasts/:id", () => {
  it("deletes a draft", async () => {
    const res = await call("DELETE", "/broadcasts/b-draft", adminToken);
    expect(res.statusCode).toBe(204);
    expect(fake.rows("broadcasts").some((b) => b.id === "b-draft")).toBe(false);
    expect(auditActions()).toEqual(["broadcast_deleted"]);
  });

  it.each(["b-scheduled", "b-sending", "b-sent"])("409 BROADCAST_LOCKED for %s", async (id) => {
    const res = await call("DELETE", `/broadcasts/${id}`, adminToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("BROADCAST_LOCKED");
  });

  it("404 for an unknown broadcast", async () => {
    expect((await call("DELETE", "/broadcasts/nope", adminToken)).statusCode).toBe(404);
  });
});
