import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

// JWT subject -> active-user lookup is covered in middleware tests; bypass it here.
vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

// Simple in-memory mock store for test simulation
const store = {
  channels: [] as any[],
  customers: [] as any[],
  conversations: [] as any[],
  messages: [] as any[],
  escalations: [] as any[],
  aiDecisions: [] as any[],
  auditLog: [] as any[],
  knowledgeBase: [
    {
      businessId: "test-biz",
      data: {
        products: [
          { id: "ocean-coaster-set-4", name: "Ocean Coaster Set of 4", price: 1200 },
        ],
      },
    },
  ],
};

vi.mock("../src/db/index.ts", () => {
  const mockConv = { id: "test-conv", state: "ai_active", customerId: "test-cust" };
  const mockCust = { id: "test-cust", name: "Test Customer", handleOrPhone: "+919876543210" };
  const mockChan = { id: "test-chan", businessId: "test-biz", type: "whatsapp" };
  const mockAdmin = {
    id: "admin-1",
    businessId: "test-biz",
    role: "admin",
    name: "Asha",
    email: "asha@asharesins.com",
    active: true,
  };

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

  return {
    db: {
      select: () => ({
        from: (table: any) => {
          let data: any[] = [];
          const name = table?.[Symbol.for("drizzle:Name")] || "";
          if (name === "conversations") data = [mockConv];
          else if (name === "customers") data = [mockCust];
          else if (name === "channels") data = [mockChan];
          else if (name === "users") data = [mockAdmin];
          else if (name === "messages") data = store.messages;
          else if (name === "push_subscriptions") data = [];
          else data = [mockConv];

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
          const item = { ...val, id: "test-" + Math.random().toString(36).slice(2) };
          const chain = createChainable([item]);
          return Object.assign(chain, {
            returning: () => Promise.resolve([item]),
            onConflictDoNothing: () => Promise.resolve([]),
            onConflictDoUpdate: () => Promise.resolve([item]),
          });
        },
      }),
      update: () => ({
        set: () => ({
          where: () => createChainable([]),
        }),
      }),
      delete: () => ({
        where: () => createChainable([]),
      }),
    },
    schema: {},
    sql: { end: vi.fn() },
  };
});

// Mock getKnowledgeBase
vi.mock("../src/ai/prompt.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ai/prompt.ts")>();
  return {
    ...actual,
    getKnowledgeBase: () =>
      Promise.resolve({
        business_name: "Asha Resin Art",
        products: [
          { id: "ocean-coaster-set-4", name: "Ocean Coaster Set of 4", price: 1200 },
        ],
      }),
  };
});

// Mock the queue: the route must enqueue (batched) processing, not run the AI inline.
const enqueueProcessMessage = vi.fn(async () => ({ mode: "queued", jobId: "job-1" }));
vi.mock("../src/queue/enqueue.ts", () => ({ enqueueProcessMessage }));

const emitMessageNew = vi.hoisted(() => vi.fn());
vi.mock("../src/realtime/events.ts", () => ({ emitMessageNew }));

let buildServer: typeof import("../src/index.ts").buildServer;
let processAiDecision: typeof import("../src/ai/pipeline.ts").processAiDecision;
let app: Awaited<ReturnType<typeof buildServer>>;
let token: string;

beforeAll(async () => {
  const indexMod = await import("../src/index.ts");
  processAiDecision = (await import("../src/ai/pipeline.ts")).processAiDecision;
  buildServer = indexMod.buildServer;
  app = await buildServer();
  await app.ready();

  token = app.jwt.sign({
    sub: "admin-1",
    businessId: "test-biz",
    role: "admin",
    name: "Asha",
  });
});

describe("POST /simulate/message", () => {
  it("stores the message, enqueues batched processing and returns 202 promptly", async () => {
    enqueueProcessMessage.mockClear();
    emitMessageNew.mockClear();

    const res = await app.inject({
      method: "POST",
      url: "/simulate/message",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customerName: "Rahul",
        channel: "whatsapp",
        text: "How much is the ocean coaster set?",
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.conversationId).toBe("test-conv");
    expect(typeof body.messageId).toBe("string");
    expect(body.queued).toBe("queued");
    expect(body.decision).toBeNull();
    expect(enqueueProcessMessage).toHaveBeenCalledWith({ conversationId: "test-conv", businessId: "test-biz" });
    // Realtime: the inbound customer message is pushed immediately.
    expect(emitMessageNew).toHaveBeenCalledTimes(1);
    expect(emitMessageNew.mock.calls[0]![0]).toMatchObject({
      id: body.messageId,
      direction: "inbound",
      senderType: "customer",
      content: "How much is the ocean coaster set?",
    });
  });

  it("forbids staff (403): simulate is admin only", async () => {
    enqueueProcessMessage.mockClear();
    const staffToken = app.jwt.sign({ sub: "staff-1", businessId: "test-biz", role: "staff", name: "Priya" });
    const res = await app.inject({
      method: "POST",
      url: "/simulate/message",
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { customerName: "Rahul", channel: "whatsapp", text: "hi" },
    });
    expect(res.statusCode).toBe(403);
    expect(enqueueProcessMessage).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/simulate/message",
      payload: { customerName: "Rahul", channel: "whatsapp", text: "hi" },
    });
    expect(res.statusCode).toBe(401);
  });
});

// DEMO_MODE + placeholder key ("AIza-test-key-for-gemini-API") -> keyword mock decisions + rules.
describe("Demo decisions (DEMO_MODE, placeholder API key)", () => {
  const decide = (text: string) => processAiDecision({ businessId: "test-biz", incomingText: text });

  it("Scenario 1: auto-replies to Routine Price Question with ₹1,200", async () => {
    const decision = await decide("How much is the ocean coaster set?");
    expect(decision.escalate).toBe(false);
    expect(decision.intent).toBe("price");
    expect(decision.reply).toContain("1,200");
  });

  it("Scenario 3: auto-replies to Delivery Question with 7-10 days, ₹120", async () => {
    const decision = await decide("Do you deliver to Bangalore?");
    expect(decision.escalate).toBe(false);
    expect(decision.intent).toBe("delivery");
    expect(decision.reply).toContain("120");
  });

  it("Scenario 5: escalates Refund requests with intent_refund", async () => {
    const decision = await decide("I want a refund");
    expect(decision.escalate).toBe(true);
    expect(decision.escalate_reason).toBe("intent_refund");
  });

  it("Scenario 6: escalates payment phrase 'I paid already' with always_escalate_phrase", async () => {
    const decision = await decide("I paid already, where is my order?");
    expect(decision.escalate).toBe(true);
    expect(decision.escalate_reason).toBe("always_escalate_phrase");
  });

  it("Scenario 7: a combined batch about coasters gets the coaster price", async () => {
    const decision = await decide("Hi\nI want coasters\nhow much is the ocean set?");
    expect(decision.escalate).toBe(false);
    expect(decision.reply).toContain("1,200");
  });
});
