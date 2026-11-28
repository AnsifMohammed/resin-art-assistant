import { NextResponse } from "next/server";
import { getOrderByNumber } from "@/lib/ordersStore";
import { checkLookupRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const { orderNo, phone } = await req.json();

    if (!orderNo || !phone) {
      return NextResponse.json(
        { error: "Please provide both Order Number and Phone Number." },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return NextResponse.json(
        { error: "Please provide a valid 10-digit Indian phone number." },
        { status: 400 }
      );
    }

    // Rate-limit check: 10 attempts per phone number per hour
    const rateLimit = checkLookupRateLimit(cleanPhone);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many lookup attempts. For security, please wait 1 hour or contact the studio on WhatsApp.",
          retryAfter: rateLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const normalizedOrderNo = orderNo.trim().toUpperCase();
    const order = getOrderByNumber(normalizedOrderNo);

    if (!order) {
      return NextResponse.json(
        { error: `No order found with number ${normalizedOrderNo}. Please check your order confirmation.` },
        { status: 404 }
      );
    }

    // Security check: phone must match the order's phone number
    const orderPhoneClean = order.customerPhone.replace(/\D/g, "");
    if (orderPhoneClean !== cleanPhone && !orderPhoneClean.endsWith(cleanPhone) && !cleanPhone.endsWith(orderPhoneClean)) {
      return NextResponse.json(
        { error: "The provided phone number does not match our records for this order." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err: unknown) {
    console.error("Order lookup error:", err);
    return NextResponse.json({ error: "Failed to perform order lookup" }, { status: 500 });
  }
}
