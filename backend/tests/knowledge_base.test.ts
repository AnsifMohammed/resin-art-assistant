import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

const stored: any[] = [];

vi.mock("../src/db/index.ts", () => {
  const fakeDb: any = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({
      values: (vals: any) => {
        const row = { id: "kb-1", updatedAt: new Date(), ...vals };
        return {
          onConflictDoUpdate: () => ({
            returning: () => {
              stored.push(row);
              return Promise.resolve([row]);
            },
          }),
          then: (res: any, rej: any) => Promise.resolve([row]).then(res, rej),
        };
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  };
  return { db: fakeDb, schema: {}, sql: { end: vi.fn() } };
});

const invalidateKBCache = vi.fn(async () => {});
vi.mock("../src/ai/prompt.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ai/prompt.ts")>()),
  invalidateKBCache,
}));

let app: any;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ sub: "admin-1", businessId: "biz-1", role: "admin", name: "Asha" });
});

beforeEach(() => {
  stored.length = 0;
  invalidateKBCache.mockClear();
});

const validKb = () => ({
  business_name: "Asha Resin Art",
  products: [{ id: "keychain-set-3", name: "Resin Keychain Set of 3", price: 450, lead_time_days: 3 }],
  policies: { returns: "No returns on custom orders.", extra_policy: "kept" },
  delivery: { zones: [{ area: "Thrissur city", days: "1-2", charge: 0 }] },
  tone_examples: [],
  some_future_section: { anything: true },
});

const put = (payload: unknown) =>
  app.inject({
    method: "PUT",
    url: "/knowledge-base",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

describe("PUT /knowledge-base validation", () => {
  it("accepts a valid KB, preserves unknown keys and invalidates the cache", async () => {
    const res = await put({ data: validKb() });

    expect(res.statusCode).toBe(200);
    expect(stored).toHaveLength(1);
    expect(stored[0].data).toEqual(validKb());
    expect(stored[0].data.some_future_section).toEqual({ anything: true });
    expect(stored[0].data.products[0].lead_time_days).toBe(3);
    expect(stored[0].data.policies.extra_policy).toBe("kept");
    expect(invalidateKBCache).toHaveBeenCalledWith("biz-1");
  });

  it("also accepts the KB object without a data wrapper", async () => {
    const res = await put(validKb());
    expect(res.statusCode).toBe(200);
    expect(stored[0].data.business_name).toBe("Asha Resin Art");
  });

  it.each([
    ["missing business_name", (kb: any) => delete kb.business_name],
    ["empty business_name", (kb: any) => (kb.business_name = "  ")],
    ["products not an array", (kb: any) => (kb.products = {})],
    ["product without id", (kb: any) => delete kb.products[0].id],
    ["product with non-positive price", (kb: any) => (kb.products[0].price = 0)],
    ["product with string price", (kb: any) => (kb.products[0].price = "450")],
    ["missing policies", (kb: any) => delete kb.policies],
  ])("rejects %s with 400 VALIDATION_ERROR", async (_label, mutate) => {
    const kb = validKb();
    mutate(kb);
    const res = await put({ data: kb });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(typeof res.json().error).toBe("string");
    expect(stored).toHaveLength(0);
    expect(invalidateKBCache).not.toHaveBeenCalled();
  });

  it("rejects a non-object body", async () => {
    const res = await put([1, 2]);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});
