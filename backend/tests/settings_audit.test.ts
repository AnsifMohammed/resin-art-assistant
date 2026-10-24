import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, render } from "./fakeDb.ts";

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

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DEFAULTS = {
  businessHours: { enabled: false, open: "09:00", close: "21:00", days: ALL_DAYS },
  awayMessage: { enabled: false, text: "Hi! We're closed right now 🌙 We'll reply as soon as we're back." },
  windowAlerts: { enabled: false, thresholdMinutes: 120, target: "push" },
};

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

const seed = (settings: Record<string, unknown> = { automation_paused: true, some_other_key: "keep" }) =>
  fake.reset({
    businesses: [{ id: "biz-1", name: "Asha Resin Art", settings }],
    channels: [
      { id: "chan-wa", businessId: "biz-1", type: "whatsapp", identifier: "123", status: "active", tokenExpiresAt: null },
    ],
  });

beforeEach(() => {
  seed();
  rt.emitSettingsUpdated.mockClear();
});

const getSettings = (token = adminToken) =>
  app.inject({ method: "GET", url: "/settings", headers: { authorization: `Bearer ${token}` } });
const patchSettings = (payload: unknown, token = adminToken) =>
  app.inject({ method: "PATCH", url: "/settings", headers: { authorization: `Bearer ${token}` }, payload });

describe("GET /settings", () => {
  it("returns defaults for the new sections when nothing is stored", async () => {
    const res = await getSettings();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      paused: true,
      channels: [{ id: "chan-wa", type: "whatsapp", identifier: "123", status: "active", tokenExpiresAt: null }],
      ...DEFAULTS,
    });
  });

  it("returns stored values, filling missing fields with defaults", async () => {
    seed({
      business_hours: { enabled: true, open: "10:00", close: "18:30", days: ["sat", "mon"] },
      window_alerts: { enabled: true },
    });
    const body = (await getSettings()).json();
    expect(body.paused).toBe(false);
    expect(body.businessHours).toEqual({ enabled: true, open: "10:00", close: "18:30", days: ["mon", "sat"] });
    expect(body.windowAlerts).toEqual({ enabled: true, thresholdMinutes: 120, target: "push" });
    expect(body.awayMessage).toEqual(DEFAULTS.awayMessage);
  });

  it("falls back to defaults for corrupt stored data", async () => {
    seed({ away_message: { enabled: "yes", text: 5 }, business_hours: "nope" });
    const body = (await getSettings()).json();
    expect(body.awayMessage).toEqual(DEFAULTS.awayMessage);
    expect(body.businessHours).toEqual(DEFAULTS.businessHours);
  });

  it("forbids staff (403)", async () => {
    expect((await getSettings(staffToken)).statusCode).toBe(403);
  });
});

describe("PATCH /settings", () => {
  it("merges only the changed sections into businesses.settings (keeps automation_paused)", async () => {
    const res = await patchSettings({
      businessHours: { enabled: true, open: "10:00", close: "19:00", days: ["fri", "mon"] },
      windowAlerts: { thresholdMinutes: 60 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      paused: true,
      channels: [{ id: "chan-wa", type: "whatsapp", identifier: "123", status: "active", tokenExpiresAt: null }],
      businessHours: { enabled: true, open: "10:00", close: "19:00", days: ["mon", "fri"] },
      awayMessage: DEFAULTS.awayMessage,
      windowAlerts: { enabled: false, thresholdMinutes: 60, target: "push" },
    });

    const [update] = fake.queries.filter((q) => q.op === "update" && q.table === "businesses");
    expect(Object.keys(update!.set!)).toEqual(["settings"]);
    const set = render(update!.set!.settings);
    // jsonb concatenation: existing keys survive
    expect(set.sql).toBe(`coalesce("businesses"."settings", '{}'::jsonb) || $1::jsonb`);
    expect(JSON.parse(set.params[0] as string)).toEqual({
      business_hours: { enabled: true, open: "10:00", close: "19:00", days: ["mon", "fri"] },
      window_alerts: { enabled: false, thresholdMinutes: 60, target: "push" },
    });
    expect(render(update!.where).params).toEqual(["biz-1"]);

    const audit = fake.rows("audit_log");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      businessId: "biz-1",
      actorId: "admin-1",
      actorType: "admin",
      action: "settings_updated",
      details: { changed: ["businessHours", "windowAlerts"] },
    });
    expect(rt.emitSettingsUpdated).toHaveBeenCalledWith("biz-1", { paused: true });
  });

  it("merges a partial section onto the stored value", async () => {
    seed({ automation_paused: false, away_message: { enabled: false, text: "Back at 9am" } });
    const res = await patchSettings({ awayMessage: { enabled: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().awayMessage).toEqual({ enabled: true, text: "Back at 9am" });
    expect(res.json().paused).toBe(false);
  });

  it.each([
    ["empty body", {}],
    ["unknown top-level key", { paused: true }],
    ["unknown nested key", { awayMessage: { enabled: true, html: "<b>" } }],
    ["bad time format", { businessHours: { open: "9:00" } }],
    ["24:00 is not a time", { businessHours: { close: "24:00" } }],
    ["close before open", { businessHours: { open: "18:00", close: "09:00" } }],
    ["close equals open", { businessHours: { open: "09:00", close: "09:00" } }],
    ["close before stored open", { businessHours: { close: "08:00" } }],
    ["empty days", { businessHours: { days: [] } }],
    ["duplicate days", { businessHours: { days: ["mon", "mon"] } }],
    ["unknown day", { businessHours: { days: ["monday"] } }],
    ["empty away text", { awayMessage: { text: "   " } }],
    ["away text too long", { awayMessage: { text: "x".repeat(501) } }],
    ["threshold not allowed", { windowAlerts: { thresholdMinutes: 90 } }],
    ["unknown target", { windowAlerts: { target: "email" } }],
    ["non-boolean enabled", { windowAlerts: { enabled: "true" } }],
  ])("rejects %s (400, nothing written)", async (_name, payload) => {
    const res = await patchSettings(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
    expect(fake.queries.some((q) => q.op === "update" || q.op === "insert")).toBe(false);
    expect(rt.emitSettingsUpdated).not.toHaveBeenCalled();
  });

  it("reports the section in validation error paths", async () => {
    const res = await patchSettings({ businessHours: { open: "18:00", close: "09:00" } });
    expect(res.json().details).toEqual([{ path: "businessHours.close", message: "close must be after open" }]);
  });

  it("accepts 500-char away text", async () => {
    const res = await patchSettings({ awayMessage: { enabled: true, text: "x".repeat(500) } });
    expect(res.statusCode).toBe(200);
  });

  it("forbids staff (403)", async () => {
    const res = await patchSettings({ awayMessage: { enabled: true } }, staffToken);
    expect(res.statusCode).toBe(403);
    expect(fake.queries.some((q) => q.op === "update")).toBe(false);
  });
});

describe("GET /audit-log filters", () => {
  beforeEach(() => {
    fake.reset();
    fake.onSelect = (q) => (q.fields && "count" in q.fields ? [{ count: 0 }] : []);
  });

  const getLog = (query: string, token = adminToken) =>
    app.inject({ method: "GET", url: `/audit-log?${query}`, headers: { authorization: `Bearer ${token}` } });

  it("filters by actorType", async () => {
    const res = await getLog("actorType=ai");
    expect(res.statusCode).toBe(200);
    for (const w of fake.wheres({ table: "audit_log" })) {
      expect(w.sql).toContain(`"audit_log"."actor_type" = $`);
      expect(w.params).toContain("ai");
    }
    expect(fake.wheres({ table: "audit_log" })).toHaveLength(2); // page + count
  });

  it("filters by actionPrefix with LIKE, escaping wildcards", async () => {
    await getLog("actionPrefix=order_");
    for (const w of fake.wheres({ table: "audit_log" })) {
      expect(w.sql).toContain(`"audit_log"."action" like $`);
      expect(w.params).toContain("order\\_%");
    }
    fake.reset();
    await getLog(`actionPrefix=${encodeURIComponent("50%\\x")}`);
    expect(fake.wheres({ table: "audit_log" })[0]!.params).toContain("50\\%\\\\x%");
  });

  it("combines with existing filters", async () => {
    await getLog("actorType=admin&actionPrefix=payment_&actorId=admin-1&action=payment_recorded");
    const [w] = fake.wheres({ table: "audit_log" });
    expect(w!.params).toEqual(expect.arrayContaining(["biz-1", "admin-1", "payment_recorded", "admin", "payment\\_%"]));
  });

  it("rejects an unknown actorType or empty actionPrefix (400)", async () => {
    expect((await getLog("actorType=robot")).statusCode).toBe(400);
    expect((await getLog("actionPrefix=")).statusCode).toBe(400);
  });

  it("forbids staff (403)", async () => {
    expect((await getLog("actorType=ai", staffToken)).statusCode).toBe(403);
  });
});
