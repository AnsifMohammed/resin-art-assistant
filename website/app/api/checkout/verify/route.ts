import { NextResponse } from "next/server";
import crypto from "crypto";
import { saveOrder, type StoredOrder } from "@/lib/ordersStore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderDetails,
    } = body;

    if (!orderDetails || !orderDetails.orderNo || !orderDetails.customer || !orderDetails.items) {
      return NextResponse.json(
        { error: "Invalid request: missing orderDetails" },
        { status: 400 }
      );
    }

    const isDemoAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_PAYMENTS_DEMO_MODE === "true";

    let paymentMode: "razorpay" | "demo" = "razorpay";

    if (isDemoAllowed && body.demoMode === true) {
      paymentMode = "demo";
    } else {
      const secret = process.env.RAZORPAY_KEY_SECRET;

      // Rule 1: Fail closed if secret is missing (500)
      if (!secret) {
        console.error("Payment verification failed: RAZORPAY_KEY_SECRET is not configured");
        return NextResponse.json(
          { error: "Payment verification unavailable: server configuration error" },
          { status: 500 }
        );
      }

      // Rule 2: Missing or malformed signature, order ID, or payment ID is a 400
      if (!razorpay_signature || !razorpay_order_id || !razorpay_payment_id) {
        return NextResponse.json(
          { error: "Payment verification failed: Missing required Razorpay payment attributes" },
          { status: 400 }
        );
      }

      // Rule 3: Enforce strict HMAC-SHA256 signature verification
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return NextResponse.json(
          { error: "Payment verification failed: Invalid HMAC signature" },
          { status: 400 }
        );
      }
    }

    // Persist verified order into our authoritative Order Store
    const newOrder: StoredOrder = {
      orderNo: orderDetails.orderNo,
      razorpayOrderId: razorpay_order_id || `demo_${Date.now()}`,
      razorpayPaymentId: razorpay_payment_id || `pay_demo_${Date.now()}`,
      paymentMode,
      status: "confirmed",
      customerName: orderDetails.customer.name,
      customerPhone: orderDetails.customer.phone,
      customerEmail: orderDetails.customer.email,
      shippingAddress: orderDetails.shippingAddress,
      isGift: orderDetails.giftOptions?.isGift,
      giftNote: orderDetails.giftOptions?.giftNote,
      giftWrapping: orderDetails.giftOptions?.giftWrapping,
      hidePrice: orderDetails.giftOptions?.hidePrice,
      items: orderDetails.items,
      subtotal: orderDetails.pricing.subtotal,
      discountTotal: orderDetails.pricing.discountTotal,
      deliveryCharge: orderDetails.pricing.deliveryCharge,
      total: orderDetails.amountInRupees || orderDetails.pricing.total,
      dispatchByDate: orderDetails.pricing.dispatchByDate,
      courierName: "Shiprocket (DTDC / Delhivery)",
      createdAt: new Date().toISOString(),
      journal: [
        {
          id: `j-${Date.now()}`,
          title: "Order Confirmed & Payment Received",
          caption:
            "Your booking is confirmed! The studio has queued your pieces for teak prep and initial wave pouring.",
          timestamp: new Date().toISOString(),
          status: "confirmed",
        },
      ],
    };

    saveOrder(newOrder);

    return NextResponse.json({
      success: true,
      orderNo: newOrder.orderNo,
      paymentMode,
      message: "Order placed and verified successfully",
    });
  } catch (err: unknown) {
    console.error("Order verification error:", err);
    return NextResponse.json({ error: "Failed to verify order" }, { status: 500 });
  }
}
