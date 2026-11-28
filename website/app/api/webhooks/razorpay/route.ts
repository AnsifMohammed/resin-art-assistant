import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOrderByNumber, saveOrder } from "@/lib/ordersStore";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    // Idempotent handling of payment.captured event
    if (event === "payment.captured") {
      const payment = payload.payload?.payment?.entity;
      const receipt = payment?.notes?.orderNo;

      if (receipt) {
        const existing = getOrderByNumber(receipt);
        if (existing && existing.status === "pending") {
          saveOrder({
            ...existing,
            status: "confirmed",
            razorpayPaymentId: payment.id,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
