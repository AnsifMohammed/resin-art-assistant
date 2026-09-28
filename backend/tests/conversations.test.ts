import { beforeAll, describe, expect, it, vi } from "vitest";
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

let staffHasAccess = true;

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
          } else if (name === "users") {
            data = [{ id: "staff-1", name: "Priya", email: "priya@asharesins.com", role: "staff", active: true }];
          }

          const handler: ProxyHandler<any> = {
            get(target, prop) {
              if (prop === "then" || prop === "catch" || prop === "finally") {
                return target[prop].bind(target);
              }
              if (prop === "where") {
                return () => createChainable(data);
              }
              return (..._args: any[]) => new Proxy(Promise.resolve(data), handler);
            },
          };
          return new Proxy(Promise.resolve(data), handler);
        },
      }),
      insert: () => ({
        values: (val: any) => {
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
});
