import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// Realtime emits are asserted, not delivered.
const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitEscalationNew: vi.fn(),
  emitEscalationAssigned: vi.fn(),
  emitConversationAccessChanged: vi.fn(),
  emitSettingsUpdated: vi.fn(),
  disconnectUserEverywhere: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

interface State {
  conv: Record<string, any>;
  channel: Record<string, any> | null;
  openEscalations: any[];
  inserted: Record<string, any[]>;
  updates: Array<{ table: string; vals: any }>;
}

const state: State = { conv: {}, channel: null, openEscalations: [], inserted: {}, updates: [] };
const tableName = (t: any): string => t?.[Symbol.for("drizzle:Name")] ?? "";

function thenable<T>(value: () => T, extra: Record<string, any> = {}): any {
  const chain: any = {
    then: (res: any, rej: any) => Promise.resolve().then(value).then(res, rej),
    ...extra,
  };
  for (const m of ["where", "orderBy", "limit", "leftJoin", "innerJoin"]) chain[m] = () => chain;
  return chain;
}

vi.mock("../src/db/index.ts", () => {
  const fakeDb: any = {
    select: (fields?: any) => ({
      from: (table: any) =>
        thenable(() => {
          const name = tableName(table);
          if (fields?.conversation) {
            return [
              {
                conversation: { ...state.conv },
                customer: { id: "cust-1", name: "Meera", handleOrPhone: "meera_ig" },
                channel: state.channel,
              },
            ];
          }
          if (name === "escalations") return state.openEscalations;
          return [];
        }),
    }),
    insert: (table: any) => ({
      values: (vals: any) => {
        const name = tableName(table);
        const row = { id: `${name}-${(state.inserted[name]?.length ?? 0) + 1}`, ...vals };
        const record = () => {
          (state.inserted[name] ??= []).push(row);
          return [row];
        };
        return thenable(record, { returning: () => Promise.resolve(record()) });
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => {
        const apply = () => {
          state.updates.push({ table: tableName(table), vals });
          return [];
        };
        return { where: () => thenable(apply, { returning: () => Promise.resolve(apply()) }) };
      },
    }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(fakeDb),
  };
  return { db: fakeDb, schema: {}, sql: { end: vi.fn() } };
});

const sendMessage = vi.fn();
vi.mock("../src/services/send.ts", () => ({ sendMessage }));

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

beforeEach(() => {
  state.conv = {
    id: "conv-1",
    businessId: "biz-1",
    customerId: "cust-1",
    channelId: "chan-1",
    state: "escalated",
    tag: null,
    windowClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  state.channel = { id: "chan-1", type: "instagram" };
  state.openEscalations = [{ id: "esc-1", assignedToUserId: "staff-1", resolvedAt: null }];
  state.inserted = {};
  state.updates = [];
  sendMessage.mockReset();
  Object.values(rt).forEach((fn) => fn.mockClear());
});

const postReply = (token: string, text = "Hello from the shop") =>
  app.inject({
    method: "POST",
    url: "/conversations/conv-1/reply",
    headers: { authorization: `Bearer ${token}` },
    payload: { text },
  });

describe("POST /conversations/:id/reply", () => {
  it("stores the message as queued, sends on the conversation's channel, then marks it sent", async () => {
    const res = await postReply(adminToken);

    expect(res.statusCode).toBe(201);
    expect(state.inserted.messages?.[0]).toMatchObject({ deliveryStatus: "queued", senderType: "owner" });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "instagram", recipient: "meera_ig", conversationId: "conv-1" }),
    );
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "sent" } });
    expect(state.updates).toContainEqual({ table: "conversations", vals: { state: "owner_handling" } });
    expect(res.json().message.deliveryStatus).toBe("sent");
    expect(state.inserted.audit_log?.[0]).toMatchObject({ action: "reply_sent", actorType: "admin" });
    expect(rt.emitMessageNew).toHaveBeenCalledTimes(1);
    expect(rt.emitMessageNew.mock.calls[0]![0]).toMatchObject({ senderType: "owner", deliveryStatus: "sent", conversationId: "conv-1" });
    expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", { conversationId: "conv-1", state: "owner_handling", tag: null });
  });

  it("uses whatsapp when the conversation's channel is whatsapp", async () => {
    state.channel = { id: "chan-1", type: "whatsapp" };
    await postReply(adminToken);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channelType: "whatsapp" }));
  });

  it("marks the message failed and returns the send error (e.g. live mode 501)", async () => {
    const { AppError } = await import("../src/lib/errors.ts");
    sendMessage.mockRejectedValue(new AppError(501, "Live sending is not implemented yet", "LIVE_SEND_NOT_IMPLEMENTED"));

    const res = await postReply(adminToken);

    expect(res.statusCode).toBe(501);
    expect(res.json().code).toBe("LIVE_SEND_NOT_IMPLEMENTED");
    expect(state.inserted.messages?.[0]).toMatchObject({ deliveryStatus: "queued" });
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "failed" } });
    expect(state.updates).not.toContainEqual({ table: "messages", vals: { deliveryStatus: "sent" } });
    const actions = (state.inserted.audit_log ?? []).map((a) => a.action);
    expect(actions).toEqual(["reply_failed"]);
    // The failed message is still pushed so the chat shows it with its failed status.
    expect(rt.emitMessageNew.mock.calls[0]![0]).toMatchObject({ deliveryStatus: "failed" });
    expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", expect.objectContaining({ state: "owner_handling" }));
  });

  it("maps unexpected send errors to 502 SEND_FAILED", async () => {
    sendMessage.mockRejectedValue(new Error("network down"));
    const res = await postReply(adminToken);
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("SEND_FAILED");
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "failed" } });
  });

  it("checks staff authorization before the 24h window (403, not 409)", async () => {
    state.openEscalations = [];
    state.conv.windowClosesAt = new Date(Date.now() - 60 * 1000);

    const res = await postReply(staffToken);

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.inserted.messages).toBeUndefined();
    expect(rt.emitMessageNew).not.toHaveBeenCalled();
  });

  it("returns 409 WINDOW_CLOSED for an authorized user when the window has closed", async () => {
    state.conv.windowClosesAt = new Date(Date.now() - 60 * 1000);
    const res = await postReply(staffToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("WINDOW_CLOSED");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("assigned staff can reply (sender_type staff)", async () => {
    const res = await postReply(staffToken);
    expect(res.statusCode).toBe(201);
    expect(state.inserted.messages?.[0]).toMatchObject({ senderType: "staff", deliveryStatus: "queued" });
    expect(rt.emitMessageNew.mock.calls[0]![0]).toMatchObject({ senderType: "staff", senderId: "staff-1" });
  });
});
