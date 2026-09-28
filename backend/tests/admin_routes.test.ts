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

const mockStaff = {
  id: "staff-2",
  businessId: "biz-1",
  name: "Anu",
  email: "anu@asharesins.com",
  role: "staff",
  active: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

const mockBiz = {
  id: "biz-1",
  name: "Asha Resin Art",
  settings: { automation_paused: false },
};

const mockKB = {
  id: "kb-1",
  businessId: "biz-1",
  data: { business_name: "Asha Resin Art", products: [] },
};

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

  const isEmailClause = (clause: any): boolean => {
    if (!clause) return false;
    if (clause.left?.name === "email" || clause.column?.name === "email") return true;
    if (clause.queryChunks) {
      for (const chunk of clause.queryChunks) {
        if (chunk?.name === "email") return true;
      }
    }
    return false;
  };

  return {
    db: {
      select: () => ({
        from: (table: any) => {
          const name = table?.[Symbol.for("drizzle:Name")] || "";
          let data: any[] = [];
          if (name === "users") data = [mockStaff];
          else if (name === "businesses") data = [mockBiz];
          else if (name === "knowledge_base") data = [mockKB];
          else if (name === "channels") data = [{ id: "c1", type: "whatsapp", status: "active" }];
          else if (name === "messages") {
            data = [{ total: 10, inbound: 6, outbound: 4, autoReplies: 4 }];
          } else if (name === "escalations") {
            data = [{ totalEscalations: 2, resolvedEscalations: 1, avgResolutionSeconds: 300 }];
          } else if (name === "audit_log") {
            data = [{ id: "a1", action: "reply_sent", actorType: "admin" }];
          }

          const handler: ProxyHandler<any> = {
            get(target, prop) {
              if (prop === "then" || prop === "catch" || prop === "finally") {
                return target[prop].bind(target);
              }
              if (prop === "where") {
                return (clause: any) => {
                  if (name === "users" && isEmailClause(clause)) {
                    return createChainable([]);
                  }
                  return createChainable(data);
                };
              }
              return (..._args: any[]) => new Proxy(Promise.resolve(data), handler);
            },
          };
          return new Proxy(Promise.resolve(data), handler);
        },
      }),
      insert: () => ({
        values: (val: any) => {
          const item = [{ id: "new-id", ...val }];
          const chain = createChainable(item);
          return Object.assign(chain, {
            returning: () => Promise.resolve(item),
            onConflictDoNothing: () => Promise.resolve([]),
            onConflictDoUpdate: () => Object.assign(createChainable(item), {
              returning: () => Promise.resolve(item),
            }),
          });
        },
      }),
      update: () => ({
        set: (vals: any) => {
          const item = [{ ...mockStaff, ...vals }];
          const chain = createChainable(item);
          return Object.assign(chain, {
            where: () => Object.assign(createChainable(item), {
              returning: () => Promise.resolve(item),
            }),
          });
        },
      }),
    },
    schema: {},
    sql: { end: vi.fn() },
  };
});

// Mock invalidateKBCache
vi.mock("../src/ai/prompt.ts", () => ({
  invalidateKBCache: vi.fn(),
  getKnowledgeBase: vi.fn(),
}));

// Mock email service
vi.mock("../src/services/email.ts", () => ({
  sendStaffWelcome: vi.fn(),
  sendEscalationAlert: vi.fn(),
}));

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

describe("Admin-only management routes", () => {
  describe("User management (/users)", () => {
    it("allows admin to list staff users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/users",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().users).toBeDefined();
    });

    it("allows admin to create a new staff user with 8+ char password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/users",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Deepa",
          email: "deepa@asharesins.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().user.role).toBe("staff");
      expect(res.json().user).toHaveProperty("lastLoginAt");
      expect(res.json().user).not.toHaveProperty("passwordHash");
      expect(res.body).not.toContain("argon2");
    });

    it("allows admin to deactivate a staff user", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/users/staff-2",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { active: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.active).toBe(false);
      expect(res.json().user).toHaveProperty("lastLoginAt");
      expect(res.json().user).toHaveProperty("createdAt");
      expect(res.json().user).not.toHaveProperty("passwordHash");
    });

    it("forbids staff from accessing /users (403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/users",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("Settings (/settings)", () => {
    it("allows admin to get settings", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().paused).toBe(false);
    });

    it("allows admin to pause automation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/settings/pause",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paused: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, paused: true });
      expect(rt.emitSettingsUpdated).toHaveBeenLastCalledWith("biz-1", { paused: true });
    });

    it("forbids staff from pausing automation (403)", async () => {
      rt.emitSettingsUpdated.mockClear();
      const res = await app.inject({
        method: "POST",
        url: "/settings/pause",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { paused: true },
      });

      expect(res.statusCode).toBe(403);
      expect(rt.emitSettingsUpdated).not.toHaveBeenCalled();
    });
  });

  describe("Knowledge base (/knowledge-base)", () => {
    it("allows admin to get knowledge base", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/knowledge-base",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeDefined();
    });

    it("allows admin to update knowledge base", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/knowledge-base",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { business_name: "Updated Asha Art", products: [], policies: {} },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBeDefined();
    });

    it("forbids staff from editing knowledge base (403)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/knowledge-base",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { business_name: "Hacked" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("Analytics (/analytics)", () => {
    it("allows admin to get analytics metrics", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/analytics",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.messages.total).toBeDefined();
      expect(data.autoReplyRate).toBeDefined();
      expect(data.escalationRate).toBeDefined();
    });

    it("forbids staff from viewing analytics (403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/analytics",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("Audit log (/audit-log)", () => {
    it("allows admin to get audit log", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/audit-log",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entries).toBeDefined();
    });

    it("forbids staff from viewing audit log (403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/audit-log",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
