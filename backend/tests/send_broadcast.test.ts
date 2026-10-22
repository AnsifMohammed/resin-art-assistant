import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, type FakeQuery } from "./fakeDb.ts";

applyTestEnv();

const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitBroadcastUpdated: vi.fn(),
  emitCustomerUpdated: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

const sendMessage = vi.hoisted(() => vi.fn(async (_opts: any) => ({ metaMessageId: null as string | null })));
vi.mock("../src/services/send.ts", () => ({ sendMessage }));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const { sendBroadcastJob, claimDueBroadcasts, BROADCAST_BATCH_SIZE } = await import("../src/queue/jobs/sendBroadcast.ts");
const { resetBroadcastProgressThrottle } = await import("../src/services/broadcastProgress.ts");

const template = {
  id: "tpl-1",
  businessId: "biz-1",
  name: "Offer",
  channel: "whatsapp",
  body: "Hi {customerName}, {offer}",
  variables: ["customerName", "offer"],
  isActive: true,
  metaTemplateName: "offer",
  metaStatus: "approved",
};

const broadcast = (over: Record<string, any> = {}) => ({
  id: "b-1",
  businessId: "biz-1",
  name: "Offer blast",
  templateId: "tpl-1",
  segment: "all",
  filters: {},
  variables: { offer: "20% off" },
  status: "sending",
  recipientCount: 0,
  startedAt: new Date(),
  ...over,
});

const customer = (id: string, over: Record<string, any> = {}) => ({
  id,
  businessId: "biz-1",
  name: `Name ${id}`,
  handleOrPhone: `91${id}`,
  optedOut: false,
  ...over,
});

/** Audience = not-opted-out customers at snapshot time (segment SQL is covered elsewhere). */
let audience: Array<{ customerId: string; phone: string; conversationId: string | null }> = [];
/** Number of pending-recipient batch queries. */
let batches = 0;

function answer(q: FakeQuery): any[] | undefined {
  if (!q.fields) return undefined;
  if (q.table === "customers" && "phone" in q.fields) return audience;
  if (q.table === "broadcast_recipients" && "recipient" in q.fields) {
    batches++;
    return fake
      .rows("broadcast_recipients")
      .filter((r) => r.status === "pending")
      .slice(0, q.limit)
      .map((r) => {
        const c = fake.rows("customers").find((x) => x.id === r.customerId);
        return { recipient: { ...r }, customerId: c?.id ?? null, customerName: c?.name ?? null, optedOut: c?.optedOut ?? null };
      });
  }
  if (q.table === "broadcast_recipients" && "count" in q.fields) {
    const groups = new Map<string, any>();
    for (const r of fake.rows("broadcast_recipients")) {
      const g = groups.get(r.status) ?? { broadcastId: r.broadcastId, status: r.status, count: 0 };
      g.count++;
      groups.set(r.status, g);
    }
    return [...groups.values()];
  }
  return undefined;
}

beforeEach(() => {
  fake.reset({
    broadcasts: [broadcast()],
    message_templates: [template],
    customers: [customer("c1"), customer("c2"), customer("c3")],
    broadcast_recipients: [],
    messages: [],
    audit_log: [],
  });
  fake.unique = { broadcast_recipients: ["broadcastId", "customerId"] };
  fake.onSelect = answer;
  audience = [
    { customerId: "c1", phone: "91c1", conversationId: "conv-1" },
    { customerId: "c2", phone: "91c2", conversationId: null },
    { customerId: "c3", phone: "91c3", conversationId: "conv-3" },
  ];
  batches = 0;
  sendMessage.mockReset();
  sendMessage.mockImplementation(async () => ({ metaMessageId: null }));
  Object.values(rt).forEach((fn) => fn.mockClear());
  resetBroadcastProgressThrottle();
});

const run = () => sendBroadcastJob({ broadcastId: "b-1", businessId: "biz-1" });
const recipients = () => fake.rows("broadcast_recipients");
const bRow = () => fake.rows("broadcasts")[0]!;

describe("sendBroadcastJob", () => {
  it("snapshots the audience, sends to everyone and finishes as sent", async () => {
    const result = await run();
    expect(result.outcome).toBe("sent");
    expect(recipients().map((r) => [r.customerId, r.status])).toEqual([["c1", "sent"], ["c2", "sent"], ["c3", "sent"]]);
    expect(bRow()).toMatchObject({ status: "sent", recipientCount: 3, error: null });
    expect(bRow().completedAt).toBeInstanceOf(Date);

    // Rendered per recipient; WhatsApp only.
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage.mock.calls[0]![0]).toMatchObject({ channelType: "whatsapp", recipient: "91c1", text: "Hi Name c1, 20% off", conversationId: "conv-1" });
    expect(sendMessage.mock.calls[1]![0]).toMatchObject({ recipient: "91c2", conversationId: null });

    // Thread messages only where a conversation exists; none is created.
    const msgs = fake.rows("messages");
    expect(msgs.map((m) => m.conversationId)).toEqual(["conv-1", "conv-3"]);
    expect(msgs[0]).toMatchObject({
      direction: "outbound",
      senderType: "system",
      deliveryStatus: "sent",
      metadata: { kind: "broadcast", broadcastId: "b-1", templateId: "tpl-1" },
    });
    expect(recipients()[0]!.messageId).toBe(msgs[0]!.id);
    expect(recipients()[1]!.messageId).toBeNull();
    expect(fake.rows("conversations") ?? []).toHaveLength(0);

    const audit = fake.rows("audit_log").find((a) => a.action === "broadcast_sent");
    expect(audit).toMatchObject({ actorType: "system", details: { broadcastId: "b-1", status: "sent", sent: 3, failed: 0 } });
    expect(rt.emitBroadcastUpdated).toHaveBeenLastCalledWith("biz-1", {
      broadcastId: "b-1",
      status: "sent",
      stats: { pending: 0, sent: 3, delivered: 0, read: 0, failed: 0 },
    });
  });

  it("stores Meta's message id for receipts", async () => {
    sendMessage.mockImplementation(async (opts: any) => ({ metaMessageId: `wamid.${opts.recipient}` }));
    await run();
    expect(recipients()[0]).toMatchObject({ metaMessageId: "wamid.91c1" });
    expect(fake.rows("messages")[0]).toMatchObject({ metaMessageId: "wamid.91c1" });
  });

  it("skips customers who opted out after the snapshot (marked failed: opted_out)", async () => {
    fake.rows("customers")[1]!.optedOut = true;
    const result = await run();
    expect(result.outcome).toBe("sent");
    expect(recipients().find((r) => r.customerId === "c2")).toMatchObject({ status: "failed", error: "opted_out" });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map((c) => c[0].recipient)).not.toContain("91c2");
  });

  it("marks failed sends and finishes failed when every recipient failed", async () => {
    sendMessage.mockRejectedValue(new Error("network down"));
    const result = await run();
    expect(result.outcome).toBe("failed");
    expect(recipients().every((r) => r.status === "failed" && r.error === "network down")).toBe(true);
    expect(bRow()).toMatchObject({ status: "failed", error: "all_recipients_failed" });
    expect(fake.rows("messages").every((m) => m.deliveryStatus === "failed")).toBe(true);
  });

  it("partial failure still finishes as sent", async () => {
    sendMessage.mockImplementation(async (opts: any) => {
      if (opts.recipient === "91c3") throw new Error("bad number");
      return { metaMessageId: null };
    });
    expect((await run()).outcome).toBe("sent");
    expect(recipients().map((r) => r.status)).toEqual(["sent", "sent", "failed"]);
  });

  it("stops between batches when cancelled", async () => {
    audience = Array.from({ length: BROADCAST_BATCH_SIZE + 5 }, (_, i) => ({
      customerId: `x${i}`,
      phone: `91x${i}`,
      conversationId: null,
    }));
    for (let i = 0; i < audience.length; i++) fake.rows("customers").push(customer(`x${i}`));
    // The admin cancels while the first batch is going out.
    let sends = 0;
    sendMessage.mockImplementation(async () => {
      if (++sends === 10) bRow().status = "cancelled";
      return { metaMessageId: null };
    });

    const result = await run();
    expect(result.outcome).toBe("cancelled");
    // The current batch finishes; the next one never starts.
    expect(sendMessage).toHaveBeenCalledTimes(BROADCAST_BATCH_SIZE);
    expect(batches).toBe(1);
    expect(recipients().filter((r) => r.status === "pending")).toHaveLength(5);
    expect(bRow().status).toBe("cancelled");
    expect(fake.rows("audit_log").some((a) => a.action === "broadcast_sent")).toBe(false);
  });

  it("is idempotent on retry: keeps the snapshot and only sends pending recipients", async () => {
    // A previous attempt snapshotted and sent to c1, then crashed.
    fake.rows("broadcast_recipients").push(
      { id: "r1", businessId: "biz-1", broadcastId: "b-1", customerId: "c1", phone: "91c1", status: "sent", conversationId: "conv-1", createdAt: new Date() },
      { id: "r2", businessId: "biz-1", broadcastId: "b-1", customerId: "c2", phone: "91c2", status: "pending", conversationId: null, createdAt: new Date() },
    );
    audience.push({ customerId: "c4", phone: "91c4", conversationId: null }); // joined after the snapshot

    expect((await run()).outcome).toBe("sent");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![0].recipient).toBe("91c2");
    expect(recipients().map((r) => r.customerId)).toEqual(["c1", "c2"]);

    // A second retry after success does nothing.
    sendMessage.mockClear();
    expect((await run()).outcome).toBe("skipped");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does nothing unless the broadcast is sending", async () => {
    bRow().status = "scheduled";
    expect((await run()).outcome).toBe("skipped");
    expect(recipients()).toHaveLength(0);
  });

  it("fails the broadcast when the template is no longer approved", async () => {
    fake.rows("message_templates")[0]!.metaStatus = "rejected";
    expect((await run()).outcome).toBe("failed");
    expect(bRow()).toMatchObject({ status: "failed", error: "template_not_approved" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("fails with empty_audience when nobody matches any more", async () => {
    audience = [];
    expect((await run()).outcome).toBe("failed");
    expect(bRow()).toMatchObject({ status: "failed", error: "empty_audience" });
  });
});

describe("claimDueBroadcasts", () => {
  it("claims only due scheduled broadcasts and marks them sending", async () => {
    const now = new Date();
    fake.reset({
      broadcasts: [
        broadcast({ id: "due", status: "scheduled", scheduledAt: new Date(now.getTime() - 1000), startedAt: null }),
        broadcast({ id: "later", status: "scheduled", scheduledAt: new Date(now.getTime() + 600_000), startedAt: null }),
        broadcast({ id: "draft", status: "draft", scheduledAt: new Date(now.getTime() - 1000), startedAt: null }),
      ],
    });
    fake.onSelect = answer;
    const claimed = await claimDueBroadcasts(now);
    expect(claimed).toEqual([{ broadcastId: "due", businessId: "biz-1" }]);
    expect(fake.rows("broadcasts").map((b) => [b.id, b.status])).toEqual([["due", "sending"], ["later", "scheduled"], ["draft", "draft"]]);
    expect(fake.rows("broadcasts")[0]!.startedAt).toEqual(now);
  });
});
