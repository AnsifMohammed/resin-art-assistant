import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// Demo mode with no Meta secrets configured. Empty strings (not delete) so
// dotenv cannot fill them from a local .env; config treats "" as unset.
applyTestEnv({
  DEMO_MODE: "true",
  META_APP_SECRET: "",
  META_VERIFY_TOKEN: "",
});

const h = vi.hoisted(() => ({
  inserts: [] as { table: string; val: any }[],
  enqueue: vi.fn(async () => ({ mode: "inline", jobId: null })),
}));

vi.mock("../src/db/index.ts", () => {
  const name = (t: any): string => t?.[Symbol.for("drizzle:Name")] || "";
  const rows: Record<string, any[]> = {
    channels: [{ id: "chan-wa", type: "whatsapp" }],
    customers: [{ id: "cust-wa", handleOrPhone: "919876543210" }],
    conversations: [{ id: "conv-1", customerId: "cust-wa", state: "ai_active" }],
  };
  const doInsert = (table: string, val: any) => {
    h.inserts.push({ table, val });
    return Promise.resolve([{ id: `${table}-new`, ...val }]);
  };
  return {
    db: {
      select: () => ({ from: (t: any) => ({ where: () => Promise.resolve([...(rows[name(t)] ?? [])]) }) }),
      insert: (t: any) => ({
        values: (val: any) => ({
          onConflictDoNothing: () => ({ returning: () => doInsert(name(t), val) }),
          returning: () => doInsert(name(t), val),
          then: (resolve: any, reject: any) => doInsert(name(t), val).then(() => resolve(), reject),
        }),
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
    schema: {},
    sql: { end: vi.fn() },
  };
});

vi.mock("../src/queue/enqueue.ts", () => ({ enqueueProcessMessage: h.enqueue, clearInlineTimers: vi.fn() }));
vi.mock("../src/queue/jobs/processMessage.ts", () => ({ processMessageJob: vi.fn() }));

let app: Awaited<ReturnType<typeof import("../src/index.ts").buildServer>>;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
});

describe("Meta webhooks in demo mode without secrets", () => {
  it("GET handshake returns 403 when META_VERIFY_TOKEN is unset", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/webhook?hub.mode=subscribe&hub.verify_token=resin_art_verify_token&hub.challenge=abc",
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET handshake with an empty verify token is also rejected", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=abc",
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST without a signature is accepted when DEMO_MODE=true and META_APP_SECRET is unset", async () => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: "+91 90000 00000", phone_number_id: "1234567890" },
                contacts: [{ wa_id: "919876543210", profile: { name: "Aditi" } }],
                messages: [{ id: "wamid.demo", from: "919876543210", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { "content-type": "application/json" },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(h.inserts.filter((i) => i.table === "messages")).toHaveLength(1);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });
});
