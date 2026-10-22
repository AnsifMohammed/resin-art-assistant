import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

// ─── In-memory message_templates table ────────────────────────────────────────
// WHERE clauses are rendered with the real Postgres dialect and evaluated for
// the simple AND-ed comparisons the routes use, so tests check the actual filter.

interface State {
  templates: any[];
  audit: any[];
  wheres: Array<{ sql: string; params: unknown[] }>;
}

const state: State = { templates: [], audit: [], wheres: [] };
const dialect = new PgDialect();
const tableName = (t: any): string => t?.[Symbol.for("drizzle:Name")] ?? "";
const camel = (col: string) => col.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

function matcher(cond: any): (row: any) => boolean {
  if (!cond) return () => true;
  const { sql, params } = dialect.sqlToQuery(cond);
  state.wheres.push({ sql, params });
  const checks: Array<(row: any) => boolean> = [];
  for (const m of sql.matchAll(/"message_templates"\."(\w+)" (=|<>) \$(\d+)/g)) {
    const [, col, op, idx] = m;
    const value = params[Number(idx) - 1];
    checks.push((row) => (op === "=" ? row[camel(col!)] === value : row[camel(col!)] !== value));
  }
  for (const m of sql.matchAll(/"message_templates"\."(\w+)" in \(([^)]*)\)/g)) {
    const [, col, list] = m;
    const values = [...list!.matchAll(/\$(\d+)/g)].map((p) => params[Number(p[1]) - 1]);
    checks.push((row) => values.includes(row[camel(col!)]));
  }
  return (row) => checks.every((c) => c(row));
}

const project = (rows: any[], fields?: Record<string, unknown>) =>
  fields ? rows.map((r) => Object.fromEntries(Object.keys(fields).map((k) => [k, r[k]]))) : rows;

function chain(run: (cond: any) => any[], extra: Record<string, any> = {}): any {
  let cond: any;
  const c: any = {
    where: (w: any) => ((cond = w), c),
    orderBy: () => c,
    then: (res: any, rej: any) => Promise.resolve().then(() => run(cond)).then(res, rej),
    ...Object.fromEntries(Object.entries(extra).map(([k, fn]) => [k, (...a: any[]) => fn(cond, ...a)])),
  };
  return c;
}

vi.mock("../src/db/index.ts", () => {
  const fakeDb: any = {
    select: (fields?: any) => ({
      from: (table: any) =>
        chain((cond) => {
          if (tableName(table) !== "message_templates") return [];
          const sorted = [...state.templates].sort(
            (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
          );
          return project(sorted.filter(matcher(cond)), fields);
        }),
    }),
    insert: (table: any) => ({
      values: (vals: any) => {
        const run = () => {
          if (tableName(table) === "audit_log") {
            state.audit.push(vals);
            return [vals];
          }
          if (state.templates.some((t) => t.businessId === vals.businessId && t.name === vals.name)) {
            throw Object.assign(new Error("duplicate key"), { code: "23505" });
          }
          const row = {
            id: `tpl-${state.templates.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...vals,
          };
          state.templates.push(row);
          return [row];
        };
        return {
          returning: () => Promise.resolve().then(run),
          then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej),
        };
      },
    }),
    update: () => ({
      set: (vals: any) =>
        chain(() => [], {
          returning: (cond: any) =>
            Promise.resolve().then(() => {
              const rows = state.templates.filter(matcher(cond));
              rows.forEach((r) => Object.assign(r, vals, { updatedAt: new Date() }));
              return rows;
            }),
        }),
    }),
    delete: () =>
      chain(() => [], {
        returning: (cond: any, fields?: any) =>
          Promise.resolve().then(() => {
            const match = matcher(cond);
            const removed = state.templates.filter(match);
            state.templates = state.templates.filter((r) => !match(r));
            return project(removed, fields);
          }),
      }),
  };
  return { db: fakeDb, schema: {}, sql: { end: vi.fn() } };
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

const tpl = (over: Record<string, any>) => ({
  businessId: "biz-1",
  category: "general",
  channel: "both",
  body: "Hi {customerName}",
  variables: ["customerName"],
  isActive: true,
  metaTemplateName: null,
  metaStatus: "not_submitted",
  createdByUserId: "admin-1",
  updatedByUserId: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  state.templates = [
    tpl({ id: "t-active", name: "Thank you", category: "general" }),
    tpl({ id: "t-inactive", name: "Old offer", category: "festive", isActive: false }),
    tpl({ id: "t-wa", name: "Dispatched", category: "delivery", channel: "whatsapp" }),
    tpl({ id: "t-ig", name: "IG hello", category: "general", channel: "instagram" }),
    tpl({ id: "t-other-biz", name: "Other", businessId: "biz-2" }),
  ];
  state.audit = [];
  state.wheres = [];
});

const call = (method: string, url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

const ids = (res: any) => res.json().templates.map((t: any) => t.id);

describe("GET /templates", () => {
  it("admin sees all of the business's templates (active and inactive), sorted by category then name", async () => {
    const res = await call("GET", "/templates", adminToken);
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual(["t-wa", "t-inactive", "t-ig", "t-active"]);
    expect(res.json().templates[0]).toEqual({
      id: "t-wa",
      name: "Dispatched",
      category: "delivery",
      channel: "whatsapp",
      body: "Hi {customerName}",
      variables: ["customerName"],
      isActive: true,
      metaTemplateName: null,
      metaStatus: "not_submitted",
      createdByUserId: "admin-1",
      updatedByUserId: "admin-1",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("admin can filter by active, category and channel (channel includes 'both')", async () => {
    expect(ids(await call("GET", "/templates?active=false", adminToken))).toEqual(["t-inactive"]);
    expect(ids(await call("GET", "/templates?category=general", adminToken))).toEqual(["t-ig", "t-active"]);
    expect(ids(await call("GET", "/templates?channel=whatsapp", adminToken))).toEqual(["t-wa", "t-inactive", "t-active"]);
  });

  it("staff only ever get active templates; the active param is ignored for them", async () => {
    const res = await call("GET", "/templates?active=false", staffToken);
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual(["t-wa", "t-ig", "t-active"]);

    const all = await call("GET", "/templates", staffToken);
    expect(ids(all)).toEqual(["t-wa", "t-ig", "t-active"]);
    const where = state.wheres.at(-1)!;
    expect(where.sql).toContain('"message_templates"."is_active" = $');
    expect(where.params).toContain(true);
    expect(where.params).toContain("biz-1");
  });

  it("rejects an invalid filter", async () => {
    const res = await call("GET", "/templates?channel=sms", adminToken);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /templates/:id", () => {
  it("returns a template; staff get 404 for an inactive one, admin does not", async () => {
    expect((await call("GET", "/templates/t-active", staffToken)).json().template.id).toBe("t-active");
    expect((await call("GET", "/templates/t-inactive", staffToken)).statusCode).toBe(404);
    expect((await call("GET", "/templates/t-inactive", adminToken)).statusCode).toBe(200);
  });

  it("404s for another business's template", async () => {
    const res = await call("GET", "/templates/t-other-biz", adminToken);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("TEMPLATE_NOT_FOUND");
  });
});

describe("POST /templates", () => {
  it("creates a template with variables computed server-side and audits it", async () => {
    const res = await call("POST", "/templates", adminToken, {
      name: "  Payment received  ",
      category: "payment",
      body: "Hi {customerName}, got ₹{amount} for {product}. Thanks {customerName}!",
      variables: ["ignored"],
    });

    expect(res.statusCode).toBe(201);
    const { template } = res.json();
    expect(template).toMatchObject({
      name: "Payment received",
      category: "payment",
      channel: "both",
      variables: ["customerName", "amount", "product"],
      isActive: true,
      metaTemplateName: null,
      metaStatus: "not_submitted",
      createdByUserId: "admin-1",
      updatedByUserId: "admin-1",
    });
    expect(state.audit).toEqual([
      expect.objectContaining({
        action: "template_created",
        actorType: "admin",
        actorId: "admin-1",
        details: { templateId: template.id, name: "Payment received" },
      }),
    ]);
  });

  it("409 TEMPLATE_NAME_TAKEN for a duplicate name in the same business", async () => {
    const res = await call("POST", "/templates", adminToken, { name: "Thank you", category: "general", body: "Hi" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("TEMPLATE_NAME_TAKEN");
    expect(state.audit).toHaveLength(0);
  });

  it("allows the same name as another business's template", async () => {
    const res = await call("POST", "/templates", adminToken, { name: "Other", category: "general", body: "Hi" });
    expect(res.statusCode).toBe(201);
  });

  it("400 when the body is too long for instagram (1000) but fine for whatsapp (1024)", async () => {
    const body = "x".repeat(1001);
    const ig = await call("POST", "/templates", adminToken, { name: "Long", category: "general", channel: "instagram", body });
    expect(ig.statusCode).toBe(400);
    expect(ig.json().code).toBe("VALIDATION_ERROR");
    expect(ig.json().details).toEqual([{ path: "body", message: expect.stringContaining("1000") }]);

    const both = await call("POST", "/templates", adminToken, { name: "Long", category: "general", body });
    expect(both.statusCode).toBe(400);

    const wa = await call("POST", "/templates", adminToken, { name: "Long", category: "general", channel: "whatsapp", body });
    expect(wa.statusCode).toBe(201);
  });

  it.each([
    ["empty name", { name: "  ", category: "general", body: "Hi" }],
    ["bad category", { name: "A", category: "promo", body: "Hi" }],
    ["empty body", { name: "A", category: "general", body: "   " }],
    ["bad metaTemplateName", { name: "A", category: "general", body: "Hi", metaTemplateName: "Order Shipped" }],
  ])("400 VALIDATION_ERROR for %s", async (_label, payload) => {
    const res = await call("POST", "/templates", adminToken, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /templates/:id", () => {
  it("updates fields, recomputes variables when the body changes and audits", async () => {
    const res = await call("PATCH", "/templates/t-active", adminToken, {
      body: "Thanks {customerName}, see you on {deliveryDate}",
      metaTemplateName: "thank_you",
      metaStatus: "pending",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().template).toMatchObject({
      name: "Thank you",
      variables: ["customerName", "deliveryDate"],
      metaTemplateName: "thank_you",
      metaStatus: "pending",
      updatedByUserId: "admin-1",
    });
    expect(state.audit[0]).toMatchObject({ action: "template_updated", details: { templateId: "t-active", name: "Thank you" } });
  });

  it("re-validates the existing body against a new, stricter channel", async () => {
    state.templates.push(tpl({ id: "t-long", name: "Long", channel: "whatsapp", body: "x".repeat(1010) }));
    const res = await call("PATCH", "/templates/t-long", adminToken, { channel: "instagram" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("409 when renaming onto an existing name; renaming to its own name is fine", async () => {
    expect((await call("PATCH", "/templates/t-active", adminToken, { name: "Dispatched" })).json().code).toBe(
      "TEMPLATE_NAME_TAKEN",
    );
    expect((await call("PATCH", "/templates/t-active", adminToken, { name: "Thank you" })).statusCode).toBe(200);
  });

  it("404 for an unknown template", async () => {
    const res = await call("PATCH", "/templates/nope", adminToken, { isActive: false });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /templates/:id", () => {
  it("hard deletes and audits; 404 the second time", async () => {
    const res = await call("DELETE", "/templates/t-active", adminToken);
    expect(res.statusCode).toBe(204);
    expect(state.templates.find((t) => t.id === "t-active")).toBeUndefined();
    expect(state.audit[0]).toMatchObject({ action: "template_deleted", details: { templateId: "t-active", name: "Thank you" } });

    expect((await call("DELETE", "/templates/t-active", adminToken)).statusCode).toBe(404);
  });
});

describe("POST /templates/:id/duplicate", () => {
  it('names copies "(Copy)" then "(Copy 2)" and resets Meta approval', async () => {
    state.templates.find((t) => t.id === "t-wa")!.metaTemplateName = "order_dispatched";
    state.templates.find((t) => t.id === "t-wa")!.metaStatus = "approved";

    const first = await call("POST", "/templates/t-wa/duplicate", adminToken);
    expect(first.statusCode).toBe(201);
    expect(first.json().template).toMatchObject({
      name: "Dispatched (Copy)",
      channel: "whatsapp",
      body: "Hi {customerName}",
      metaTemplateName: null,
      metaStatus: "not_submitted",
    });

    const second = await call("POST", "/templates/t-wa/duplicate", adminToken);
    expect(second.json().template.name).toBe("Dispatched (Copy 2)");
    expect(state.audit.map((a) => a.action)).toEqual(["template_duplicated", "template_duplicated"]);
  });
});

describe("staff cannot manage templates", () => {
  it.each([
    ["POST", "/templates", { name: "A", category: "general", body: "Hi" }],
    ["PATCH", "/templates/t-active", { isActive: false }],
    ["DELETE", "/templates/t-active", undefined],
    ["POST", "/templates/t-active/duplicate", undefined],
  ])("%s %s → 403", async (method, url, payload) => {
    const before = state.templates.length;
    const res = await call(method, url, staffToken, payload);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
    expect(state.templates).toHaveLength(before);
    expect(state.audit).toHaveLength(0);
  });
});
