import { beforeAll, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

// In-memory tables. WHERE clauses are rendered with the real Postgres dialect and
// a row matches when every bound parameter equals one of its column values —
// enough for the eq()/and() lookups the simulate route uses.
const tables: Record<string, any[]> = { channels: [], customers: [], conversations: [], messages: [] };
const dialect = new PgDialect();
const tableName = (t: any): string => t?.[Symbol.for("drizzle:Name")] ?? "";

function matches(row: any, where: any): boolean {
  if (!where) return true;
  const { params } = dialect.sqlToQuery(where);
  const values = Object.values(row);
  return params.every((p) => values.includes(p));
}

vi.mock("../src/db/index.ts", () => {
  let n = 0;
  const fakeDb: any = {
    select: () => ({
      from: (table: any) => {
        const name = tableName(table);
        let where: any;
        const chain: any = {
          where: (w: any) => {
            where = w;
            return chain;
          },
          then: (res: any, rej: any) =>
            Promise.resolve()
              .then(() => (tables[name] ?? []).filter((r) => matches(r, where)))
              .then(res, rej),
        };
        return chain;
      },
    }),
    insert: (table: any) => ({
      values: (vals: any) => {
        const name = tableName(table);
        const insert = () => {
          const row = { id: `${name}-${++n}`, ...vals };
          (tables[name] ??= []).push(row);
          return [row];
        };
        const chain: any = {
          returning: () => Promise.resolve(insert()),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(insert()) }),
          then: (res: any, rej: any) => Promise.resolve().then(insert).then(res, rej),
        };
        return chain;
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(fakeDb),
  };
  return { db: fakeDb, schema: {}, sql: { end: vi.fn() } };
});

vi.mock("../src/queue/enqueue.ts", () => ({
  enqueueProcessMessage: vi.fn(async () => ({ mode: "queued", jobId: "job-1" })),
}));

let app: any;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ sub: "admin-1", businessId: "biz-1", role: "admin", name: "Asha" });
});

const simulate = (customerName: string, channel: "whatsapp" | "instagram") =>
  app.inject({
    method: "POST",
    url: "/simulate/message",
    headers: { authorization: `Bearer ${token}` },
    payload: { customerName, channel, text: "hello" },
  });

describe("POST /simulate/message customer scoping", () => {
  it("keeps one channel row per type and separates the same name across channels", async () => {
    const wa1 = await simulate("Rahul", "whatsapp");
    const ig1 = await simulate("Rahul", "instagram");
    const wa2 = await simulate("Rahul", "whatsapp");

    expect([wa1.statusCode, ig1.statusCode, wa2.statusCode]).toEqual([202, 202, 202]);

    // One demo channel per type.
    expect(tables.channels!.map((c) => c.type).sort()).toEqual(["instagram", "whatsapp"]);

    // Same name on WhatsApp and Instagram -> two customers, each tied to its channel.
    expect(tables.customers).toHaveLength(2);
    const channelIds = new Set(tables.customers!.map((c) => c.channelId));
    expect(channelIds.size).toBe(2);

    // Separate conversations per channel; repeat WhatsApp message reuses the first.
    expect(wa1.json().conversationId).not.toBe(ig1.json().conversationId);
    expect(wa2.json().conversationId).toBe(wa1.json().conversationId);
    expect(tables.conversations).toHaveLength(2);
  });
});
