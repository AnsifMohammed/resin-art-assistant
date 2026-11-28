/**
 * Server-side Order Store for Saba Art Storefront.
 * Stores verified orders in-memory/persistent store for order lookups,
 * production journal updates, and status timeline.
 */

export interface OrderItem {
  slug: string;
  name: string;
  sizeName: string;
  unitPrice: number;
  quantity: number;
  isCustomized?: boolean;
  customDetails?: Record<string, string | number | boolean>;
  leadTimeDays: number;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "in_production"
  | "ready"
  | "dispatched"
  | "delivered"
  | "cancelled";

export interface ProductionJournalEntry {
  id: string;
  title: string;
  caption: string;
  timestamp: string; // ISO
  imageUrl?: string;
  status: OrderStatus;
}

export interface StoredOrder {
  orderNo: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  paymentMode?: "razorpay" | "demo";
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: {
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
  };
  isGift?: boolean;
  giftNote?: string;
  giftWrapping?: boolean;
  hidePrice?: boolean;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  deliveryCharge: number;
  total: number;
  dispatchByDate: string;
  courierName?: string;
  trackingId?: string;
  createdAt: string; // ISO
  journal: ProductionJournalEntry[];
}

// Global in-memory storage for orders (persists across API requests in server runtime)
const ordersMap = new Map<string, StoredOrder>();

// Pre-seed a sample demo order so order lookup `/orders` works immediately out of the box!
const DEMO_ORDER: StoredOrder = {
  orderNo: "SA-101",
  razorpayOrderId: "order_demo_101",
  razorpayPaymentId: "pay_demo_101",
  status: "in_production",
  customerName: "Priya Raman",
  customerPhone: "9876543210",
  customerEmail: "priya@example.com",
  shippingAddress: {
    addressLine: "14B, Race Course Road",
    city: "Coimbatore",
    state: "Tamil Nadu",
    pincode: "641018",
  },
  items: [
    {
      slug: "resin-clock-12in",
      name: "12 inch Resin Wall Clock",
      sizeName: "12 inch",
      unitPrice: 2800,
      quantity: 1,
      isCustomized: true,
      customDetails: { theme: "Ocean Waves", text: "Priya & Arvind" },
      leadTimeDays: 7,
    },
  ],
  subtotal: 2800,
  discountTotal: 0,
  deliveryCharge: 0,
  total: 2800,
  dispatchByDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
  courierName: "Shiprocket (DTDC)",
  trackingId: "DTDC-CBE-88219",
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  journal: [
    {
      id: "j-1",
      title: "Teak base shaped & bevelled",
      caption: "Seasoned circular teak base carved and hand-sanded to 400 grit.",
      timestamp: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      status: "confirmed",
    },
    {
      id: "j-2",
      title: "First wave layer poured",
      caption: "Deep ocean pigment blend poured with natural sand coastline. Currently curing under dust-free hood.",
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      status: "in_production",
    },
  ],
};

ordersMap.set("SA-101", DEMO_ORDER);

export function saveOrder(order: StoredOrder): void {
  ordersMap.set(order.orderNo, order);
}

export function getOrderByNumber(orderNo: string): StoredOrder | undefined {
  const clean = orderNo.trim().toUpperCase().replace(/^#/, "");
  return ordersMap.get(clean);
}

export function findOrdersByPhone(phone: string): StoredOrder[] {
  const cleanPhone = phone.replace(/\D/g, "").slice(-10);
  return Array.from(ordersMap.values()).filter((o) =>
    o.customerPhone.replace(/\D/g, "").slice(-10) === cleanPhone
  );
}

export function generateOrderNumber(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `SA-${randomNum}`;
}
