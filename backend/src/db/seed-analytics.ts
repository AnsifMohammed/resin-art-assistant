import { db, sql } from "../db/index.ts";
import {
  businesses,
  users,
  channels,
  customers,
  conversations,
  messages,
  escalations,
  orders,
  orderItems,
  payments,
  products,
} from "../db/schema.ts";
import { nanoid } from "nanoid";
import { config } from "../config.ts";
import { eq, and } from "drizzle-orm";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const mkId = () => "da_" + nanoid();

// ─── Query admin user ─────────────────────────────────────────────────────────
const [admin] = await db
  .select()
  .from(users)
  .where(and(eq(users.businessId, config.BUSINESS_ID), eq(users.role, "admin")));

if (!admin) {
  console.error("No admin user found for businessId:", config.BUSINESS_ID);
  console.error("Run the main seed script first (npm run db:seed).");
  await sql.end();
  process.exit(1);
}

// ─── Channels ─────────────────────────────────────────────────────────────────
const waIdentifier = `demo-whatsapp-${config.BUSINESS_ID}`;
const igIdentifier = `demo-instagram-${config.BUSINESS_ID}`;

await db
  .insert(channels)
  .values([
    {
      id: mkId(),
      businessId: config.BUSINESS_ID,
      type: "whatsapp",
      identifier: waIdentifier,
      status: "active",
    },
    {
      id: mkId(),
      businessId: config.BUSINESS_ID,
      type: "instagram",
      identifier: igIdentifier,
      status: "active",
    },
  ])
  .onConflictDoNothing();

// Query channels back to get real IDs
const [waChannel] = await db
  .select()
  .from(channels)
  .where(
    and(
      eq(channels.businessId, config.BUSINESS_ID),
      eq(channels.type, "whatsapp"),
      eq(channels.identifier, waIdentifier),
    ),
  );

const [igChannel] = await db
  .select()
  .from(channels)
  .where(
    and(
      eq(channels.businessId, config.BUSINESS_ID),
      eq(channels.type, "instagram"),
      eq(channels.identifier, igIdentifier),
    ),
  );

if (!waChannel || !igChannel) {
  console.error("Failed to query channels back after insert.");
  await sql.end();
  process.exit(1);
}

// ─── Customers ────────────────────────────────────────────────────────────────
const waCustomers = [
  { handle: "919876540001", name: "Riya Sharma",   language: "english" },
  { handle: "919876540002", name: "Anjali Devi",   language: "english" },
  { handle: "919876540003", name: "Pooja Nambiar", language: "malayalam" },
  { handle: "919876540004", name: "Sindhu Varma",  language: "english" },
  { handle: "919876540005", name: "Rekha Mohan",   language: "english" },
  { handle: "919876540006", name: "Geetha Kumar",  language: "malayalam" },
];

const igCustomers = [
  { handle: "ig_user_lakshmi", name: "Lakshmi Nair",    language: "malayalam" },
  { handle: "ig_user_priya",   name: "Priya Menon",     language: "english" },
  { handle: "ig_user_divya",   name: "Divya Thomas",    language: "english" },
  { handle: "ig_user_meera",   name: "Meera Pillai",    language: "malayalam" },
  { handle: "ig_user_sunita",  name: "Sunita Krishnan", language: "english" },
  { handle: "ig_user_kavitha", name: "Kavitha Raj",     language: "english" },
];

const waCustomerValues = waCustomers.map((c) => ({
  id: mkId(),
  businessId: config.BUSINESS_ID,
  channelId: waChannel.id,
  name: c.name,
  handleOrPhone: c.handle,
  language: c.language,
}));

const igCustomerValues = igCustomers.map((c) => ({
  id: mkId(),
  businessId: config.BUSINESS_ID,
  channelId: igChannel.id,
  name: c.name,
  handleOrPhone: c.handle,
  language: c.language,
}));

await db.insert(customers).values(waCustomerValues).onConflictDoNothing();
await db.insert(customers).values(igCustomerValues).onConflictDoNothing();

// Query customers back (keyed by handleOrPhone for easy lookup)
const allCustomers = await db
  .select()
  .from(customers)
  .where(eq(customers.businessId, config.BUSINESS_ID));

const customerByHandle = new Map(allCustomers.map((c) => [c.handleOrPhone, c]));

const getCustomer = (handle: string) => {
  const c = customerByHandle.get(handle);
  if (!c) throw new Error(`Customer not found for handle: ${handle}`);
  return c;
};

// ─── Conversations ────────────────────────────────────────────────────────────
// States: 6 ai_active, 3 escalated, 2 owner_handling, 1 paused
// The 3 "escalated" conversations will have open escalations

type ConvDef = {
  handle: string;
  channelId: string;
  state: "ai_active" | "escalated" | "owner_handling" | "paused";
  tag: "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up" | null;
  lastMsgDaysAgo: number;
};

const convDefs: ConvDef[] = [
  // ai_active – recent
  { handle: "919876540001", channelId: waChannel.id, state: "ai_active",       tag: "new_lead",        lastMsgDaysAgo: 1 },
  { handle: "919876540002", channelId: waChannel.id, state: "ai_active",       tag: "custom_order",    lastMsgDaysAgo: 2 },
  { handle: "ig_user_lakshmi", channelId: igChannel.id, state: "ai_active",   tag: "follow_up",       lastMsgDaysAgo: 3 },
  { handle: "ig_user_priya",   channelId: igChannel.id, state: "ai_active",   tag: "order_confirmed", lastMsgDaysAgo: 4 },
  // ai_active – older
  { handle: "919876540003", channelId: waChannel.id, state: "ai_active",       tag: "payment_pending", lastMsgDaysAgo: 12 },
  { handle: "ig_user_divya",   channelId: igChannel.id, state: "ai_active",   tag: "new_lead",        lastMsgDaysAgo: 18 },
  // escalated (3) – these get open escalations
  { handle: "919876540004", channelId: waChannel.id, state: "escalated",       tag: "follow_up",       lastMsgDaysAgo: 1 },
  { handle: "ig_user_meera",   channelId: igChannel.id, state: "escalated",   tag: "custom_order",    lastMsgDaysAgo: 2 },
  { handle: "919876540005", channelId: waChannel.id, state: "escalated",       tag: null,              lastMsgDaysAgo: 3 },
  // owner_handling (2)
  { handle: "ig_user_sunita",  channelId: igChannel.id, state: "owner_handling", tag: "custom_order", lastMsgDaysAgo: 1 },
  { handle: "919876540006", channelId: waChannel.id, state: "owner_handling",  tag: "payment_pending", lastMsgDaysAgo: 5 },
  // paused (1)
  { handle: "ig_user_kavitha", channelId: igChannel.id, state: "paused",      tag: "new_lead",        lastMsgDaysAgo: 20 },
];

const convInsertValues = convDefs.map((def) => {
  const customer = getCustomer(def.handle);
  const lastMsg = daysAgo(def.lastMsgDaysAgo);
  return {
    id: mkId(),
    businessId: config.BUSINESS_ID,
    customerId: customer.id,
    channelId: def.channelId,
    state: def.state,
    tag: def.tag ?? undefined,
    lastCustomerMessageAt: lastMsg,
    windowClosesAt: new Date(lastMsg.getTime() + 24 * 3_600_000),
    lastMessageAt: lastMsg,
    createdAt: daysAgo(def.lastMsgDaysAgo + 2),
  };
});

await db.insert(conversations).values(convInsertValues).onConflictDoNothing();

// Query conversations back
const allConvs = await db
  .select()
  .from(conversations)
  .where(eq(conversations.businessId, config.BUSINESS_ID));

const convByCustomerId = new Map(allConvs.map((c) => [c.customerId, c]));

const getConv = (handle: string) => {
  const customer = getCustomer(handle);
  const conv = convByCustomerId.get(customer.id);
  if (!conv) throw new Error(`Conversation not found for handle: ${handle}`);
  return conv;
};

// ─── Messages ─────────────────────────────────────────────────────────────────
// ~65 total, upward trend: ~10 in days 8-30, ~55 in last 7 days

type MsgDef = {
  convHandle: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "ai" | "owner" | "staff" | "system";
  senderId?: string;
  content: string;
  deliveryStatus?: "queued" | "sent" | "delivered" | "read" | "failed";
  hoursAgoVal: number;
};

const msgDefs: MsgDef[] = [
  // ── Conv 1: Riya (WA, ai_active, new_lead) — recent, 5 msgs ──
  { convHandle: "919876540001", direction: "inbound",  senderType: "customer", content: "Hi, how much is the ocean coaster set?",                          hoursAgoVal: 26 },
  { convHandle: "919876540001", direction: "outbound", senderType: "ai",       content: "Hi Riya! 😊 The Ocean Coaster Set of 4 is ₹1,200. We can customise colours and add a name too! Lead time is about 5 days. Interested?", deliveryStatus: "read",      hoursAgoVal: 26 },
  { convHandle: "919876540001", direction: "inbound",  senderType: "customer", content: "Yes! Do you deliver to Hyderabad?",                                hoursAgoVal: 24 },
  { convHandle: "919876540001", direction: "outbound", senderType: "ai",       content: "Yes, we deliver all over India! 🚚 Hyderabad takes 7-10 days, shipping is ₹120. Want to place an order?", deliveryStatus: "read", hoursAgoVal: 23 },
  { convHandle: "919876540001", direction: "inbound",  senderType: "customer", content: "What colours are available?",                                      hoursAgoVal: 22 },

  // ── Conv 2: Anjali (WA, ai_active, custom_order) — recent, 6 msgs ──
  { convHandle: "919876540002", direction: "inbound",  senderType: "customer", content: "Can I get a clock with my daughter's name?",                       hoursAgoVal: 48 },
  { convHandle: "919876540002", direction: "outbound", senderType: "ai",       content: "Of course! 💕 The 12 inch clock with her name is ₹2,800. Which colours does she like? I'll send some options!", deliveryStatus: "read", hoursAgoVal: 47 },
  { convHandle: "919876540002", direction: "inbound",  senderType: "customer", content: "Blue and white please. Name is Amara.",                            hoursAgoVal: 46 },
  { convHandle: "919876540002", direction: "outbound", senderType: "ai",       content: "Beautiful choice! 💙 I'll note blue and white with 'Amara'. Lead time is 7 days. Shall I send the payment details?", deliveryStatus: "delivered", hoursAgoVal: 45 },
  { convHandle: "919876540002", direction: "inbound",  senderType: "customer", content: "Yes please!",                                                      hoursAgoVal: 44 },
  { convHandle: "919876540002", direction: "outbound", senderType: "ai",       content: "Great! 50% advance ₹1,400 via UPI to asharesins@okaxis. Balance before dispatch. Shall I confirm the order?", deliveryStatus: "delivered", hoursAgoVal: 43 },

  // ── Conv 3: Lakshmi (IG, ai_active, follow_up) — 4 msgs ──
  { convHandle: "ig_user_lakshmi", direction: "inbound",  senderType: "customer", content: "Hi, do you make resin trays?",                                  hoursAgoVal: 72 },
  { convHandle: "ig_user_lakshmi", direction: "outbound", senderType: "ai",       content: "Yes! Our Large Resin Serving Tray is ₹1,800 (30cm x 20cm). We can do custom colours, dried flowers, and gold foil. Interested? 🌸", deliveryStatus: "read", hoursAgoVal: 71 },
  { convHandle: "ig_user_lakshmi", direction: "inbound",  senderType: "customer", content: "With gold foil please. Lead time?",                             hoursAgoVal: 70 },
  { convHandle: "ig_user_lakshmi", direction: "outbound", senderType: "ai",       content: "Gold foil looks stunning! ✨ Lead time is 6 days. Want to go ahead?", deliveryStatus: "read", hoursAgoVal: 69 },

  // ── Conv 4: Priya (IG, ai_active, order_confirmed) — 5 msgs ──
  { convHandle: "ig_user_priya", direction: "inbound",  senderType: "customer", content: "I ordered keychains last week. Can you check the status?",       hoursAgoVal: 96 },
  { convHandle: "ig_user_priya", direction: "outbound", senderType: "ai",       content: "Hi Priya! Your order is in production and on track. Expected delivery in 2 days. 😊", deliveryStatus: "read", hoursAgoVal: 95 },
  { convHandle: "ig_user_priya", direction: "inbound",  senderType: "customer", content: "Great, thanks!",                                                  hoursAgoVal: 94 },
  { convHandle: "ig_user_priya", direction: "outbound", senderType: "ai",       content: "You're welcome! We'll send tracking details once dispatched. 🚚", deliveryStatus: "read", hoursAgoVal: 93 },
  { convHandle: "ig_user_priya", direction: "inbound",  senderType: "customer", content: "Can I order more for gifts?",                                     hoursAgoVal: 92 },

  // ── Conv 5: Pooja (WA, ai_active, payment_pending) — older, 3 msgs ──
  { convHandle: "919876540003", direction: "inbound",  senderType: "customer", content: "How do I pay? I want the bookmark set.",                           hoursAgoVal: 12 * 24 },
  { convHandle: "919876540003", direction: "outbound", senderType: "ai",       content: "The Resin Bookmark Set of 4 is ₹380. You can pay via Google Pay, PhonePe, or UPI to asharesins@okaxis. 50% advance to confirm. 😊", deliveryStatus: "delivered", hoursAgoVal: 12 * 24 - 1 },
  { convHandle: "919876540003", direction: "inbound",  senderType: "customer", content: "Paid the advance!",                                                hoursAgoVal: 12 * 24 - 2 },

  // ── Conv 6: Divya (IG, ai_active, new_lead) — older, 3 msgs ──
  { convHandle: "ig_user_divya", direction: "inbound",  senderType: "customer", content: "എത്ര രൂപ കൊടുക്കണം keychain ന്?",                              hoursAgoVal: 18 * 24 },
  { convHandle: "ig_user_divya", direction: "outbound", senderType: "ai",       content: "Resin Keychain Set of 3 ₹450 ആണ് 😊 Colour customise ചെയ്യാം, name കൂടി add ചെയ്യാം. Interest ഉണ്ടോ?", deliveryStatus: "read", hoursAgoVal: 18 * 24 - 1 },
  { convHandle: "ig_user_divya", direction: "inbound",  senderType: "customer", content: "Yes, pink colour with name 'Divya' please",                      hoursAgoVal: 18 * 24 - 2 },

  // ── Conv 7: Sindhu (WA, escalated) — recent, 5 msgs ──
  { convHandle: "919876540004", direction: "inbound",  senderType: "customer", content: "I want a refund for my order!",                                    hoursAgoVal: 25 },
  { convHandle: "919876540004", direction: "outbound", senderType: "ai",       content: "I'm sorry to hear that. Let me connect you with our team who can help resolve this. 🙏", deliveryStatus: "delivered", hoursAgoVal: 24 },
  { convHandle: "919876540004", direction: "inbound",  senderType: "system",   content: "Conversation escalated — reason: intent_refund",                  hoursAgoVal: 24 },
  { convHandle: "919876540004", direction: "outbound", senderType: "owner",    senderId: admin!.id, content: "Hi Sindhu, sorry for the inconvenience. Could you share your order number so we can check?", deliveryStatus: "read", hoursAgoVal: 20 },
  { convHandle: "919876540004", direction: "inbound",  senderType: "customer", content: "Order ORD-DA-009. I received a broken tray.",                      hoursAgoVal: 18 },

  // ── Conv 8: Meera (IG, escalated) — recent, 5 msgs ──
  { convHandle: "ig_user_meera", direction: "inbound",  senderType: "customer", content: "I paid already, where is my order?",                             hoursAgoVal: 48 },
  { convHandle: "ig_user_meera", direction: "outbound", senderType: "ai",       content: "I understand your concern. Our team will look into this and get back to you shortly.", deliveryStatus: "delivered", hoursAgoVal: 47 },
  { convHandle: "ig_user_meera", direction: "inbound",  senderType: "system",   content: "Conversation escalated — reason: always_escalate_phrase",         hoursAgoVal: 47 },
  { convHandle: "ig_user_meera", direction: "inbound",  senderType: "customer", content: "This is urgent please",                                           hoursAgoVal: 46 },
  { convHandle: "ig_user_meera", direction: "inbound",  senderType: "customer", content: "Can someone respond?",                                            hoursAgoVal: 40 },

  // ── Conv 9: Rekha (WA, escalated) — recent, 4 msgs ──
  { convHandle: "919876540005", direction: "inbound",  senderType: "customer", content: "How much for a 6 foot resin table?",                               hoursAgoVal: 72 },
  { convHandle: "919876540005", direction: "outbound", senderType: "ai",       content: "That sounds like a wonderful custom piece! Let me connect you with our owner for a custom quote. 😊", deliveryStatus: "delivered", hoursAgoVal: 71 },
  { convHandle: "919876540005", direction: "inbound",  senderType: "system",   content: "Conversation escalated — reason: missing_facts",                   hoursAgoVal: 71 },
  { convHandle: "919876540005", direction: "inbound",  senderType: "customer", content: "Ok waiting",                                                       hoursAgoVal: 70 },

  // ── Conv 10: Sunita (IG, owner_handling) — recent, 6 msgs ──
  { convHandle: "ig_user_sunita", direction: "inbound",  senderType: "customer", content: "I want a custom resin clock as a wedding gift.",                 hoursAgoVal: 26 },
  { convHandle: "ig_user_sunita", direction: "outbound", senderType: "ai",       content: "How lovely! 💍 Our 12 inch clock is ₹2,800. We can add names, dried flowers, and custom colours. What theme do you have in mind?", deliveryStatus: "read", hoursAgoVal: 25 },
  { convHandle: "ig_user_sunita", direction: "inbound",  senderType: "customer", content: "Gold and white, bride and groom names. Rose flowers inside.",    hoursAgoVal: 24 },
  { convHandle: "ig_user_sunita", direction: "outbound", senderType: "owner",    senderId: admin!.id, content: "That sounds absolutely beautiful! ✨ I'll personally take care of this. Can I get the names and the wedding date?", deliveryStatus: "read", hoursAgoVal: 20 },
  { convHandle: "ig_user_sunita", direction: "inbound",  senderType: "customer", content: "Arjun & Divya, wedding on Dec 15.",                              hoursAgoVal: 18 },
  { convHandle: "ig_user_sunita", direction: "outbound", senderType: "owner",    senderId: admin!.id, content: "Perfect! Order confirmed 🌹 I'll send a preview in 2 days. Total: ₹2,800 + ₹120 shipping.", deliveryStatus: "delivered", hoursAgoVal: 16 },

  // ── Conv 11: Geetha (WA, owner_handling) — older, 5 msgs ──
  { convHandle: "919876540006", direction: "inbound",  senderType: "customer", content: "My order is delayed. It was supposed to arrive 3 days ago.",       hoursAgoVal: 5 * 24 },
  { convHandle: "919876540006", direction: "outbound", senderType: "ai",       content: "I apologise for the delay! Let me get our team to check on this right away.", deliveryStatus: "read", hoursAgoVal: 5 * 24 - 1 },
  { convHandle: "919876540006", direction: "inbound",  senderType: "system",   content: "Conversation escalated — reason: intent_complaint",                hoursAgoVal: 5 * 24 - 1 },
  { convHandle: "919876540006", direction: "outbound", senderType: "owner",    senderId: admin!.id, content: "Hi Geetha, so sorry for the delay. I've contacted Shiprocket. Your order is at the Ernakulam hub and will arrive tomorrow.", deliveryStatus: "read", hoursAgoVal: 5 * 24 - 3 },
  { convHandle: "919876540006", direction: "inbound",  senderType: "customer", content: "Ok thank you for checking",                                        hoursAgoVal: 5 * 24 - 5 },

  // ── Conv 12: Kavitha (IG, paused) — old, 3 msgs ──
  { convHandle: "ig_user_kavitha", direction: "inbound",  senderType: "customer", content: "Do you ship internationally?",                                  hoursAgoVal: 20 * 24 },
  { convHandle: "ig_user_kavitha", direction: "outbound", senderType: "ai",       content: "Hi! Unfortunately we don't ship internationally at the moment. We deliver within India only. 😊", deliveryStatus: "read", hoursAgoVal: 20 * 24 - 1 },
  { convHandle: "ig_user_kavitha", direction: "inbound",  senderType: "system",   content: "Automation paused by admin",                                    hoursAgoVal: 19 * 24 },
];

// Build message insert values
const msgInsertValues = msgDefs.map((m) => {
  const conv = getConv(m.convHandle);
  return {
    id: mkId(),
    conversationId: conv.id,
    businessId: config.BUSINESS_ID,
    direction: m.direction,
    senderType: m.senderType,
    senderId: m.senderId ?? null,
    content: m.content,
    metaMessageId: "meta_" + nanoid(),
    deliveryStatus: m.deliveryStatus ?? (m.direction === "inbound" ? undefined : "sent"),
    createdAt: hoursAgo(m.hoursAgoVal),
  };
});

await db.insert(messages).values(msgInsertValues).onConflictDoNothing();
const messagesInserted = msgInsertValues.length;

// ─── Escalations ──────────────────────────────────────────────────────────────
// 10 total: 3 open (for the 3 escalated convs), 7 resolved (spread historically)

const escalatedHandles = ["919876540004", "ig_user_meera", "919876540005"];
const openEscalations = escalatedHandles.map((handle, i) => {
  const conv = getConv(handle);
  const reasons = ["intent_refund", "always_escalate_phrase", "missing_facts"] as const;
  const createdAt = daysAgo(i + 1);
  return {
    id: mkId(),
    businessId: config.BUSINESS_ID,
    conversationId: conv.id,
    reason: reasons[i]!,
    assignedToUserId: null,
    resolvedAt: null,
    createdAt,
  };
});

// 7 resolved escalations — use various conversations (including ai_active historical ones)
const resolvedHandles = [
  { handle: "919876540001", reason: "intent_complaint",        daysCreated: 25, resolveHours: 4 },
  { handle: "919876540002", reason: "intent_refund",           daysCreated: 20, resolveHours: 6 },
  { handle: "919876540003", reason: "parse_error",             daysCreated: 15, resolveHours: 2 },
  { handle: "ig_user_lakshmi", reason: "missing_facts",        daysCreated: 12, resolveHours: 8 },
  { handle: "ig_user_priya",   reason: "intent_unknown",       daysCreated: 10, resolveHours: 3 },
  { handle: "ig_user_divya",   reason: "always_escalate_phrase", daysCreated: 7, resolveHours: 5 },
  { handle: "919876540006",    reason: "intent_complaint",     daysCreated: 5,  resolveHours: 4 },
] as const;

const resolvedEscalations = resolvedHandles.map(({ handle, reason, daysCreated, resolveHours }) => {
  const conv = getConv(handle);
  const createdAt = daysAgo(daysCreated);
  const resolvedAt = new Date(createdAt.getTime() + resolveHours * 3_600_000);
  return {
    id: mkId(),
    businessId: config.BUSINESS_ID,
    conversationId: conv.id,
    reason,
    assignedToUserId: null,
    resolvedAt,
    resolvedByUserId: admin!.id,
    createdAt,
  };
});

await db.insert(escalations).values([...openEscalations, ...resolvedEscalations]).onConflictDoNothing();

// ─── Products (query real products) ──────────────────────────────────────────
const productList = await db
  .select()
  .from(products)
  .where(and(eq(products.businessId, config.BUSINESS_ID), eq(products.isActive, true)));

let ordersInserted = 0;
let orderItemsInserted = 0;

if (productList.length === 0) {
  console.warn("No products found — skipping orders, order items. Run the main seed first.");
} else {
  // ─── Orders ───────────────────────────────────────────────────────────────
  type OrderStatus = "pending" | "confirmed" | "in_production" | "ready" | "dispatched" | "delivered" | "cancelled";

  type OrderDef = {
    orderNo: string;
    handle: string;
    channel: "whatsapp" | "instagram";
    status: OrderStatus;
    subtotal: string;
    deliveryCharge: string;
    totalAmount: string;
    shippingAddress: string;
    daysCreated: number;
    dispatchedAt?: Date;
    deliveredAt?: Date;
  };

  const orderDefs: OrderDef[] = [
    { orderNo: "ORD-DA-001", handle: "919876540002", channel: "whatsapp", status: "delivered",     subtotal: "2800", deliveryCharge: "0",   totalAmount: "2800", shippingAddress: "Thrissur",  daysCreated: 28, dispatchedAt: daysAgo(22), deliveredAt: daysAgo(20) },
    { orderNo: "ORD-DA-002", handle: "ig_user_priya", channel: "instagram", status: "delivered",   subtotal: "450",  deliveryCharge: "60",  totalAmount: "510",  shippingAddress: "Kozhikode", daysCreated: 24, dispatchedAt: daysAgo(18), deliveredAt: daysAgo(14) },
    { orderNo: "ORD-DA-003", handle: "919876540003", channel: "whatsapp", status: "dispatched",    subtotal: "380",  deliveryCharge: "60",  totalAmount: "440",  shippingAddress: "Kochi",     daysCreated: 14, dispatchedAt: daysAgo(4) },
    { orderNo: "ORD-DA-004", handle: "ig_user_lakshmi", channel: "instagram", status: "dispatched", subtotal: "1800", deliveryCharge: "0",  totalAmount: "1800", shippingAddress: "Thrissur",  daysCreated: 12, dispatchedAt: daysAgo(3) },
    { orderNo: "ORD-DA-005", handle: "919876540001", channel: "whatsapp", status: "in_production", subtotal: "1200", deliveryCharge: "120", totalAmount: "1320", shippingAddress: "Hyderabad", daysCreated: 7 },
    { orderNo: "ORD-DA-006", handle: "ig_user_sunita", channel: "instagram", status: "in_production", subtotal: "2800", deliveryCharge: "120", totalAmount: "2920", shippingAddress: "Bangalore", daysCreated: 6 },
    { orderNo: "ORD-DA-007", handle: "ig_user_divya", channel: "instagram", status: "confirmed",   subtotal: "450",  deliveryCharge: "60",  totalAmount: "510",  shippingAddress: "Palakkad",  daysCreated: 5 },
    { orderNo: "ORD-DA-008", handle: "919876540006", channel: "whatsapp", status: "confirmed",     subtotal: "950",  deliveryCharge: "0",   totalAmount: "950",  shippingAddress: "Thrissur",  daysCreated: 4 },
    { orderNo: "ORD-DA-009", handle: "919876540004", channel: "whatsapp", status: "cancelled",     subtotal: "1800", deliveryCharge: "60",  totalAmount: "1860", shippingAddress: "Ernakulam", daysCreated: 10 },
    { orderNo: "ORD-DA-010", handle: "ig_user_kavitha", channel: "instagram", status: "pending",   subtotal: "1200", deliveryCharge: "0",   totalAmount: "1200", shippingAddress: "Thrissur",  daysCreated: 1 },
  ];

  const orderInsertValues = orderDefs.map((o) => {
    const customer = getCustomer(o.handle);
    return {
      businessId: config.BUSINESS_ID,
      customerId: customer.id,
      orderNo: o.orderNo,
      customerName: customer.name ?? o.handle,
      customerPhone: customer.handleOrPhone.startsWith("91") ? customer.handleOrPhone : undefined,
      channel: o.channel,
      status: o.status,
      subtotal: o.subtotal,
      deliveryCharge: o.deliveryCharge,
      discountAmount: "0",
      totalAmount: o.totalAmount,
      currency: "INR",
      shippingAddress: o.shippingAddress,
      courier: o.status !== "pending" && o.status !== "confirmed" ? "Shiprocket" : undefined,
      dispatchedAt: o.dispatchedAt ?? null,
      deliveredAt: o.deliveredAt ?? null,
      createdAt: daysAgo(o.daysCreated),
    };
  });

  await db.insert(orders).values(orderInsertValues).onConflictDoNothing();
  ordersInserted = orderInsertValues.length;

  // Query orders back to get real IDs
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.businessId, config.BUSINESS_ID));

  const orderByNo = new Map(allOrders.map((o) => [o.orderNo, o]));

  // ─── Order Items ────────────────────────────────────────────────────────────
  const orderItemValues = orderDefs.map((o, i) => {
    const order = orderByNo.get(o.orderNo);
    if (!order) return null;
    const product = productList[i % productList.length]!;
    const sizes = product.sizes as Array<{ name: string; price: number }>;
    const unitPrice = sizes.length > 0 ? String(sizes[0]!.price) : o.subtotal;
    const quantity = i % 3 === 0 ? 2 : 1;
    return {
      orderId: order.id,
      productId: product.id,
      productName: product.name,
      productDescription: product.description ?? undefined,
      quantity,
      unitPrice,
      customizations: i % 4 === 0 ? { color: "blue", name: "Custom" } : {},
      createdAt: daysAgo(o.daysCreated),
    };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  await db.insert(orderItems).values(orderItemValues).onConflictDoNothing();
  orderItemsInserted = orderItemValues.length;

  // ─── Payments ───────────────────────────────────────────────────────────────
  // 7 advance payments for non-pending, non-cancelled orders
  const payableOrderNos = ["ORD-DA-001", "ORD-DA-002", "ORD-DA-003", "ORD-DA-004", "ORD-DA-005", "ORD-DA-006", "ORD-DA-007"];
  const paymentInsertValues = payableOrderNos.map((orderNo, i) => {
    const order = orderByNo.get(orderNo);
    if (!order) return null;
    const orderDef = orderDefs.find((o) => o.orderNo === orderNo)!;
    const subtotalNum = parseFloat(orderDef.subtotal);
    const advanceAmount = Math.round(subtotalNum * 0.5);
    return {
      id: mkId(),
      businessId: config.BUSINESS_ID,
      orderId: order.id,
      kind: "advance" as const,
      amount: advanceAmount,
      status: "paid" as const,
      method: i % 2 === 0 ? "UPI" : "Google Pay",
      reference: `UPI${nanoid(8).toUpperCase()}`,
      paidAt: daysAgo(orderDef.daysCreated - 1),
      recordedByUserId: admin!.id,
      createdAt: daysAgo(orderDef.daysCreated),
    };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  await db.insert(payments).values(paymentInsertValues).onConflictDoNothing();
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("Demo analytics seed complete:", {
  customers: 12,
  conversations: 12,
  messages: messagesInserted,
  escalations: 10,
  orders: ordersInserted,
  orderItems: orderItemsInserted,
  payments: ordersInserted > 0 ? 7 : 0,
});

await sql.end();
