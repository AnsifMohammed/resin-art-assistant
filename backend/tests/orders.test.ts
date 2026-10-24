import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake, type FakeQuery } from "./fakeDb.ts";

applyTestEnv();

const rt = vi.hoisted(() => ({
  emitMessageNew: vi.fn(),
  emitConversationUpdated: vi.fn(),
  emitEscalationNew: vi.fn(),
  emitEscalationAssigned: vi.fn(),
  emitConversationAccessChanged: vi.fn(),
  emitSettingsUpdated: vi.fn(),
  emitCustomerUpdated: vi.fn(),
  emitBroadcastUpdated: vi.fn(),
  disconnectUserEverywhere: vi.fn(),
}));
vi.mock("../src/realtime/events.ts", () => rt);

vi.mock("../src/lib/userStatus.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/userStatus.ts")>()),
  assertUserActive: async () => {},
}));

vi.mock("../src/db/index.ts", async () => (await import("./fakeDb.ts")).fakeDbModule());

const created = new Date("2026-01-01T00:00:00Z");

const mockOrder = {
  id: "ord-1",
  businessId: "biz-1",
  customerId: "cust-1",
  orderNo: "ORD-001",
  customerName: "Meera",
  customerPhone: "919876543210",
  customerEmail: "meera@example.com",
  channel: "whatsapp",
  status: "confirmed",
  totalAmount: "1500.00",
  deliveryCharge: "0",
  discountAmount: "0",
  shippingAddress: "123 Marine Drive, Kochi",
  courier: null,
  trackingId: null,
  expectedDeliveryDate: null,
  customerNotes: null,
  internalNotes: null,
  isDeleted: false,
  createdAt: created,
  updatedAt: created,
};

const mockItem = {
  id: "item-1",
  orderId: "ord-1",
  productId: null,
  productName: "Ocean Coaster Set",
  productDescription: null,
  quantity: 2,
  unitPrice: "750.00",
  customizations: {},
  isDeleted: false,
  createdAt: created,
  updatedAt: created,
};

function answerOrders(q: FakeQuery): any[] | undefined {
  if (q.table === "orders" && q.groupBy) {
    return [{ status: "confirmed", count: 1 }];
  }
  return undefined;
}

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
  fake.reset({
    orders: [mockOrder],
    order_items: [mockItem],
    customers: [
      {
        id: "cust-1",
        businessId: "biz-1",
        name: "Meera",
        handleOrPhone: "919876543210",
        createdAt: created,
        updatedAt: created,
      },
    ],
    payments: [],
    audit_log: [],
  });
  fake.onSelect = answerOrders;
  Object.values(rt).forEach((fn) => fn.mockClear());
});

const call = (method: string, url: string, token: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload } : {}),
  });

describe("Orders routes security & functionality", () => {
  describe("GET /orders", () => {
    it("forbids staff from listing all orders (403)", async () => {
      const res = await call("GET", "/orders", staffToken);
      expect(res.statusCode).toBe(403);
    });

    it("allows admin to list orders and returns status counts", async () => {
      const res = await call("GET", "/orders", adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0].orderNo).toBe("ORD-001");
      expect(body.orders[0].items).toHaveLength(1);
      expect(body.statusCounts).toBeDefined();
      expect(body.statusCounts.all).toBe(1);
      expect(body.statusCounts.confirmed).toBe(1);
    });
  });

  describe("GET /orders/:id", () => {
    it("forbids staff from viewing order details by id (403)", async () => {
      const res = await call("GET", "/orders/ord-1", staffToken);
      expect(res.statusCode).toBe(403);
    });

    it("allows admin to view order details", async () => {
      const res = await call("GET", "/orders/ord-1", adminToken);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.order.id).toBe("ord-1");
      expect(body.order.orderNo).toBe("ORD-001");
      expect(body.order.items).toHaveLength(1);
    });

    it("returns 404 for nonexistent order", async () => {
      const res = await call("GET", "/orders/ord-unknown", adminToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /orders", () => {
    it("forbids staff from creating orders (403)", async () => {
      const res = await call("POST", "/orders", staffToken, {
        customerName: "Meera",
        items: [{ productName: "Ocean Coaster", unitPrice: 500, quantity: 1 }],
      });
      expect(res.statusCode).toBe(403);
    });

    it("allows admin to create an order", async () => {
      const res = await call("POST", "/orders", adminToken, {
        customerName: "Meera",
        customerPhone: "919876543210",
        items: [{ productName: "Ocean Coaster", unitPrice: 500, quantity: 1 }],
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.order).toBeDefined();
      expect(body.order.customerName).toBe("Meera");
    });
  });
});
