import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";
import { fake } from "./fakeDb.ts";

applyTestEnv();

const rt = vi.hoisted(() => ({
  emitOrderUpdated: vi.fn(),
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

const mockSendMessage = vi.fn().mockResolvedValue({ metaMessageId: "mock_mid_123" });
vi.mock("../src/services/send.ts", () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
}));

const created = new Date("2026-01-01T00:00:00Z");

const mockOrder = {
  id: "ord-1",
  businessId: "biz-1",
  customerId: "cust-1",
  orderNo: "ORD-001",
  customerName: "Meera",
  customerPhone: "919876543210",
  customerEmail: "meera@example.com",
  channel: "instagram",
  status: "confirmed",
  totalAmount: "2000.00",
  deliveryCharge: "0",
  discountAmount: "0",
  shippingAddress: null,
  courier: null,
  trackingId: null,
  expectedDeliveryDate: null,
  customerNotes: null,
  internalNotes: null,
  isDeleted: false,
  createdAt: created,
  updatedAt: created,
};

const mockPayment = {
  id: "pay-1",
  businessId: "biz-1",
  orderId: "ord-1",
  kind: "advance",
  amount: 1000,
  status: "pending",
  method: "UPI",
  reference: null,
  note: null,
  paidAt: null,
  recordedByUserId: null,
  voidedReason: null,
  createdAt: created,
  updatedAt: created,
};

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
    customers: [
      {
        id: "cust-1",
        businessId: "biz-1",
        name: "Meera",
        handleOrPhone: "meera_art",
        createdAt: created,
        updatedAt: created,
      },
    ],
    conversations: [
      {
        id: "conv-1",
        businessId: "biz-1",
        customerId: "cust-1",
        channelId: "ch-1",
        state: "owner_handling",
        createdAt: created,
        updatedAt: created,
      },
    ],
    channels: [
      {
        id: "ch-1",
        businessId: "biz-1",
        type: "instagram",
        status: "active",
        createdAt: created,
        updatedAt: created,
      },
    ],
    payments: [{ ...mockPayment }],
    messages: [],
    knowledge_base: [
      {
        id: "kb-1",
        businessId: "biz-1",
        data: {
          business_name: "Saba Art",
          payment: {
            upi_id: "sabaart@okaxis",
          },
        },
        createdAt: created,
        updatedAt: created,
      },
    ],
    audit_log: [],
  });
  mockSendMessage.mockClear();
  Object.values(rt).forEach((fn) => fn.mockClear());
});

const call = (method: string, url: string, token?: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });

describe("Payment Links & Payment Request Routes", () => {
  describe("GET /orders/:id/payments", () => {
    it("returns payment records with upiLink and paymentLink computed", async () => {
      const res = await call("GET", "/orders/ord-1/payments", adminToken);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.payments).toHaveLength(1);
      expect(json.payments[0].id).toBe("pay-1");
      expect(json.payments[0].paymentLink).toContain("/pay/pay-1");
      expect(json.payments[0].upiLink).toContain("upi://pay");
      expect(json.businessInfo.upiId).toBe("sabaart@okaxis");
      expect(json.summary.balanceDue).toBe(2000);
      expect(json.summary.totalPending).toBe(1000);
    });
  });

  describe("POST /orders/:id/payments", () => {
    it("creates a pending payment and generates paymentLink", async () => {
      const res = await call("POST", "/orders/ord-1/payments", adminToken, {
        kind: "balance",
        amount: 1000,
        markPaidImmediately: false,
      });
      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.payment.amount).toBe(1000);
      expect(json.payment.status).toBe("pending");
      expect(json.payment.paymentLink).toContain("/pay/");
      expect(json.links.upiLink).toContain("upi://pay");
    });
  });

  describe("GET /payments/:id/link", () => {
    it("returns formatted payment request message and links for staff/admin", async () => {
      const res = await call("GET", "/payments/pay-1/link", staffToken);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.paymentId).toBe("pay-1");
      expect(json.paymentUrl).toContain("/pay/pay-1");
      expect(json.upiLink).toContain("upi://pay");
      expect(json.formattedMessage).toContain("ORD-001");
      expect(json.formattedMessage).toContain("₹1,000");
      expect(json.upiId).toBe("sabaart@okaxis");
    });
  });

  describe("POST /orders/:id/payments/:paymentId/send-request", () => {
    it("dispatches payment request to customer via sendMessage and records to messages", async () => {
      const res = await call("POST", "/orders/ord-1/payments/pay-1/send-request", adminToken, {
        customMessage: "Hi Meera! Please pay the advance of ₹1000 using this link.",
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.ok).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: "instagram",
          businessId: "biz-1",
        }),
      );
    });
  });

  describe("Public payment link routes", () => {
    it("GET /public/payments/:id loads payment request details without auth", async () => {
      const res = await call("GET", "/public/payments/pay-1");
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.payment.id).toBe("pay-1");
      expect(json.payment.amount).toBe(1000);
      expect(json.order.orderNo).toBe("ORD-001");
      expect(json.business.upiId).toBe("sabaart@okaxis");
      expect(json.upiLink).toContain("upi://pay");
    });

    it("POST /public/payments/:id/submit-utr submits customer reference number without auth", async () => {
      const res = await call("POST", "/public/payments/pay-1/submit-utr", undefined, {
        reference: "419823901923",
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.ok).toBe(true);
      expect(json.payment.reference).toBe("419823901923");
      expect(rt.emitOrderUpdated).toHaveBeenCalled();
    });
  });
});
