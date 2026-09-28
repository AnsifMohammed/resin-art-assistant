import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

const h = vi.hoisted(() => ({
  listener: null as null | ((payload: string) => void),
  notify: vi.fn(async (_channel: string, _payload: string) => undefined),
  unlisten: vi.fn(async () => undefined),
  deliverLocal: vi.fn(async (_env: any) => undefined),
  messageRows: [] as any[],
}));

vi.mock("../src/db/index.ts", () => ({
  sql: {
    listen: async (_channel: string, cb: (payload: string) => void) => {
      h.listener = cb;
      return { unlisten: h.unlisten };
    },
    notify: h.notify,
  },
  db: {
    select: () => ({ from: () => ({ where: async () => h.messageRows }) }),
  },
}));

vi.mock("../src/realtime/websocket.ts", () => ({ deliverLocal: h.deliverLocal }));

let bus: typeof import("../src/realtime/bus.ts");

const env = (content = "hi") => ({
  kind: "message:new" as const,
  businessId: "biz-1",
  conversationId: "conv-1",
  message: { id: "msg-1", conversationId: "conv-1", businessId: "biz-1", content } as any,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  bus = await import("../src/realtime/bus.ts");
});

beforeEach(() => {
  h.notify.mockClear();
  h.deliverLocal.mockClear();
  h.messageRows = [];
});

describe("realtime bus (Postgres NOTIFY fan-out)", () => {
  it("delivers locally only until the bus is started", () => {
    bus.publish(env());
    expect(h.deliverLocal).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("once started, delivers locally and broadcasts; its own notifications are ignored", async () => {
    await bus.startRealtimeBus();
    bus.publish(env());
    expect(h.deliverLocal).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [channel, payload] = h.notify.mock.calls[0]!;
    expect(channel).toBe("realtime_events");

    h.listener!(payload); // echo of our own NOTIFY
    await flush();
    expect(h.deliverLocal).toHaveBeenCalledTimes(1);
  });

  it("delivers envelopes published by other processes", async () => {
    h.listener!(JSON.stringify({ origin: "other-process", env: env("from elsewhere") }));
    await flush();
    expect(h.deliverLocal).toHaveBeenCalledWith(env("from elsewhere"));
  });

  it("sends a reference for oversized messages; receivers reload the row (same business only)", async () => {
    const big = "മ".repeat(4000); // 12 KB of UTF-8
    bus.publish(env(big));
    const payload = JSON.parse(h.notify.mock.calls[0]![1]);
    expect(payload.env).toBeUndefined();
    expect(payload.ref).toEqual({ businessId: "biz-1", conversationId: "conv-1", messageId: "msg-1" });

    h.deliverLocal.mockClear();
    h.messageRows = [{ id: "msg-1", conversationId: "conv-1", businessId: "biz-1", content: big }];
    h.listener!(JSON.stringify({ ...payload, origin: "other-process" }));
    await flush();
    expect(h.deliverLocal).toHaveBeenCalledWith(expect.objectContaining({ kind: "message:new", message: h.messageRows[0] }));

    h.deliverLocal.mockClear();
    h.listener!(JSON.stringify({ origin: "other-process", ref: { ...payload.ref, businessId: "biz-2" } }));
    await flush();
    expect(h.deliverLocal).not.toHaveBeenCalled();
  });

  it("ignores malformed notifications and stops cleanly", async () => {
    h.listener!("{not json");
    await flush();
    expect(h.deliverLocal).not.toHaveBeenCalled();
    await bus.stopRealtimeBus();
    expect(h.unlisten).toHaveBeenCalled();
    bus.publish(env());
    expect(h.notify).not.toHaveBeenCalled(); // local only after stop
    expect(h.deliverLocal).toHaveBeenCalledTimes(1);
  });
});
