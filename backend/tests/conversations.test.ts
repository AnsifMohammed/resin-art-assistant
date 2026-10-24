import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
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

// JWT subject -> active-user lookup is covered in middleware tests; bypass it here.
vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

const mockConv = {
  id: "conv-1",
  businessId: "biz-1",
  customerId: "cust-1",
  channelId: "chan-1",
  state: "escalated",
  tag: "custom_order",
  lastCustomerMessageAt: new Date(),
  lastMessageAt: new Date(),
  adminLastReadAt: null as Date | null,
  createdAt: new Date(),
};

const mockCust = {
  id: "cust-1",
  name: "Meera",
  handleOrPhone: "+919876543210",
};

const mockEscalation = {
  id: "esc-1",
  businessId: "biz-1",
  conversationId: "conv-1",
  reason: "intent_refund",
  assignedToUserId: "staff-1",
  resolvedAt: null,
};

const mockOrder = {
  id: "ord-1",
  businessId: "biz-1",
  customerId: "cust-1",
  orderNo: "ORD-001",
  status: "confirmed",
  totalAmount: "1500.00",
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  expectedDeliveryDate: null,
  isDeleted: false,
};

const mockOrderItem = {
  id: "item-1",
  orderId: "ord-1",
  productName: "Ocean Coaster Set",
  quantity: 2,
  isDeleted: false,
};

let staffHasAccess = true;

// Captured for assertions: WHERE conditions passed to select chains, and inserted rows.
const captured = { wheres: [] as any[], inserts: [] as Array<{ table: string; val: any }> };
const dialect = new PgDialect();
const renderedWheres = () => captured.wheres.filter(Boolean).map((w) => dialect.sqlToQuery(w));

const mockDecisions = [
  { messageId: "msg-1", intent: "custom_order", escalate: true, escalateReason: "missing_facts", factsUsed: [],
    missingFacts: ["price"], languageDetected: "english", suggestedTag: null, sent: false, createdAt: new Date(0) },
  { messageId: "msg-1", intent: "price", escalate: false, escalateReason: null, factsUsed: ["price"],
    missingFacts: [], languageDetected: "english", suggestedTag: "new_lead", sent: true, createdAt: new Date(1000) },
  { messageId: "msg-other", intent: "care", escalate: false, escalateReason: null, factsUsed: [],
    missingFacts: [], languageDetected: "english", suggestedTag: null, sent: true, createdAt: new Date(2000) },
];

vi.mock("../src/db/index.ts", () => {
  const createChainable = (data: any[] = []) => {
    const handler: ProxyHandler<any> = {
      get(target, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return target[prop].bind(target);
        }
        return (..._args: any[]) => createChainable(data);
      },
    };
    return new Proxy(Promise.resolve(data), handler);
  };

  const db: any = {
      select: (fields?: any) => ({
        from: (table: any) => {
          const name = table?.[Symbol.for("drizzle:Name")] || "";
          let data: any[] = [];
          if (fields && fields.conversation) {
            data = [{
              conversation: mockConv,
              customer: mockCust,
              channel: { id: "chan-1", type: "whatsapp" },
              lastMessage: { content: "Hello", senderType: "customer", createdAt: new Date() },
              openEscalation: { id: "esc-1", reason: "intent_refund", assignedToUserId: "staff-1", createdAt: new Date() },
            }];
          } else if (fields && fields.count) {
            data = [{ count: 1 }];
          } else if (name === "conversations") {
            data = [mockConv];
          } else if (name === "escalations") {
            data = staffHasAccess
              ? [{
                  ...mockEscalation,
                  escalation: mockEscalation,
                  assignedTo: { id: "staff-1", name: "Priya" },
                }]
              : [];
          } else if (name === "customers") {
            data = [mockCust];
          } else if (name === "messages") {
            data = [{
              id: "msg-1",
              conversationId: "conv-1",
              content: "Hello",
              direction: "inbound",
              senderType: "customer",
              createdAt: new Date(),
            }];
          } else if (name === "ai_decisions") {
            data = mockDecisions;
          } else if (name === "users") {
            data = [{ id: "staff-1", name: "Priya", email: "priya@asharesins.com", role: "staff", active: true }];
          } else if (name === "orders") {
            data = [mockOrder];
          } else if (name === "order_items") {
            data = [mockOrderItem];
          }

          const handler: ProxyHandler<any> = {
            get(target, prop) {
              if (prop === "then" || prop === "catch" || prop === "finally") {
                return target[prop].bind(target);
              }
              if (prop === "where") {
                return (cond: unknown) => {
                  captured.wheres.push(cond);
                  return createChainable(data);
                };
              }
              return (..._args: any[]) => new Proxy(Promise.resolve(data), handler);
            },
          };
          return new Proxy(Promise.resolve(data), handler);
        },
      }),
      insert: (table: any) => ({
        values: (val: any) => {
          captured.inserts.push({ table: table?.[Symbol.for("drizzle:Name")] || "", val });
          const item = [{ id: "msg-out-1", ...val }];
          const chain = createChainable(item);
          return Object.assign(chain, {
            returning: () => Promise.resolve(item),
            onConflictDoNothing: () => Promise.resolve([]),
          });
        },
      }),
      update: () => ({
        set: (vals: any) => {
          const item = [{ ...mockConv, ...vals }];
          const chain = createChainable(item);
          return Object.assign(chain, {
            where: () => Object.assign(createChainable(item), {
              returning: () => Promise.resolve([{ ...mockEscalation, ...vals }]),
            }),
          });
        },
      }),
  };
  return { db, schema: {}, sql: { end: vi.fn() } };
});

let buildServer: typeof import("../src/index.ts").buildServer;
let app: Awaited<ReturnType<typeof buildServer>>;
let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  const indexMod = await import("../src/index.ts");
  buildServer = indexMod.buildServer;
  app = await buildServer();
  await app.ready();

  adminToken = app.jwt.sign({
    sub: "admin-1",
    businessId: "biz-1",
    role: "admin",
    name: "Asha",
  });

  staffToken = app.jwt.sign({
    sub: "staff-1",
    businessId: "biz-1",
    role: "staff",
    name: "Priya",
  });
});

beforeEach(() => {
  captured.wheres = [];
  captured.inserts = [];
  staffHasAccess = true;
  Object.values(rt).forEach((fn) => fn.mockClear());
});

describe("Conversation routes", () => {
  describe("GET /conversations", () => {
    it("allows admin to list conversations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const [first] = res.json().conversations;
      expect(first.lastMessage).toMatchObject({ content: "Hello", senderType: "customer" });
      expect(first.openEscalation).toMatchObject({ id: "esc-1", reason: "intent_refund", assignedToUserId: "staff-1" });
      expect(res.json().pagination).toEqual({ page: 1, limit: 20, total: 1 });
    });

    it("returns lastMessageAt and unread for each conversation", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const [first] = res.json().conversations;
      expect(typeof first.lastMessageAt).toBe("string");
      // Never read by the admin + has a customer message → unread.
      expect(first.unread).toBe(true);
    });

    it("accepts search and unread=true and filters with escaped ILIKE + unread condition", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations?search=%20Meera_50%25%20&unread=true",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      // Both the page query and the count query carry the filter.
      const filtered = renderedWheres().filter((q) => q.sql.includes("ilike"));
      expect(filtered).toHaveLength(2);
      for (const q of filtered) {
        expect(q.sql).toContain('"customers"."handle_or_phone" ilike');
        expect(q.sql).toContain('"conversations"."admin_last_read_at" is null');
        expect(q.params).toContain("%Meera\\_50\\%%");
      }
    });

    it("rejects a search longer than 100 characters", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/conversations?search=${"a".repeat(101)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("forbids staff from listing all conversations (403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("FORBIDDEN");
    });
  });

  describe("GET /conversations/:id", () => {
    it("allows admin to view any conversation thread", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().conversation).toBeDefined();
      expect(res.json().conversation.messages).toBeDefined();
    });

    it("attaches the latest AI decision to customer messages for admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const { conversation } = res.json();
      expect(conversation).toHaveProperty("lastMessageAt");
      expect(conversation).toHaveProperty("adminLastReadAt");
      expect(conversation.messages[0].aiDecision).toEqual({
        intent: "price",
        escalate: false,
        escalateReason: null,
        factsUsed: ["price"],
        missingFacts: [],
        languageDetected: "english",
        suggestedTag: "new_lead",
        sent: true,
        createdAt: new Date(1000).toISOString(),
      });
    });

    it("never includes aiDecision for staff", async () => {
      staffHasAccess = true;
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.messages[0]).not.toHaveProperty("aiDecision");
    });

    it("allows staff to view conversation when assigned an escalation", async () => {
      staffHasAccess = true;

      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().conversation).toBeDefined();
    });

    it("rejects staff (403) when conversation is not assigned to them", async () => {
      staffHasAccess = false;

      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Not assigned to you");
    });
  });

  describe("POST /conversations/:id/reply", () => {
    it("allows admin to reply to conversation and sets owner_handling state", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/conversations/conv-1/reply",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { text: "We will dispatch your order tomorrow!" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().conversation.state).toBe("owner_handling");
      expect(res.json().message).toBeDefined();
    });

    it("allows assigned staff to reply", async () => {
      staffHasAccess = true;

      const res = await app.inject({
        method: "POST",
        url: "/conversations/conv-1/reply",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { text: "Hi, I am helping with your request." },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().conversation.state).toBe("owner_handling");
      expect(res.json().message).toBeDefined();
    });
  });

  describe("POST /conversations/:id/resolve", () => {
    it("resolves conversation and returns state to ai_active", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/conversations/conv-1/resolve",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.state).toBe("ai_active");
      expect(res.json().escalation).toBeDefined();
      expect(rt.emitConversationUpdated).toHaveBeenLastCalledWith("biz-1", expect.objectContaining({ conversationId: "conv-1", state: "ai_active" }));
      // Staff subscriptions to this conversation are re-checked (and dropped) after resolve.
      expect(rt.emitConversationAccessChanged).toHaveBeenLastCalledWith("biz-1", "conv-1");
    });
  });

  describe("POST /conversations/:id/read", () => {
    it("admin marks the conversation read (204)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/conversations/conv-1/read",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
    });

    it("staff cannot (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/conversations/conv-1/read",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /conversations/:id/pause and /resume", () => {
    const post = (action: "pause" | "resume", token = adminToken) =>
      app.inject({
        method: "POST",
        url: `/conversations/conv-1/${action}`,
        headers: { authorization: `Bearer ${token}` },
      });

    afterEach(() => {
      mockConv.state = "escalated";
    });

    it("409 ESCALATION_OPEN when pausing an escalated conversation", async () => {
      const res = await post("pause");
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("ESCALATION_OPEN");
      expect(captured.inserts).toHaveLength(0);
      expect(rt.emitConversationUpdated).not.toHaveBeenCalled();
    });

    it.each(["ai_active", "owner_handling"])("pauses a %s conversation, audits and emits", async (from) => {
      mockConv.state = from;
      const res = await post("pause");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ conversation: { id: "conv-1", state: "paused", tag: "custom_order" } });
      expect(captured.inserts).toEqual([
        {
          table: "audit_log",
          val: expect.objectContaining({
            actorId: "admin-1",
            actorType: "admin",
            action: "conversation_paused",
            conversationId: "conv-1",
            details: { from, to: "paused" },
          }),
        },
      ]);
      expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", {
        conversationId: "conv-1",
        state: "paused",
        tag: "custom_order",
      });
    });

    it("pausing an already paused conversation returns it unchanged (no audit)", async () => {
      mockConv.state = "paused";
      const res = await post("pause");
      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.state).toBe("paused");
      expect(captured.inserts).toHaveLength(0);
    });

    it("resumes a paused conversation to ai_active, audits and emits", async () => {
      mockConv.state = "paused";
      const res = await post("resume");

      expect(res.statusCode).toBe(200);
      expect(res.json().conversation.state).toBe("ai_active");
      expect(captured.inserts[0]?.val).toMatchObject({
        action: "conversation_resumed",
        details: { from: "paused", to: "ai_active" },
      });
      expect(rt.emitConversationUpdated).toHaveBeenCalledWith("biz-1", expect.objectContaining({ state: "ai_active" }));
    });

    it("409 NOT_PAUSED when resuming a conversation that is not paused", async () => {
      const res = await post("resume");
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("NOT_PAUSED");
    });

    it("staff cannot pause or resume (403)", async () => {
      expect((await post("pause", staffToken)).statusCode).toBe(403);
      expect((await post("resume", staffToken)).statusCode).toBe(403);
    });
  });

  describe("GET /conversations/:id/orders", () => {
    it("allows admin to view conversation customer orders", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1/orders",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0]).toEqual({
        id: "ord-1",
        orderNo: "ORD-001",
        status: "confirmed",
        totalAmount: 1500,
        createdAt: "2026-10-01T12:00:00.000Z",
        expectedDeliveryDate: null,
        items: [{ productName: "Ocean Coaster Set", quantity: 2 }],
      });
    });

    it("allows staff assigned to the conversation to view orders", async () => {
      staffHasAccess = true;
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1/orders",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().orders).toHaveLength(1);
    });

    it("forbids staff not assigned to the conversation (403)", async () => {
      staffHasAccess = false;
      const res = await app.inject({
        method: "GET",
        url: "/conversations/conv-1/orders",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Not assigned to you");
    });
  });
});
