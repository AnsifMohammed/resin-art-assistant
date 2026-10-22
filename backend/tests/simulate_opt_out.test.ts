import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake } from "./fakeDb.ts";

applyTestEnv();

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const enqueueProcessMessage = vi.hoisted(() => vi.fn(async () => ({ mode: "queued", jobId: "job-1" })));
vi.mock("../src/queue/enqueue.ts", () => ({ enqueueProcessMessage, clearInlineTimers: vi.fn() }));

const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitCustomerUpdated: vi.fn(),
  emitBroadcastUpdated: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

let app: any;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import("../src/index.ts");
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ sub: "admin-1", businessId: "biz-1", role: "admin", name: "Asha" });
});

beforeEach(() => {
  fake.reset({ channels: [], customers: [], conversations: [], messages: [], audit_log: [] });
  enqueueProcessMessage.mockClear();
  Object.values(rt).forEach((fn) => fn.mockClear());
});

const simulate = (text: string) =>
  app.inject({
    method: "POST",
    url: "/simulate/message",
    headers: { authorization: `Bearer ${token}` },
    payload: { customerName: "Rahul", channel: "whatsapp", text },
  });

describe("POST /simulate/message opt-out keywords", () => {
  it("STOP opts out, acknowledges and skips the AI; START opts back in", async () => {
    const first = await simulate("hello");
    expect(first.json()).toMatchObject({ queued: "queued", optAction: null });
    expect(enqueueProcessMessage).toHaveBeenCalledTimes(1);
    enqueueProcessMessage.mockClear();

    const stop = await simulate("Stop.");
    expect(stop.statusCode).toBe(202);
    expect(stop.json()).toMatchObject({ queued: "skipped", optAction: "opt_out" });
    expect(enqueueProcessMessage).not.toHaveBeenCalled();

    const cust = fake.rows("customers")[0]!;
    expect(cust).toMatchObject({ optedOut: true, optOutSource: "keyword" });
    expect(cust.optedOutAt).toBeInstanceOf(Date);
    expect(fake.rows("audit_log").map((a) => a.action)).toEqual(["customer_opted_out"]);
    expect(rt.emitCustomerUpdated).toHaveBeenCalledWith("biz-1", { customerId: cust.id });

    const ack = fake.rows("messages").at(-1)!;
    expect(ack).toMatchObject({
      direction: "outbound",
      senderType: "system",
      deliveryStatus: "sent",
      content: "You won't receive offers from us anymore. Reply START to subscribe again.",
    });

    const start = await simulate("START");
    expect(start.json()).toMatchObject({ queued: "skipped", optAction: "opt_in" });
    expect(fake.rows("customers")[0]).toMatchObject({ optedOut: false, optedOutAt: null, optOutSource: null });
    expect(fake.rows("audit_log").map((a) => a.action)).toEqual(["customer_opted_out", "customer_opted_in"]);
    expect(fake.rows("messages").at(-1)!.content).toBe("You're subscribed again 😊");
    expect(enqueueProcessMessage).not.toHaveBeenCalled();

    // A subscribed customer's "start" is just a message.
    const again = await simulate("start");
    expect(again.json()).toMatchObject({ queued: "queued", optAction: null });
    expect(enqueueProcessMessage).toHaveBeenCalledTimes(1);
  });
});
