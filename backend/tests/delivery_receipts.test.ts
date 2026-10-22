import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, type FakeQuery } from "./fakeDb.ts";

applyTestEnv();

const rt = vi.hoisted(() => ({ emitBroadcastUpdated: vi.fn(), emitMessageNew: vi.fn(), emitCustomerUpdated: vi.fn() }));
vi.mock("../src/realtime/events.ts", () => rt);
vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { applyWhatsAppStatus, canAdvance } = await import("../src/services/deliveryReceipts.ts");
const { resetBroadcastProgressThrottle } = await import("../src/services/broadcastProgress.ts");

const ALL = ["pending", "sent", "delivered", "read", "failed"] as const;
const MSG = { pending: "queued", sent: "sent", delivered: "delivered", read: "read", failed: "failed" } as const;

function statsAnswer(q: FakeQuery): any[] | undefined {
  if (q.table !== "broadcast_recipients" || !q.fields || !("count" in q.fields)) return undefined;
  const groups = new Map<string, any>();
  for (const r of fake.rows("broadcast_recipients")) {
    const g = groups.get(r.status) ?? { broadcastId: r.broadcastId, status: r.status, count: 0 };
    g.count++;
    groups.set(r.status, g);
  }
  return [...groups.values()];
}

function seed(status: (typeof ALL)[number]) {
  fake.reset({
    broadcasts: [{ id: "b-1", businessId: "biz-1", status: "sending" }],
    broadcast_recipients: [{ id: "r-1", businessId: "biz-1", broadcastId: "b-1", metaMessageId: "wamid.1", status, error: null }],
    messages: [{ id: "m-1", metaMessageId: "wamid.1", deliveryStatus: MSG[status] }],
  });
  fake.onSelect = statsAnswer;
}

beforeEach(() => {
  rt.emitBroadcastUpdated.mockClear();
  resetBroadcastProgressThrottle();
});

describe("canAdvance (forward-only)", () => {
  it("allows pending < sent < delivered < read, failed only from pending/sent", () => {
    const allowed = ALL.flatMap((from) =>
      (["sent", "delivered", "read", "failed"] as const).filter((to) => canAdvance(from, to)).map((to) => `${from}>${to}`),
    );
    expect(allowed).toEqual([
      "pending>sent", "pending>delivered", "pending>read", "pending>failed",
      "sent>delivered", "sent>read", "sent>failed",
      "delivered>read",
    ]);
  });
});

describe("applyWhatsAppStatus", () => {
  const cases: Array<[(typeof ALL)[number], string, (typeof ALL)[number]]> = [
    ["sent", "delivered", "delivered"],
    ["delivered", "read", "read"],
    ["pending", "read", "read"],
    ["read", "delivered", "read"], // late delivered never downgrades read
    ["delivered", "sent", "delivered"],
    ["delivered", "failed", "delivered"], // failed only from pending/sent
    ["sent", "failed", "failed"],
    ["failed", "delivered", "failed"],
  ];

  it.each(cases)("%s + %s receipt → %s (recipient and message)", async (from, receipt, expected) => {
    seed(from);
    await applyWhatsAppStatus({ id: "wamid.1", status: receipt, timestamp: "1790589000" });
    expect(fake.rows("broadcast_recipients")[0]!.status).toBe(expected);
    expect(fake.rows("messages")[0]!.deliveryStatus).toBe(MSG[expected]);
  });

  it("sets deliveredAt / readAt from Meta's timestamp and the failure error", async () => {
    seed("sent");
    await applyWhatsAppStatus({ id: "wamid.1", status: "delivered", timestamp: "1790589000" });
    expect(fake.rows("broadcast_recipients")[0]!.deliveredAt).toEqual(new Date(1790589000_000));
    await applyWhatsAppStatus({ id: "wamid.1", status: "read", timestamp: "1790589060" });
    expect(fake.rows("broadcast_recipients")[0]!.readAt).toEqual(new Date(1790589060_000));

    seed("sent");
    await applyWhatsAppStatus({ id: "wamid.1", status: "failed", errors: [{ code: 131049, title: "Not delivered" }] });
    expect(fake.rows("broadcast_recipients")[0]).toMatchObject({ status: "failed", error: "131049: Not delivered" });
  });

  it("emits broadcast progress for the affected broadcast", async () => {
    seed("sent");
    await applyWhatsAppStatus({ id: "wamid.1", status: "delivered" });
    expect(rt.emitBroadcastUpdated).toHaveBeenCalledWith("biz-1", {
      broadcastId: "b-1",
      status: "sending",
      stats: { pending: 0, sent: 0, delivered: 1, read: 0, failed: 0 },
    });
  });

  it("throttles progress emits to one per 2s per broadcast (with a trailing emit)", async () => {
    vi.useFakeTimers();
    try {
      seed("pending");
      await applyWhatsAppStatus({ id: "wamid.1", status: "sent" });
      await applyWhatsAppStatus({ id: "wamid.1", status: "delivered" });
      await applyWhatsAppStatus({ id: "wamid.1", status: "read" });
      expect(rt.emitBroadcastUpdated).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(rt.emitBroadcastUpdated).toHaveBeenCalledTimes(2);
      expect(rt.emitBroadcastUpdated.mock.calls[1]![1].stats.read).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores unknown statuses and missing ids", async () => {
    seed("sent");
    await applyWhatsAppStatus({ id: "wamid.1", status: "deleted" });
    await applyWhatsAppStatus({ status: "read" });
    await applyWhatsAppStatus(null);
    expect(fake.queries).toHaveLength(0);
  });
});
