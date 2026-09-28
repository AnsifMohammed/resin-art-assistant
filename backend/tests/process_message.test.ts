import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// ─── Fake DB state ────────────────────────────────────────────────────────────

interface FakeState {
  conv: Record<string, any>;
  /** Called on every read of businesses.settings; lets a test flip the pause switch mid-job. */
  paused: () => boolean;
  messages: any[];
  decidedMessageIds: string[];
  inserted: Record<string, any[]>;
  updates: Array<{ table: string; vals: any }>;
  channel: Record<string, any> | null;
}

const state: FakeState = {
  conv: {},
  paused: () => false,
  messages: [],
  decidedMessageIds: [],
  inserted: {},
  updates: [],
  channel: { id: "chan-1", type: "whatsapp" },
};

const tableName = (t: any): string => t?.[Symbol.for("drizzle:Name")] ?? "";

function thenable<T>(value: () => T, extra: Record<string, any> = {}): any {
  const chain: any = {
    then: (res: any, rej: any) => Promise.resolve().then(value).then(res, rej),
    ...extra,
  };
  for (const m of ["where", "orderBy", "limit"]) chain[m] = () => chain;
  return chain;
}

vi.mock("../src/db/index.ts", () => {
  const fakeDb: any = {
    select: () => ({
      from: (table: any) =>
        thenable(() => {
          switch (tableName(table)) {
            case "businesses":
              return [{ settings: { automation_paused: state.paused() } }];
            case "conversations":
              return [{ ...state.conv }];
            case "customers":
              return [{ id: "cust-1", name: "Rahul", handleOrPhone: "demo_rahul" }];
            case "channels":
              return state.channel ? [{ ...state.channel }] : [];
            case "messages":
              return state.messages;
            case "ai_decisions":
              return state.decidedMessageIds.map((messageId) => ({ messageId }));
            default:
              return [];
          }
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
        return thenable(record, {
          returning: () => Promise.resolve(record()),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(record()) }),
        });
      },
    }),
    update: (table: any) => ({
      set: (vals: any) => {
        const name = tableName(table);
        const apply = () => {
          state.updates.push({ table: name, vals });
          if (name !== "conversations") return [];
          // Mirrors `WHERE state = 'ai_active'` in the conditional update.
          if (state.conv.state !== "ai_active") return [];
          Object.assign(state.conv, vals);
          return [{ id: state.conv.id, tag: state.conv.tag ?? null }];
        };
        const chain = thenable(apply, { returning: () => Promise.resolve(apply()) });
        return { where: () => chain };
      },
    }),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(fakeDb),
  };
  return { db: fakeDb, schema: {}, sql: { end: vi.fn() } };
});

const processAiDecision = vi.fn();
vi.mock("../src/ai/pipeline.ts", () => ({ processAiDecision }));

const notifyEscalation = vi.fn();
vi.mock("../src/services/notify.ts", () => ({ notifyEscalation }));

const sendMessage = vi.fn();
vi.mock("../src/services/send.ts", () => ({ sendMessage }));

const rt = vi.hoisted(() => ({
  emitConversationUpdated: vi.fn(),
  emitEscalationNew: vi.fn(),
  emitMessageNew: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

const { processMessageJob, selectBatch, normalizeReason } = await import("../src/queue/jobs/processMessage.ts");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const autoReply = {
  intent: "price",
  reply: "The Ocean Coaster Set of 4 is ₹1,200.",
  facts_used: ["price"],
  missing_facts: [],
  escalate: false,
  escalate_reason: null,
  suggested_tag: "new_lead",
  language_detected: "english",
};

const refundEscalation = {
  ...autoReply,
  intent: "refund",
  reply: "Connecting you with the owner.",
  escalate: true,
  escalate_reason: "intent_refund",
  suggested_tag: null,
};

let seq = 0;
const msg = (over: Record<string, any>) => ({
  id: `m${++seq}`,
  direction: "inbound",
  senderType: "customer",
  content: "hello",
  createdAt: new Date(Date.now() + seq),
  ...over,
});

const params = { conversationId: "conv-1", businessId: "biz-1" };

beforeEach(() => {
  seq = 0;
  state.conv = { id: "conv-1", businessId: "biz-1", customerId: "cust-1", channelId: "chan-1", state: "ai_active", tag: null, windowClosesAt: null };
  state.paused = () => false;
  state.messages = [msg({ content: "How much is the ocean coaster set?" })];
  state.decidedMessageIds = [];
  state.inserted = {};
  state.updates = [];
  state.channel = { id: "chan-1", type: "whatsapp" };
  processAiDecision.mockReset();
  notifyEscalation.mockReset();
  sendMessage.mockReset();
  Object.values(rt).forEach((fn) => fn.mockClear());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("processMessageJob: pause switch", () => {
  it("stops before calling the AI when automation is paused", async () => {
    state.paused = () => true;

    const result = await processMessageJob(params);

    expect(result).toBeNull();
    expect(processAiDecision).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.inserted.messages).toBeUndefined();
    expect(state.conv.state).toBe("ai_active");
  });

  it("does not send if automation is paused while the LLM is running", async () => {
    let paused = false;
    state.paused = () => paused;
    processAiDecision.mockImplementation(async () => {
      paused = true;
      return autoReply;
    });

    const result = await processMessageJob(params);

    expect(processAiDecision).toHaveBeenCalledOnce();
    expect(result).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.inserted.messages).toBeUndefined();
  });

  it("does not escalate if automation is paused while the LLM is running", async () => {
    let paused = false;
    state.paused = () => paused;
    processAiDecision.mockImplementation(async () => {
      paused = true;
      return refundEscalation;
    });

    await processMessageJob(params);

    expect(state.inserted.escalations).toBeUndefined();
    expect(notifyEscalation).not.toHaveBeenCalled();
    expect(state.conv.state).toBe("ai_active");
  });
});

describe("processMessageJob: state race", () => {
  it("skips entirely when the conversation is not ai_active", async () => {
    state.conv.state = "owner_handling";
    expect(await processMessageJob(params)).toBeNull();
    expect(processAiDecision).not.toHaveBeenCalled();
  });

  it("aborts the auto-reply if an owner took over during the LLM call", async () => {
    processAiDecision.mockImplementation(async () => {
      state.conv.state = "owner_handling";
      return autoReply;
    });

    const result = await processMessageJob(params);

    expect(result).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.inserted.messages).toBeUndefined();
    expect(state.inserted.ai_decisions).toBeUndefined();
    expect(state.conv.state).toBe("owner_handling");
  });

  it("aborts the escalation if the conversation was paused during the LLM call", async () => {
    processAiDecision.mockImplementation(async () => {
      state.conv.state = "paused";
      return refundEscalation;
    });

    await processMessageJob(params);

    expect(state.inserted.escalations).toBeUndefined();
    expect(notifyEscalation).not.toHaveBeenCalled();
    expect(state.conv.state).toBe("paused");
  });
});

describe("processMessageJob: outcomes", () => {
  it("auto-replies once, links the decision to the latest inbound message and marks it sent", async () => {
    processAiDecision.mockResolvedValue(autoReply);

    const result = await processMessageJob(params);

    expect(result?.escalate).toBe(false);
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(state.inserted.messages).toHaveLength(1);
    // Inserted as not-sent, flipped to sent only after sendMessage succeeds.
    expect(state.inserted.ai_decisions?.[0]).toMatchObject({ messageId: "m1", sent: false, escalate: false });
    expect(state.updates).toContainEqual({ table: "ai_decisions", vals: { sent: true } });
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "sent" } });
    expect(state.inserted.audit_log?.[0]).toMatchObject({ action: "auto_reply_sent", actorType: "ai" });
    expect(state.conv.tag).toBe("new_lead");
    // Realtime: the AI reply (as sent) and the tag change.
    expect(rt.emitMessageNew).toHaveBeenCalledTimes(1);
    expect(rt.emitMessageNew.mock.calls[0]![0]).toMatchObject({ senderType: "ai", deliveryStatus: "sent", content: autoReply.reply });
    expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", { conversationId: "conv-1", state: "ai_active", tag: "new_lead" });
    expect(rt.emitEscalationNew).not.toHaveBeenCalled();
  });

  it("sends on the conversation's own channel type (not hardcoded whatsapp)", async () => {
    state.channel = { id: "chan-1", type: "instagram" };
    processAiDecision.mockResolvedValue(autoReply);

    await processMessageJob(params);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "instagram", recipient: "demo_rahul", conversationId: "conv-1" }),
    );
  });

  it("does not send (and escalates) when the conversation's channel is missing", async () => {
    state.channel = null;
    processAiDecision.mockResolvedValue(autoReply);

    await processMessageJob(params);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.conv.state).toBe("escalated");
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "failed" } });
  });

  it("records an ai_decisions row (sent=false) for escalations too", async () => {
    processAiDecision.mockResolvedValue(refundEscalation);

    await processMessageJob(params);

    expect(state.conv.state).toBe("escalated");
    expect(state.inserted.escalations?.[0]).toMatchObject({ reason: "intent_refund", assignedToUserId: null });
    expect(state.inserted.ai_decisions?.[0]).toMatchObject({
      messageId: "m1",
      escalate: true,
      escalateReason: "intent_refund",
      sent: false,
    });
    expect(state.inserted.audit_log?.[0]).toMatchObject({ action: "escalation_created", actorType: "ai" });
    expect(notifyEscalation).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    // Realtime: escalation:new + conversation:updated, no message.
    expect(rt.emitEscalationNew).toHaveBeenCalledWith("biz-1", {
      escalationId: expect.any(String),
      conversationId: "conv-1",
      reason: "intent_refund",
      customerName: expect.any(String),
    });
    expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", { conversationId: "conv-1", state: "escalated", tag: null });
    expect(rt.emitMessageNew).not.toHaveBeenCalled();
  });

  it("combines all unprocessed customer messages into one AI call", async () => {
    state.messages = [
      msg({ content: "old question" }),
      msg({ direction: "outbound", senderType: "ai", content: "old answer" }),
      msg({ content: "Hi" }),
      msg({ content: "I want coasters" }),
      msg({ content: "how much is the ocean set?" }),
    ];
    processAiDecision.mockResolvedValue(autoReply);

    await processMessageJob(params);

    expect(processAiDecision).toHaveBeenCalledOnce();
    const call = processAiDecision.mock.calls[0]![0];
    expect(call.incomingText).toBe("Hi\nI want coasters\nhow much is the ocean set?");
    expect(call.history.map((h: any) => h.content)).toEqual(["old question", "old answer"]);
    expect(state.inserted.ai_decisions?.[0]?.messageId).toBe("m6");
  });

  it("does nothing when every inbound message already has a decision", async () => {
    state.decidedMessageIds = ["m1"];
    expect(await processMessageJob(params)).toBeNull();
    expect(processAiDecision).not.toHaveBeenCalled();
  });

  it("escalates with window_closed when the 24h window has expired", async () => {
    state.conv.windowClosesAt = new Date(Date.now() - 1000);

    await processMessageJob(params);

    expect(processAiDecision).not.toHaveBeenCalled();
    expect(state.inserted.escalations?.[0]?.reason).toBe("window_closed");
    expect(state.inserted.audit_log?.[0]).toMatchObject({ action: "escalation_created" });
    expect(notifyEscalation).toHaveBeenCalledOnce();
    expect(rt.emitEscalationNew).toHaveBeenCalledWith("biz-1", expect.objectContaining({ reason: "window_closed" }));
    expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", expect.objectContaining({ state: "escalated" }));
  });
});

describe("processMessageJob: failures never leave the conversation stuck", () => {
  it("escalates with parse_error when processing throws on the final attempt", async () => {
    processAiDecision.mockImplementation(async () => {
      throw new Error("boom");
    });

    const result = await processMessageJob(params, { finalAttempt: true });

    expect(result).toBeNull();
    expect(state.conv.state).toBe("escalated");
    expect(state.inserted.escalations?.[0]?.reason).toBe("parse_error");
  });

  it("rethrows (so pg-boss retries) when it is not the final attempt", async () => {
    processAiDecision.mockImplementation(async () => {
      throw new Error("boom");
    });

    await expect(processMessageJob(params, { finalAttempt: false })).rejects.toThrow("boom");
    expect(state.conv.state).toBe("ai_active");
    expect(state.inserted.escalations).toBeUndefined();
  });

  it("escalates with parse_error if sending the auto-reply fails", async () => {
    processAiDecision.mockResolvedValue(autoReply);
    sendMessage.mockImplementation(async () => {
      throw new Error("meta down");
    });

    await processMessageJob(params);

    expect(state.conv.state).toBe("escalated");
    expect(state.inserted.escalations?.[0]?.reason).toBe("parse_error");
    expect(state.updates).toContainEqual({ table: "messages", vals: { deliveryStatus: "failed" } });
    // Never marked as sent.
    expect(state.inserted.ai_decisions?.[0]?.sent).toBe(false);
    expect(state.updates).not.toContainEqual({ table: "ai_decisions", vals: { sent: true } });
    expect(state.updates).not.toContainEqual({ table: "messages", vals: { deliveryStatus: "sent" } });
    const actions = (state.inserted.audit_log ?? []).map((a) => a.action);
    expect(actions).toContain("auto_reply_failed");
    expect(actions).not.toContain("auto_reply_sent");
    // Realtime: the failed AI message is shown, then the parse_error escalation.
    expect(rt.emitMessageNew.mock.calls.map((c) => c[0].deliveryStatus)).toEqual(["failed"]);
    expect(rt.emitEscalationNew).toHaveBeenCalledWith("biz-1", expect.objectContaining({ reason: "parse_error" }));
  });

  it("emits nothing when the conversation is not ai_active", async () => {
    state.conv.state = "owner_handling";
    await processMessageJob(params);
    expect(rt.emitMessageNew).not.toHaveBeenCalled();
    expect(rt.emitConversationUpdated).not.toHaveBeenCalled();
    expect(rt.emitEscalationNew).not.toHaveBeenCalled();
  });
});

describe("selectBatch / normalizeReason", () => {
  it("treats owner replies and decided messages as boundaries", () => {
    const all = [
      msg({ id: "a", content: "q1" }),
      msg({ id: "b", content: "q2" }),
      msg({ id: "c", direction: "outbound", senderType: "owner", content: "reply" }),
      msg({ id: "d", content: "q3" }),
      msg({ id: "e", content: "q4" }),
    ] as any[];

    expect(selectBatch(all, new Set()).batch.map((m) => m.id)).toEqual(["d", "e"]);
    expect(selectBatch(all, new Set(["d"])).batch.map((m) => m.id)).toEqual(["e"]);
  });

  it("stores enum reasons as-is (incl. window_closed, intent_payment, intent_off_topic)", () => {
    expect(normalizeReason("window_closed")).toBe("window_closed");
    expect(normalizeReason("intent_payment")).toBe("intent_payment");
    expect(normalizeReason("intent_off_topic")).toBe("intent_off_topic");
    expect(normalizeReason("parse_error")).toBe("parse_error");
    expect(normalizeReason("something_else")).toBe("intent_unknown");
    expect(normalizeReason(null)).toBe("intent_unknown");
  });
});
