import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { PRODUCTS } from "@/lib/products";
import { calculateCartPricing, type CartLineItem } from "@/lib/pricing";
import { generateOrderNumber } from "@/lib/ordersStore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, customer, shippingAddress, giftOptions } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    if (!customer?.phone || !shippingAddress?.pincode) {
      return NextResponse.json(
        { error: "Customer phone and shipping pincode are required" },
        { status: 400 }
      );
    }

    // Server-side authoritative price recomputation (Section 11 spec)
    const authoritativeItems: CartLineItem[] = [];

    for (const rawItem of items) {
      const product = PRODUCTS.find((p) => p.slug === rawItem.slug);
      if (!product) {
        return NextResponse.json(
          { error: `Product ${rawItem.slug} is no longer active in catalogue` },
          { status: 400 }
        );
      }

      const size = product.sizes.find((s) => s.name === rawItem.sizeName);
      if (!size) {
        return NextResponse.json(
          { error: `Invalid size ${rawItem.sizeName} for ${product.name}` },
          { status: 400 }
        );
      }

      // Recompute custom surcharges if any
      let surcharge = 0;
      if (rawItem.isCustomized && rawItem.customDetails) {
        for (const [optId, val] of Object.entries(rawItem.customDetails)) {
          if (val) {
            const optDef = product.customOptions.find((o) => o.id === optId);
            surcharge += optDef?.surcharge || 0;
          }
        }
      }

      authoritativeItems.push({
        slug: product.slug,
        name: product.name,
        sizeName: size.name,
        unitPrice: size.price + surcharge,
        quantity: Math.max(1, parseInt(rawItem.quantity, 10) || 1),
        isCustomized: !!rawItem.isCustomized,
        leadTimeDays: product.leadTimeDays,
      });
    }

    // Recompute total pricing
    const pricing = calculateCartPricing(
      authoritativeItems,
      shippingAddress.pincode,
      shippingAddress.state
    );

    // Gift wrap surcharge
    const giftWrapCost = giftOptions?.giftWrapping ? 150 : 0;
    const finalAmountInRupees = pricing.total + giftWrapCost;
    const finalAmountInPaise = finalAmountInRupees * 100;

    const orderNo = generateOrderNumber();

    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_sabaart";
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    let razorpayOrderId = `order_mock_${Date.now()}`;

    // If real/test Razorpay keys are provided, call official Razorpay API
    if (keySecret && !keyId.includes("sabaart")) {
      try {
        const instance = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const rzpOrder = await instance.orders.create({
          amount: finalAmountInPaise,
          currency: "INR",
          receipt: orderNo,
          notes: {
            orderNo,
            customerPhone: customer.phone,
          },
        });

        razorpayOrderId = rzpOrder.id;
      } catch (err: unknown) {
        console.error("Razorpay order creation failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      orderNo,
      razorpayOrderId,
      amount: finalAmountInPaise,
      amountInRupees: finalAmountInRupees,
      currency: "INR",
      keyId,
      pricing,
    });
  } catch (err: unknown) {
    console.error("Create order failed:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
