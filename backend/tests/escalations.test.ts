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

const mockEscalation = {
  id: "esc-100",
  businessId: "biz-1",
  conversationId: "conv-1",
  reason: "intent_refund",
  assignedToUserId: null,
  assignedByUserId: null,
  assignedAt: null,
  alertedAt: new Date(),
  remindedAt: null,
  resolvedAt: null,
  resolvedByUserId: null,
  createdAt: new Date(),
};

const mockStaffUser = {
  id: "staff-1",
  businessId: "biz-1",
  name: "Priya",
  email: "priya@asharesins.com",
  role: "staff",
  active: true,
};

// Per-test overrides for the assign validation tests.
let usersRows: any[] = [mockStaffUser];
let escalationOverride: Record<string, any> | null | undefined; // null = not found
const resetOverrides = () => {
  usersRows = [mockStaffUser];
  escalationOverride = undefined;
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

  return {
    db: {
      select: () => ({
        from: (table: any) => {
          const name = table?.[Symbol.for("drizzle:Name")] || "";
          let data: any[] = [];
          if (name === "escalations" && escalationOverride === null) {
            data = [];
          } else if (name === "escalations" && escalationOverride) {
            data = [{ ...mockEscalation, ...escalationOverride }];
          } else if (name === "escalations") {
            data = [
              {
                ...mockEscalation,
                escalation: mockEscalation,
                conversation: { id: "conv-1", state: "escalated" },
                customer: { id: "cust-1", name: "Rahul", handleOrPhone: "+919876543210" },
                channel: { id: "chan-1", type: "whatsapp" },
                assignedTo: null,
              },
            ];
          } else if (name === "users") {
            data = usersRows;
          } else if (name === "messages") {
            data = [{
              id: "msg-1",
              content: "Hello",
              senderType: "customer",
              createdAt: new Date(),
            }];
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
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: (vals: any) => {
          const item = [{ ...mockEscalation, ...vals }];
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

describe("Escalation routes", () => {
  describe("GET /escalations", () => {
    it("allows admin to view escalations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/escalations?resolved=false",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().escalations).toBeDefined();
    });

    it("allows staff to view escalations assigned to them or unassigned", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/escalations",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().escalations).toBeDefined();
    });
  });

  describe("POST /escalations/:id/assign", () => {
    it("allows admin to assign escalation to staff", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/escalations/esc-100/assign",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { userId: "staff-1" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.escalation).toBeDefined();
      expect(body.escalation.assignedToUserId).toBe("staff-1");
      expect(rt.emitEscalationAssigned).toHaveBeenLastCalledWith(
        "biz-1",
        { escalationId: "esc-100", conversationId: "conv-1", assignedToUserId: "staff-1" },
        null,
      );
    });

    const assign = (userId: string | null) =>
      app.inject({
        method: "POST",
        url: "/escalations/esc-100/assign",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { userId },
      });

    it("rejects assigning to an admin (non-staff) user", async () => {
      usersRows = [{ ...mockStaffUser, id: "admin-2", role: "admin" }];
      const res = await assign("admin-2");
      resetOverrides();
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ASSIGNEE");
    });

    it("rejects assigning to an inactive staff member", async () => {
      usersRows = [{ ...mockStaffUser, active: false }];
      const res = await assign("staff-1");
      resetOverrides();
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ASSIGNEE");
    });

    it("rejects assigning to staff from another business", async () => {
      usersRows = [{ ...mockStaffUser, businessId: "biz-2" }];
      const res = await assign("staff-1");
      resetOverrides();
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ASSIGNEE");
    });

    it("rejects an unknown user id", async () => {
      usersRows = [];
      const res = await assign("nobody");
      resetOverrides();
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_ASSIGNEE");
    });

    it("returns 409 when the escalation is already resolved", async () => {
      escalationOverride = { resolvedAt: new Date() };
      const res = await assign("staff-1");
      resetOverrides();
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("ESCALATION_RESOLVED");
    });

    it("returns 404 for an escalation outside the admin's business", async () => {
      escalationOverride = null;
      const res = await assign("staff-1");
      resetOverrides();
      expect(res.statusCode).toBe(404);
    });

    it("allows unassigning with userId null", async () => {
      usersRows = [];
      const res = await assign(null);
      resetOverrides();
      expect(res.statusCode).toBe(200);
      expect(res.json().escalation.assignedToUserId).toBeNull();
      expect(res.json().escalation.assignedTo).toBeNull();
      expect(rt.emitEscalationAssigned).toHaveBeenLastCalledWith(
        "biz-1",
        { escalationId: "esc-100", conversationId: "conv-1", assignedToUserId: null },
        null,
      );
    });

    it("tells the previous assignee when an escalation is reassigned", async () => {
      escalationOverride = { assignedToUserId: "staff-9" };
      const res = await assign("staff-1");
      resetOverrides();
      expect(res.statusCode).toBe(200);
      expect(rt.emitEscalationAssigned).toHaveBeenLastCalledWith(
        "biz-1",
        expect.objectContaining({ assignedToUserId: "staff-1" }),
        "staff-9",
      );
    });

    it("does not emit when the assignment is rejected", async () => {
      rt.emitEscalationAssigned.mockClear();
      usersRows = [];
      await assign("nobody");
      resetOverrides();
      expect(rt.emitEscalationAssigned).not.toHaveBeenCalled();
    });

    it("forbids staff from assigning escalations (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/escalations/esc-100/assign",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { userId: "staff-1" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("FORBIDDEN");
    });
  });
});
