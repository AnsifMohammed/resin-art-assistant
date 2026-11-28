import { NextResponse } from "next/server";
import { getOrderByNumber } from "@/lib/ordersStore";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  try {
    const { orderNo } = await params;
    if (!orderNo) {
      return NextResponse.json({ error: "Missing order number" }, { status: 400 });
    }

    const normalized = orderNo.trim().toUpperCase();
    const order = getOrderByNumber(normalized);

    if (!order) {
      return NextResponse.json({ error: `Order ${normalized} not found` }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (err: unknown) {
    console.error("Error fetching order:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
