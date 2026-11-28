import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { POST } from "../app/api/checkout/verify/route";
import { getOrderByNumber } from "../lib/ordersStore";

describe("Payment Verification Security (P0)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const validOrderPayload = {
    razorpay_order_id: "order_test_123",
    razorpay_payment_id: "pay_test_456",
    razorpay_signature: "",
    orderDetails: {
      orderNo: "SA-TEST-001",
      customer: {
        name: "Test Customer",
        phone: "9876543210",
        email: "test@example.com",
      },
      shippingAddress: {
        addressLine: "123 Studio Way",
        city: "Coimbatore",
        state: "Tamil Nadu",
        pincode: "641001",
      },
      items: [
        {
          slug: "ocean-coaster-set-4",
          name: "Ocean Resin Coasters",
          sizeName: "Standard",
          unitPrice: 1200,
          quantity: 1,
          leadTimeDays: 5,
        },
      ],
      pricing: {
        subtotal: 1200,
        discountTotal: 0,
        deliveryCharge: 0,
        total: 1200,
        dispatchByDate: "2026-12-01",
      },
      amountInRupees: 1200,
    },
  };

  it("fails closed with 500 when RAZORPAY_KEY_SECRET is not configured", async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.NEXT_PUBLIC_PAYMENTS_DEMO_MODE;

    const req = new Request("http://localhost:3000/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validOrderPayload,
        razorpay_signature: "any_signature",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toContain("server configuration error");
  });

  it("returns 400 when razorpay_signature is missing", async () => {
    process.env.RAZORPAY_KEY_SECRET = "secret_123";

    const req = new Request("http://localhost:3000/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validOrderPayload,
        razorpay_signature: "",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Missing required Razorpay payment attributes");
  });

  it("returns 400 when razorpay_signature is invalid (bad HMAC)", async () => {
    process.env.RAZORPAY_KEY_SECRET = "secret_123";

    const req = new Request("http://localhost:3000/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validOrderPayload,
        razorpay_signature: "tampered_or_invalid_signature_hex",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain("Invalid HMAC signature");
  });

  it("succeeds with 200 when signature matches valid HMAC-SHA256", async () => {
    const secret = "secret_test_xyz";
    process.env.RAZORPAY_KEY_SECRET = secret;

    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${validOrderPayload.razorpay_order_id}|${validOrderPayload.razorpay_payment_id}`)
      .digest("hex");

    const req = new Request("http://localhost:3000/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validOrderPayload,
        razorpay_signature: generatedSignature,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.orderNo).toBe("SA-TEST-001");
    expect(json.paymentMode).toBe("razorpay");

    const stored = getOrderByNumber("SA-TEST-001");
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("confirmed");
  });

  it("allows demo payment mode only when NEXT_PUBLIC_PAYMENTS_DEMO_MODE=true in non-production", async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true, writable: true });
    process.env.NEXT_PUBLIC_PAYMENTS_DEMO_MODE = "true";

    const req = new Request("http://localhost:3000/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validOrderPayload,
        orderDetails: {
          ...validOrderPayload.orderDetails,
          orderNo: "SA-DEMO-002",
        },
        demoMode: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.paymentMode).toBe("demo");

    const stored = getOrderByNumber("SA-DEMO-002");
    expect(stored).toBeDefined();
    expect(stored?.paymentMode).toBe("demo");
  });
});
