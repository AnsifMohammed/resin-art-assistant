import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyTestEnv } from "./env.ts";

const dialect = new PgDialect();

const SECRET = "test_app_secret";
const IG_ACCOUNT = "17841400000000000";

applyTestEnv({
  META_VERIFY_TOKEN: "test_verify_token",
  META_APP_SECRET: SECRET,
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  INSTAGRAM_ACCOUNT_ID: IG_ACCOUNT,
});

// ─── Mock DB ─────────────────────────────────────────────────────────────────
// select().from(t).where() returns the configured rows for table t (unfiltered);
// insert/update calls are recorded so tests can assert on them.
const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, any[]>,
    inserts: [] as { table: string; val: any }[],
    updates: [] as { table: string; vals: any; where?: any }[],
    duplicateIds: new Set<string>(),
    failIds: new Set<string>(),
  };
  const enqueue = vi.fn(async () => ({ mode: "inline", jobId: null }));
  const emitMessageNew = vi.fn();
  const emitConversationUpdated = vi.fn();
  const emitCustomerUpdated = vi.fn();
  const emitBroadcastUpdated = vi.fn();
  return { state, enqueue, emitMessageNew, emitConversationUpdated, emitCustomerUpdated, emitBroadcastUpdated };
});

vi.mock("../src/realtime/events.ts", () => ({
  emitMessageNew: h.emitMessageNew,
  emitConversationUpdated: h.emitConversationUpdated,
  emitCustomerUpdated: h.emitCustomerUpdated,
  emitBroadcastUpdated: h.emitBroadcastUpdated,
}));

const tableName = (table: any): string => table?.[Symbol.for("drizzle:Name")] || "";

vi.mock("../src/db/index.ts", () => {
  const { state } = h;
  const doInsert = (table: string, val: any) => {
    if (table === "messages" && state.failIds.has(val.metaMessageId)) {
      return Promise.reject(new Error("boom"));
    }
    if (table === "messages" && val.metaMessageId && state.duplicateIds.has(val.metaMessageId)) {
      return Promise.resolve([]);
    }
    state.inserts.push({ table, val });
    return Promise.resolve([{ id: `${table}-new`, ...val }]);
  };
  return {
    db: {
      select: () => ({
        from: (table: any) => ({
          where: () => Promise.resolve([...(state.rows[tableName(table)] ?? [])]),
        }),
      }),
      insert: (table: any) => ({
        values: (val: any) => {
          const name = tableName(table);
          return {
            onConflictDoNothing: () => ({ returning: () => doInsert(name, val) }),
            returning: () => doInsert(name, val),
            then: (resolve: any, reject: any) => doInsert(name, val).then(() => resolve(), reject),
          };
        },
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (where: any) => {
            h.state.updates.push({ table: tableName(table), vals, where });
            const done = Promise.resolve(undefined);
            return Object.assign(done, {
              // Receipts: pretend one broadcast recipient matched.
              returning: () =>
                Promise.resolve(
                  tableName(table) === "broadcast_recipients" ? [{ broadcastId: "b-1", businessId: "test-business" }] : [],
                ),
            });
          },
        }),
      }),
    },
    schema: {},
    sql: { end: vi.fn() },
  };
});

vi.mock("../src/queue/enqueue.ts", () => ({
  enqueueProcessMessage: h.enqueue,
  clearInlineTimers: vi.fn(),
}));

vi.mock("../src/queue/jobs/processMessage.ts", () => ({
  processMessageJob: vi.fn(),
}));

let validateSignature: typeof import("../src/services/meta/webhook.ts").validateSignature;
let isWebhookRequestAuthorized: typeof import("../src/services/meta/webhook.ts").isWebhookRequestAuthorized;
let app: Awaited<ReturnType<typeof import("../src/index.ts").buildServer>>;

beforeAll(async () => {
  const indexMod = await import("../src/index.ts");
  const metaMod = await import("../src/services/meta/webhook.ts");
  validateSignature = metaMod.validateSignature;
  isWebhookRequestAuthorized = metaMod.isWebhookRequestAuthorized;
  app = await indexMod.buildServer();
  await app.ready();
});

beforeEach(() => {
  h.state.rows = {
    channels: [{ id: "chan-wa", type: "whatsapp" }],
    customers: [{ id: "cust-wa", handleOrPhone: "919876543210" }],
    conversations: [{ id: "conv-1", customerId: "cust-wa", state: "ai_active" }],
    messages: [],
  };
  h.state.inserts = [];
  h.state.updates = [];
  h.state.duplicateIds = new Set();
  h.state.failIds = new Set();
  h.enqueue.mockClear();
  h.emitMessageNew.mockClear();
  h.emitConversationUpdated.mockClear();
  h.emitCustomerUpdated.mockClear();
  h.emitBroadcastUpdated.mockClear();
});

const sign = (raw: string | Buffer, secret = SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

function post(raw: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) headers["x-hub-signature-256"] = signature;
  return app.inject({ method: "POST", url: "/webhook", headers, payload: raw });
}

const insertsInto = (table: string) => h.state.inserts.filter((i) => i.table === table).map((i) => i.val);

function waPayload(messages: any[], extra: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+91 90000 00000", phone_number_id: "1234567890" },
              contacts: [{ wa_id: "919876543210", profile: { name: "Aditi" } }],
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

const waText = (id: string, text: string, from = "919876543210") => ({
  id,
  from,
  timestamp: "1790589000",
  type: "text",
  text: { body: text },
});

describe("Meta Webhooks", () => {
  describe("GET /webhook (verification handshake)", () => {
    it("returns challenge string when verify token matches", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=challenge_12345",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("challenge_12345");
    });

    it("returns 403 when verify token does not match", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_12345",
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for a hardcoded legacy fallback token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/webhook?hub.mode=subscribe&hub.verify_token=resin_art_verify_token&hub.challenge=x",
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Signature helpers", () => {
    it("validates authentic payload signature correctly", () => {
      const payload = JSON.stringify({ test: "data" });
      expect(validateSignature(payload, sign(payload), SECRET)).toBe(true);
      expect(validateSignature(Buffer.from(payload), sign(payload), SECRET)).toBe(true);
    });

    it("rejects tampered payload or signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const tampered = JSON.stringify({ test: "tampered" });
      expect(validateSignature(tampered, sign(payload), SECRET)).toBe(false);
    });

    it("returns false (no throw) for different-length, missing or malformed signatures", () => {
      const payload = "{}";
      expect(() => validateSignature(payload, "sha256=abc", SECRET)).not.toThrow();
      expect(validateSignature(payload, "sha256=abc", SECRET)).toBe(false);
      expect(validateSignature(payload, sign(payload) + "00", SECRET)).toBe(false);
      expect(validateSignature(payload, undefined, SECRET)).toBe(false);
      expect(validateSignature(payload, sign(payload).replace("sha256=", "sha1="), SECRET)).toBe(false);
    });

    it("isWebhookRequestAuthorized: only demo mode may skip validation, and only without a secret", () => {
      const rawBody = Buffer.from("{}");
      expect(isWebhookRequestAuthorized({ rawBody, signature: undefined, secret: undefined, demoMode: true })).toBe(true);
      expect(isWebhookRequestAuthorized({ rawBody, signature: undefined, secret: undefined, demoMode: false })).toBe(false);
      expect(isWebhookRequestAuthorized({ rawBody, signature: undefined, secret: SECRET, demoMode: true })).toBe(false);
      expect(isWebhookRequestAuthorized({ rawBody, signature: sign(rawBody), secret: SECRET, demoMode: false })).toBe(true);
    });
  });

  describe("POST /webhook signature enforcement", () => {
    it("accepts a raw Malayalam + emoji payload signed over its exact bytes", async () => {
      const text = "എത്ര രൂപ 😊";
      // Unescaped UTF-8, odd whitespace: must be signed/verified as raw bytes.
      const raw = `{ "object":"whatsapp_business_account",  "entry":[{"changes":[{"value":{"metadata":{"display_phone_number":"+91 90000 00000","phone_number_id":"1234567890"},"contacts":[{"wa_id":"919876543210","profile":{"name":"Aditi"}}],"messages":[{"id":"wamid.ml1","from":"919876543210","type":"text","text":{"body":"${text}"}}]}}]}] }`;
      const res = await post(raw, sign(Buffer.from(raw, "utf8")));

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
      const msgs = insertsInto("messages");
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        content: text,
        direction: "inbound",
        senderType: "customer",
        metaMessageId: "wamid.ml1",
        conversationId: "conv-1",
      });
      expect(h.enqueue).toHaveBeenCalledTimes(1);
      expect(h.enqueue).toHaveBeenCalledWith({ conversationId: "conv-1", businessId: "test-business" });
      // Existing conversation: window bumped.
      const convUpdate = h.state.updates.find((u) => u.table === "conversations");
      expect(convUpdate?.vals.windowClosesAt).toBeInstanceOf(Date);
      expect(convUpdate?.vals.lastMessageAt).toBe(convUpdate?.vals.lastCustomerMessageAt);
    });

    it("rejects a wrong signature with 403", async () => {
      const raw = JSON.stringify(waPayload([waText("wamid.bad", "hi")]));
      const res = await post(raw, sign(raw, "not_the_secret"));
      expect(res.statusCode).toBe(403);
      expect(insertsInto("messages")).toHaveLength(0);
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it("rejects a signature computed over re-serialized JSON instead of raw bytes", async () => {
      const raw = JSON.stringify(waPayload([waText("wamid.ws", "hi")]), null, 2);
      const reserialized = JSON.stringify(JSON.parse(raw));
      expect(reserialized).not.toBe(raw);
      const res = await post(raw, sign(reserialized));
      expect(res.statusCode).toBe(403);
      expect(insertsInto("messages")).toHaveLength(0);
    });

    it("rejects a missing signature header with 403 when META_APP_SECRET is set", async () => {
      const raw = JSON.stringify(waPayload([waText("wamid.nosig", "hi")]));
      const res = await post(raw);
      expect(res.statusCode).toBe(403);
      expect(insertsInto("messages")).toHaveLength(0);
    });

    it("rejects a different-length signature with 403 (does not throw)", async () => {
      const raw = JSON.stringify(waPayload([waText("wamid.len", "hi")]));
      const res = await post(raw, "sha256=deadbeef");
      expect(res.statusCode).toBe(403);
    });

    it("returns 400 for malformed JSON", async () => {
      const raw = "{not json";
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /webhook WhatsApp processing", () => {
    it("ignores a duplicate meta_message_id (no enqueue, no window bump)", async () => {
      h.state.duplicateIds.add("wamid.dup");
      const raw = JSON.stringify(waPayload([waText("wamid.dup", "hello again")]));
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);
      expect(insertsInto("messages")).toHaveLength(0);
      expect(h.enqueue).not.toHaveBeenCalled();
      expect(h.state.updates.filter((u) => u.table === "conversations")).toHaveLength(0);
      expect(h.emitMessageNew).not.toHaveBeenCalled();
    });

    it("one failing message does not drop the rest of the batch", async () => {
      h.state.failIds.add("wamid.fail");
      const raw = JSON.stringify(waPayload([waText("wamid.fail", "one"), waText("wamid.ok", "two")]));
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);
      const msgs = insertsInto("messages");
      expect(msgs).toHaveLength(1);
      expect(msgs[0].metaMessageId).toBe("wamid.ok");
      expect(h.enqueue).toHaveBeenCalledTimes(1);
    });

    it("creates the customer keyed by sender for a new WhatsApp number", async () => {
      h.state.rows.customers = [];
      h.state.rows.conversations = [];
      const raw = JSON.stringify(waPayload([waText("wamid.new", "hi", "919876543210")]));
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);
      expect(insertsInto("customers")[0]).toMatchObject({
        channelId: "chan-wa",
        handleOrPhone: "919876543210",
        name: "Aditi",
      });
      expect(insertsInto("conversations")[0]).toMatchObject({ state: "ai_active", customerId: "customers-new" });
      expect(h.enqueue).toHaveBeenCalledTimes(1);
      // Realtime: the stored customer message is pushed; no state change to announce.
      expect(h.emitMessageNew).toHaveBeenCalledTimes(1);
      expect(h.emitMessageNew.mock.calls[0]![0]).toMatchObject({ senderType: "customer", content: "hi", metaMessageId: "wamid.new" });
      expect(h.emitConversationUpdated).not.toHaveBeenCalled();
    });

    it("business echo attaches to recipient conversation, sets owner_handling, audits, no enqueue, no window bump", async () => {
      const echo = { id: "wamid.echo1", from: "919000000000", to: "919876543210", type: "text", text: { body: "Sure, sending photos" } };
      const raw = JSON.stringify(waPayload([echo]));
      const res = await post(raw, sign(raw));

      expect(res.statusCode).toBe(200);
      expect(insertsInto("customers")).toHaveLength(0);
      expect(insertsInto("conversations")).toHaveLength(0);

      const msgs = insertsInto("messages");
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        conversationId: "conv-1",
        direction: "inbound",
        senderType: "owner",
        metaMessageId: "wamid.echo1",
      });

      const convUpdates = h.state.updates.filter((u) => u.table === "conversations");
      expect(convUpdates).toHaveLength(1);
      // Same update bumps the inbox sort key; the customer window is untouched.
      expect(convUpdates[0]!.vals).toEqual({ state: "owner_handling", lastMessageAt: expect.any(Date) });

      const audits = insertsInto("audit_log");
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "state_changed",
        actorType: "system",
        conversationId: "conv-1",
        details: { from: "ai_active", to: "owner_handling", reason: "echo" },
      });
      expect(h.enqueue).not.toHaveBeenCalled();

      // Realtime: echo message + state change.
      expect(h.emitMessageNew).toHaveBeenCalledTimes(1);
      expect(h.emitMessageNew.mock.calls[0]![0]).toMatchObject({ senderType: "owner", conversationId: "conv-1" });
      expect(h.emitConversationUpdated).toHaveBeenCalledWith("test-business", {
        conversationId: "conv-1",
        state: "owner_handling",
        tag: null,
      });
    });

    it("smb message_echoes are treated as echoes", async () => {
      const echo = { id: "wamid.echo2", from: "919000000000", to: "919876543210", type: "text", text: { body: "ok" } };
      const raw = JSON.stringify(waPayload([], { message_echoes: [echo] }));
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);
      expect(insertsInto("messages")[0]).toMatchObject({ senderType: "owner", conversationId: "conv-1" });
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it("echo for an unknown recipient is skipped and never creates a customer", async () => {
      h.state.rows.customers = [];
      h.state.rows.conversations = [];
      const echo = { id: "wamid.echo3", from: "919000000000", to: "910000000001", type: "text", text: { body: "hi" } };
      const raw = JSON.stringify(waPayload([echo]));
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);
      expect(h.state.inserts).toHaveLength(0);
      expect(h.state.updates).toHaveLength(0);
      expect(h.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("POST /webhook Instagram processing", () => {
    const igPayload = (event: any) => ({ object: "instagram", entry: [{ id: IG_ACCOUNT, time: 1, messaging: [event] }] });

    it("stores a customer message on a new instagram channel and enqueues AI", async () => {
      h.state.rows.channels = [];
      h.state.rows.customers = [];
      h.state.rows.conversations = [];
      const raw = JSON.stringify(
        igPayload({
          sender: { id: "igsid-555" },
          recipient: { id: IG_ACCOUNT },
          timestamp: 1,
          message: { mid: "ig.mid.1", text: "How much is the clock?" },
        }),
      );
      const res = await post(raw, sign(raw));

      expect(res.statusCode).toBe(200);
      expect(insertsInto("channels")[0]).toMatchObject({ type: "instagram", identifier: IG_ACCOUNT });
      expect(insertsInto("customers")[0]).toMatchObject({ channelId: "channels-new", handleOrPhone: "igsid-555" });
      expect(insertsInto("messages")[0]).toMatchObject({
        content: "How much is the clock?",
        senderType: "customer",
        direction: "inbound",
        metaMessageId: "ig.mid.1",
      });
      expect(h.enqueue).toHaveBeenCalledTimes(1);
    });

    it("handles is_echo by attaching to the recipient's conversation", async () => {
      h.state.rows.channels = [{ id: "chan-ig", type: "instagram" }];
      h.state.rows.customers = [{ id: "cust-ig", handleOrPhone: "igsid-555" }];
      h.state.rows.conversations = [{ id: "conv-ig", customerId: "cust-ig", state: "escalated" }];
      const raw = JSON.stringify(
        igPayload({
          sender: { id: IG_ACCOUNT },
          recipient: { id: "igsid-555" },
          timestamp: 1,
          message: { mid: "ig.mid.echo", text: "Replying from the app", is_echo: true },
        }),
      );
      const res = await post(raw, sign(raw));

      expect(res.statusCode).toBe(200);
      expect(insertsInto("customers")).toHaveLength(0);
      expect(insertsInto("messages")[0]).toMatchObject({
        conversationId: "conv-ig",
        senderType: "owner",
        direction: "inbound",
      });
      expect(h.state.updates.filter((u) => u.table === "conversations")[0]?.vals).toEqual({
        state: "owner_handling",
        lastMessageAt: expect.any(Date),
      });
      expect(insertsInto("audit_log")[0]).toMatchObject({
        details: { from: "escalated", to: "owner_handling", reason: "echo" },
      });
      expect(h.enqueue).not.toHaveBeenCalled();
    });
  });
  describe("POST /webhook opt-out keywords", () => {
    const send = async (id: string, text: string) => {
      const raw = JSON.stringify(waPayload([waText(id, text)]));
      return post(raw, sign(raw));
    };

    it("STOP opts the customer out, acknowledges and never reaches the AI", async () => {
      const res = await send("wamid.stop", "  STOP! ");
      expect(res.statusCode).toBe(200);

      const custUpdate = h.state.updates.find((u) => u.table === "customers");
      expect(custUpdate?.vals).toEqual({ optedOut: true, optedOutAt: expect.any(Date), optOutSource: "keyword" });

      expect(insertsInto("audit_log")).toEqual([
        expect.objectContaining({
          action: "customer_opted_out",
          actorType: "system",
          conversationId: "conv-1",
          details: { customerId: "cust-wa", source: "keyword", messageId: "messages-new" },
        }),
      ]);

      // Inbound STOP + outbound system acknowledgement.
      const msgs = insertsInto("messages");
      expect(msgs).toHaveLength(2);
      expect(msgs[1]).toMatchObject({
        conversationId: "conv-1",
        direction: "outbound",
        senderType: "system",
        content: "You won't receive offers from us anymore. Reply START to subscribe again.",
        metadata: { kind: "opt_out_ack" },
      });
      expect(h.state.updates.find((u) => u.table === "messages")?.vals).toEqual({ deliveryStatus: "sent" });
      expect(h.enqueue).not.toHaveBeenCalled();
      expect(h.emitCustomerUpdated).toHaveBeenCalledWith("test-business", { customerId: "cust-wa" });
      expect(h.emitMessageNew).toHaveBeenCalledTimes(2);
    });

    it("Tamil நிறுத்து also opts out", async () => {
      await send("wamid.ta", "நிறுத்து");
      expect(h.state.updates.find((u) => u.table === "customers")?.vals).toMatchObject({ optedOut: true });
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it("START re-subscribes an opted-out customer", async () => {
      h.state.rows.customers = [{ id: "cust-wa", handleOrPhone: "919876543210", optedOut: true }];
      await send("wamid.start", "Start");
      expect(h.state.updates.find((u) => u.table === "customers")?.vals).toEqual({
        optedOut: false,
        optedOutAt: null,
        optOutSource: null,
      });
      expect(insertsInto("audit_log")[0]).toMatchObject({ action: "customer_opted_in" });
      expect(insertsInto("messages")[1]).toMatchObject({ senderType: "system", content: "You're subscribed again 😊" });
      expect(h.enqueue).not.toHaveBeenCalled();
    });

    it("START from a subscribed customer is a normal message for the AI", async () => {
      await send("wamid.start2", "start");
      expect(h.state.updates.some((u) => u.table === "customers")).toBe(false);
      expect(insertsInto("messages")).toHaveLength(1);
      expect(h.enqueue).toHaveBeenCalledTimes(1);
    });

    it("a sentence containing stop is a normal message", async () => {
      await send("wamid.s3", "please stop the order, I want to change the colour");
      expect(h.state.updates.some((u) => u.table === "customers")).toBe(false);
      expect(h.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /webhook WhatsApp statuses", () => {
    it("applies forward-only receipts to broadcast recipients and messages", async () => {
      const raw = JSON.stringify(
        waPayload([], {
          statuses: [
            { id: "wamid.out1", status: "delivered", timestamp: "1790589000", recipient_id: "919876543210" },
            { id: "wamid.out2", status: "failed", timestamp: "1790589001", errors: [{ code: 131026, title: "Message undeliverable" }] },
            { id: "wamid.out3", status: "deleted" },
          ],
        }),
      );
      const res = await post(raw, sign(raw));
      expect(res.statusCode).toBe(200);

      const recipientUpdates = h.state.updates.filter((u) => u.table === "broadcast_recipients");
      expect(recipientUpdates.map((u) => u.vals)).toEqual([
        { status: "delivered", deliveredAt: new Date(1790589000 * 1000) },
        { status: "failed", error: "131026: Message undeliverable" },
      ]);
      const delivered = dialect.sqlToQuery(recipientUpdates[0]!.where);
      expect(delivered.sql).toContain('"broadcast_recipients"."meta_message_id" = $1');
      expect(delivered.sql).toContain('"broadcast_recipients"."status" in ($2, $3)');
      expect(delivered.params).toEqual(["wamid.out1", "pending", "sent"]);

      const messageUpdates = h.state.updates.filter((u) => u.table === "messages");
      expect(messageUpdates.map((u) => u.vals)).toEqual([{ deliveryStatus: "delivered" }, { deliveryStatus: "failed" }]);
      expect(dialect.sqlToQuery(messageUpdates[1]!.where).params).toEqual(["wamid.out2", "queued", "sent"]);

      // Statuses never create messages or run the AI.
      expect(insertsInto("messages")).toHaveLength(0);
      expect(h.enqueue).not.toHaveBeenCalled();
    });
  });
});
