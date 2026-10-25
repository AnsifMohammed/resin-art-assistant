// Fills the dashboard with realistic, REMOVABLE demo data for the business in
// config.BUSINESS_ID (Saba Art, Coimbatore): customers, conversations, messages,
// AI decisions, escalations, orders + items, payments, broadcasts + recipients,
// message templates (for the broadcasts) and audit log entries.
//
// Usage (from backend/):
//   npm run db:seed-demo -- --dry-run   # read-only: prints what would be inserted
//   npm run db:seed-demo                # inserts everything in one transaction
//   npm run db:clear-demo               # removes it all again
//
// Tagging: every inserted row has an id starting with "seeddemo_"; clear-demo.ts
// deletes those rows plus anything that references them.
//
// Idempotency: if ANY seeddemo_ row already exists the script stops without
// writing and asks you to run `npm run db:clear-demo` first. It never clears on
// its own and never inserts a second copy.
//
// Uses existing rows read at runtime: the business, its WhatsApp/Instagram
// channels (a seeddemo channel is created only if one is missing), its admin and
// staff users, and its active products. Order numbers continue the business's
// SA-#### sequence the same way POST /orders computes it (highest number + 1).
//
// Safety: open escalations are all >3h old with reminded_at set, so the 2-hour
// reminder job does not send alerts for them. The one "scheduled" broadcast is
// 6 days out and has its audience pre-snapshotted to demo customers only, so if
// it ever fires it cannot reach real customers. Run db:clear-demo before then.
import { and, eq, sql as dsql } from "drizzle-orm";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";
import { config } from "../config.ts";
import { extractVariables, renderTemplate } from "../lib/templates.ts";
import { db, sql } from "./index.ts";
import {
  aiDecisions,
  businesses,
  auditLog,
  broadcastRecipients,
  broadcasts,
  channels,
  conversations,
  customers,
  escalations,
  messages,
  messageTemplates,
  orderItems,
  orders,
  payments,
  products,
  users,
  type escalationReasonEnum,
  type convTagEnum,
  type convStateEnum,
  type BroadcastFilters,
} from "./schema.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const PREFIX = "seeddemo_";
const CHUNK = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelType = "whatsapp" | "instagram";
type ConvTag = (typeof convTagEnum.enumValues)[number];
type ConvState = (typeof convStateEnum.enumValues)[number];
type EscReason = (typeof escalationReasonEnum.enumValues)[number];
type Intent =
  | "price" | "delivery" | "care" | "custom_order"
  | "payment" | "complaint" | "refund" | "unknown" | "off_topic";
type OrderStatus = "pending" | "confirmed" | "in_production" | "ready" | "dispatched" | "delivered" | "cancelled";
type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

type ChannelRow = typeof channels.$inferInsert;
type TemplateRow = typeof messageTemplates.$inferInsert;
type CustomerRow = typeof customers.$inferInsert & { id: string; createdAt: Date };
type ConversationRow = typeof conversations.$inferInsert & { id: string };
type MessageRow = typeof messages.$inferInsert & { id: string; createdAt: Date };
type AiDecisionRow = typeof aiDecisions.$inferInsert;
type EscalationRow = typeof escalations.$inferInsert & { id: string; createdAt: Date };
type OrderRow = typeof orders.$inferInsert & { id: string; createdAt: Date };
type OrderItemRow = typeof orderItems.$inferInsert;
type PaymentRow = typeof payments.$inferInsert & { id: string };
type BroadcastRow = typeof broadcasts.$inferInsert & { id: string };
type RecipientRow = typeof broadcastRecipients.$inferInsert;
type AuditRow = typeof auditLog.$inferInsert & { createdAt: Date };

interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  lead: number;
  customOptions: string[];
}

interface Ctx {
  businessId: string;
  channelIds: Record<ChannelType, string>;
  newChannels: ChannelRow[];
  adminId: string;
  staffIds: string[];
  products: Product[];
  templateNames: Set<string>;
  firstOrderNo: number;
}

// ─── Deterministic randomness + ids ───────────────────────────────────────────

let prngState = 20261024;
function rnd(): number {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const chance = (p: number) => rnd() < p;
function pick<T>(arr: readonly T[]): T {
  const v = arr[Math.floor(rnd() * arr.length)];
  if (v === undefined) throw new Error("pick() from an empty list");
  return v;
}
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 14);
const sid = () => PREFIX + nano();

// ─── Time helpers (timestamps are stored as UTC; "daytime" means IST) ─────────

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST = 330 * MIN;
const NOW = Date.now();
const IST_MIDNIGHT_TODAY = Math.floor((NOW + IST) / DAY) * DAY - IST;

/** A moment `daysAgo` IST days back at `hour` (IST, fractional). */
const istAt = (daysAgo: number, hour: number) => IST_MIDNIGHT_TODAY - daysAgo * DAY + hour * HOUR;
/** Never in the future. */
const past = (ms: number, margin = 2 * MIN) => Math.min(ms, NOW - margin);
/** Move a moment that falls outside 9:30-21:00 IST into studio hours (same or next morning). */
function daytime(ms: number): number {
  const hour = (((ms + IST) % DAY) + DAY) % DAY / HOUR;
  if (hour < 9.5) return ms + (9.5 - hour) * HOUR + between(0, 90) * MIN;
  if (hour > 21) return ms + (24 - hour + 9.75) * HOUR + between(0, 90) * MIN;
  return ms;
}
const istDate = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const D = (ms: number) => new Date(Math.round(ms));

// ─── Money / text helpers ─────────────────────────────────────────────────────

const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const money = (n: number) => n.toFixed(2);
const roundTo10 = (n: number) => Math.round(n / 10) * 10;
const human = (s: string) => s.replace(/_/g, " ");
function humanList(items: string[]): string {
  const h = items.map(human);
  if (h.length <= 1) return h.join("");
  return `${h.slice(0, -1).join(", ")} and ${h[h.length - 1]}`;
}

// ─── Static demo content ──────────────────────────────────────────────────────

const TN_CITIES = new Set(["Tiruppur", "Pollachi", "Erode", "Salem", "Chennai", "Madurai", "Trichy", "Ooty"]);

function zone(city: string) {
  if (city === "Coimbatore") return { days: "1-2", shipDays: 1, charge: 0 };
  if (TN_CITIES.has(city)) return { days: "2-4", shipDays: 3, charge: 60 };
  return { days: "5-7", shipDays: 6, charge: 120 };
}

const ADDRESSES: Record<string, Array<[string, string]>> = {
  Coimbatore: [
    ["RS Puram", "641002"], ["Saibaba Colony", "641011"], ["Peelamedu", "641004"], ["Race Course", "641018"],
    ["Gandhipuram", "641012"], ["Singanallur", "641005"], ["Vadavalli", "641041"], ["Saravanampatti", "641035"],
  ],
  Chennai: [["Anna Nagar", "600040"], ["Adyar", "600020"], ["Velachery", "600042"], ["T Nagar", "600017"]],
  Bangalore: [["Indiranagar", "560038"], ["HSR Layout", "560102"], ["Koramangala", "560034"]],
  Tiruppur: [["Avinashi Road", "641603"]],
  Pollachi: [["Mahalingapuram", "642002"]],
  Erode: [["Perundurai Road", "638011"]],
  Salem: [["Fairlands", "636016"]],
  Madurai: [["KK Nagar", "625020"]],
  Trichy: [["Thillai Nagar", "620018"]],
  Ooty: [["Fern Hill", "643004"]],
  Kochi: [["Kakkanad", "682030"], ["Panampilly Nagar", "682036"]],
  Hyderabad: [["Gachibowli", "500032"]],
};
const STREETS = ["2nd Cross Street", "Lakshmi Nagar", "Bharathi Street", "Kamaraj Road", "Gandhi Road", "Nehru Street", "VOC Street", "Main Road"];
function address(city: string): string {
  const [area, pin] = pick(ADDRESSES[city] ?? [["Main Road", "641001"]]);
  return `No. ${int(3, 148)}, ${pick(STREETS)}, ${area}, ${city} - ${pin}`;
}

/** [name, instagram handle (null = WhatsApp), city, language, plan] */
type Plan = "auto" | "escalated" | "owner_esc" | "owner_direct" | "resolved" | "paused" | "old";
const CUSTOMERS: ReadonlyArray<readonly [string, string | null, string, "english" | "tamil", Plan]> = [
  // WhatsApp (0-26)
  ["Kavya Ramesh", null, "Coimbatore", "english", "auto"],
  ["Arun Kumar", null, "Coimbatore", "tamil", "escalated"],
  ["Divya Subramaniam", null, "Chennai", "english", "auto"],
  ["Karthik Rajan", null, "Tiruppur", "tamil", "resolved"],
  ["Meena Sundaram", null, "Coimbatore", "tamil", "owner_esc"],
  ["Priyanka Venkatesh", null, "Bangalore", "english", "auto"],
  ["Sathish Murugan", null, "Erode", "tamil", "escalated"],
  ["Lakshmi Narayanan", null, "Coimbatore", "english", "old"],
  ["Deepa Krishnan", null, "Coimbatore", "english", "auto"],
  ["Vignesh Balaji", null, "Salem", "english", "escalated"],
  ["Anitha Senthil", null, "Pollachi", "tamil", "auto"],
  ["Gokul Prasad", null, "Coimbatore", "english", "paused"],
  ["Revathi Chandran", null, "Madurai", "tamil", "resolved"],
  ["Harini Mohan", null, "Coimbatore", "english", "auto"],
  ["Saravanan P", null, "Coimbatore", "tamil", "old"],
  ["Nithya Raghavan", null, "Chennai", "english", "owner_direct"],
  ["Ramya Selvam", null, "Coimbatore", "tamil", "auto"],
  ["Bharath Shankar", null, "Hyderabad", "english", "escalated"],
  ["Keerthana Iyer", null, "Coimbatore", "english", "auto"],
  ["Sowmya Rajendran", null, "Trichy", "tamil", "resolved"],
  ["Prakash Annamalai", null, "Coimbatore", "tamil", "old"],
  ["Janani Ganesh", null, "Coimbatore", "english", "auto"],
  ["Dinesh Palanisamy", null, "Tiruppur", "tamil", "escalated"],
  ["Gayathri Ravi", null, "Ooty", "english", "auto"],
  ["Madhumitha K", null, "Coimbatore", "english", "auto"],
  ["Suresh Kannan", null, "Chennai", "english", "owner_esc"],
  ["Vidhya Natarajan", null, "Coimbatore", "tamil", "auto"],
  // Instagram (27-44)
  ["Kaviya Thangaraj", "kavi.crafts", "Coimbatore", "english", "auto"],
  ["Shruthi Varadarajan", "shruthi_designs", "Chennai", "english", "escalated"],
  ["Nandhini Arul", "the.gift.box.cbe", "Coimbatore", "english", "auto"],
  ["Aishwarya Mani", "aishu_artsy", "Bangalore", "english", "auto"],
  ["Vinoth Kumar", "vinoth.clicks", "Coimbatore", "tamil", "resolved"],
  ["Pooja Raghavan", "pooja.weds.raghav", "Chennai", "english", "auto"],
  ["Swetha Prabhu", "swetha_homedecor", "Kochi", "english", "escalated"],
  ["Hariharan K", "hari.k.makes", "Coimbatore", "english", "paused"],
  ["Nila Sekar", "nila.reads", "Madurai", "tamil", "auto"],
  ["Abinaya Rajkumar", "abi_thoughtfulgifts", "Coimbatore", "english", "auto"],
  ["Sandhya Mohan", "chennai.bride.diaries", "Chennai", "english", "owner_direct"],
  ["Rithika Sankar", "rithu.rangoli", "Coimbatore", "tamil", "auto"],
  ["Sneha Reddy", "blr.plantmom", "Bangalore", "english", "escalated"],
  ["Mithun Das", "mithun_photography", "Coimbatore", "english", "old"],
  ["Yazhini Elango", "yazhini.crafts", "Erode", "tamil", "resolved"],
  ["Anusha Arjun", "arjun.and.anu", "Coimbatore", "english", "auto"],
  ["Fathima Nazeer", "kochi.cafe.hopper", "Kochi", "english", "auto"],
  ["Tharun Kumar", "tharun.tk", "Coimbatore", "tamil", "auto"],
];

/** Day (IST days ago) each conversation was last active. */
/** Customers with orders follow their latest order's timeline instead (see autoSteps). */
const ACTIVE_DAY: Record<number, number> = {
  8: 0, 10: 6, 16: 15, 18: 0, 23: 11, 24: 27, 26: 2, 42: 35,
  1: 1, 6: 9, 9: 2, 17: 0, 28: 7, 33: 1, 39: 6, 25: 2, 15: 0, 37: 1,
  3: 2, 12: 5, 19: 10, 31: 11, 41: 38, 11: 3, 34: 1,
};
/** Customers whose row is created with their first message (the "new" segment, < 14 days). */
const NEW_CUSTOMERS = new Set([1, 8, 15, 17, 18, 21, 22, 26, 36, 38, 39, 44]);
const FAVOURITES = new Set([0, 7, 8, 13, 27, 29, 36]);
const PRIORITY = new Set([4, 13, 29, 32, 37]);
/** index -> opt-out source */
const OPTED_OUT: Record<number, "keyword" | "admin"> = { 16: "keyword", 24: "admin", 42: "admin" };
const NOTES: Record<number, string> = {
  0: "Loves pastel colours. Orders gifts for every family function.",
  13: "Interior designer; refers clients. Give priority slots.",
  29: "Runs a gifting store in Coimbatore. Bulk buyer.",
  32: "Wedding on 14 Nov. Varmala preservation frame.",
  37: "Wedding blogger, 40k followers. Collab enquiry.",
  4: "Prefers calls after 6 PM.",
};

interface OrderSpec {
  cust: number;
  status: OrderStatus;
  days: number;
  items: Array<[slug: string, qty: number, customizations?: Record<string, string>]>;
  custom?: Array<[name: string, description: string, price: number, qty: number]>;
  discountPct?: number;
  discountFlat?: number;
  pickup?: boolean;
  overdueDays?: number;
  dueInDays?: number;
  advancePending?: boolean;
  balancePending?: boolean;
  paidInFull?: boolean;
  cashOnPickup?: boolean;
  noPayments?: boolean;
  voidAdvance?: boolean;
  duplicateVoid?: boolean;
  customerNotes?: string;
  internalNotes?: string;
}

const ORDER_SPECS: OrderSpec[] = [
  // pending
  { cust: 21, status: "pending", days: 0, items: [["keychain-set-3", 2, { names: "Aadhya, Ishaan", colour: "lavender" }]], noPayments: true },
  { cust: 22, status: "pending", days: 1, items: [["resin-clock-12in", 1, { theme: "dried flowers", name: "Palanisamy Family" }]], advancePending: true },
  { cust: 38, status: "pending", days: 0, items: [["bookmarks-set-4", 2, { flowers: "pressed rose" }]], advancePending: true },
  // confirmed
  { cust: 0, status: "confirmed", days: 2, items: [["ocean-coaster-set-4", 2, { colour: "teal and gold" }]], customerNotes: "Gift wrap both sets separately please" },
  { cust: 29, status: "confirmed", days: 3, items: [["keychain-set-3", 12, { names: "Team names list on WhatsApp" }]], discountPct: 10, customerNotes: "Diwali gifts for office team", dueInDays: 4 },
  { cust: 44, status: "confirmed", days: 1, items: [["photo-frame-5x7", 1, { colour: "white and gold" }]] },
  // in_production
  { cust: 1, status: "in_production", days: 9, items: [["resin-tray-large", 1, { colour: "ocean blue", gold_foil: "yes" }]], paidInFull: true, overdueDays: 1 },
  { cust: 13, status: "in_production", days: 4, items: [["resin-clock-12in", 1, { theme: "geode" }], ["keychain-set-3", 1]], dueInDays: 3 },
  { cust: 32, status: "in_production", days: 6, items: [["bookmarks-set-4", 1]], custom: [["Varmala Preservation Frame (18x24 in)", "Wedding garland flowers preserved in resin, with names and date", 6500, 1]], customerNotes: "Wedding date 14 Nov, names: Pooja & Raghav" },
  { cust: 27, status: "in_production", days: 5, items: [["ocean-coaster-set-4", 1], ["photo-frame-5x7", 1, { colour: "sage green" }]] },
  // ready
  { cust: 8, status: "ready", days: 7, items: [["resin-tray-large", 1, { dried_flowers: "yes" }]], dueInDays: 2 },
  { cust: 36, status: "ready", days: 8, items: [["keychain-set-3", 3, { shape: "heart" }]], pickup: true },
  { cust: 2, status: "ready", days: 10, items: [["resin-clock-12in", 1, { name: "Subramaniam Illam" }]], overdueDays: 2 },
  // dispatched
  { cust: 5, status: "dispatched", days: 9, items: [["ocean-coaster-set-4", 1], ["bookmarks-set-4", 1]], duplicateVoid: true },
  { cust: 30, status: "dispatched", days: 11, items: [["photo-frame-5x7", 2]] },
  { cust: 43, status: "dispatched", days: 8, items: [["resin-tray-large", 1]] },
  { cust: 25, status: "dispatched", days: 12, items: [["resin-clock-12in", 1, { colour: "black and gold" }]], balancePending: true },
  // delivered
  { cust: 0, status: "delivered", days: 18, items: [["resin-clock-12in", 1, { name: "Ramesh & Latha", theme: "anniversary" }]] },
  { cust: 13, status: "delivered", days: 22, items: [["ocean-coaster-set-4", 2]], discountFlat: 100 },
  { cust: 28, status: "delivered", days: 16, items: [["ocean-coaster-set-4", 1]] },
  { cust: 33, status: "delivered", days: 14, items: [["resin-tray-large", 1]] },
  { cust: 2, status: "delivered", days: 26, items: [["keychain-set-3", 2], ["bookmarks-set-4", 2]] },
  { cust: 27, status: "delivered", days: 24, items: [], custom: [["Resin House Name Plate (12 inch)", "Round name plate, 'Thangaraj Illam', Tamil + English", 1500, 1]], pickup: true, cashOnPickup: true },
  { cust: 35, status: "delivered", days: 13, items: [["bookmarks-set-4", 3]] },
  { cust: 0, status: "delivered", days: 33, items: [["resin-tray-large", 1], ["ocean-coaster-set-4", 1]] },
  { cust: 29, status: "delivered", days: 38, items: [["keychain-set-3", 20]], discountPct: 10 },
  { cust: 23, status: "delivered", days: 44, items: [["ocean-coaster-set-4", 1], ["keychain-set-3", 1]] },
  { cust: 42, status: "delivered", days: 52, items: [["resin-clock-12in", 1, { name: "Arjun & Anu" }]] },
  // cancelled
  { cust: 19, status: "cancelled", days: 10, items: [["resin-clock-12in", 1]], voidAdvance: true, internalNotes: "Cancelled within 24h at customer's request. Advance refunded via GPay." },
  { cust: 10, status: "cancelled", days: 5, items: [["photo-frame-5x7", 1]], noPayments: true, internalNotes: "Cancelled: customer changed her mind before paying the advance." },
  // old buyers (inactive segment: last order > 90 days)
  { cust: 7, status: "delivered", days: 140, items: [["resin-clock-12in", 1]] },
  { cust: 14, status: "delivered", days: 120, items: [["ocean-coaster-set-4", 2]] },
  { cust: 20, status: "delivered", days: 165, items: [["resin-tray-large", 1]] },
  { cust: 40, status: "delivered", days: 110, items: [["photo-frame-5x7", 3]] },
];

// ─── Output buffers ───────────────────────────────────────────────────────────

const out = {
  channels: [] as ChannelRow[],
  messageTemplates: [] as TemplateRow[],
  customers: [] as CustomerRow[],
  conversations: [] as ConversationRow[],
  messages: [] as MessageRow[],
  aiDecisions: [] as AiDecisionRow[],
  escalations: [] as EscalationRow[],
  orders: [] as OrderRow[],
  orderItems: [] as OrderItemRow[],
  payments: [] as PaymentRow[],
  broadcasts: [] as BroadcastRow[],
  broadcastRecipients: [] as RecipientRow[],
  auditLog: [] as AuditRow[],
};

// ─── Context (read-only queries) ──────────────────────────────────────────────

const ORDER_NO_BASE = 1047; // same floor as POST /orders

function nextOrderNumber(orderNos: string[]): number {
  let max = ORDER_NO_BASE;
  for (const no of orderNos) {
    const m = no.match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

async function existingDemoRows(): Promise<number> {
  const tables = [
    "channels", "message_templates", "customers", "conversations", "messages", "ai_decisions",
    "escalations", "orders", "order_items", "payments", "broadcasts", "broadcast_recipients", "audit_log",
  ];
  const list = tables.map((t) => `(select count(*)::int from ${t} where id like 'seeddemo\\_%' escape '\\')`).join(" + ");
  const rows = await db.execute(dsql.raw(`select ${list} as n`));
  return Number((rows[0] as { n?: unknown } | undefined)?.n ?? 0);
}

async function loadContext(): Promise<Ctx | null> {
  const businessId = config.BUSINESS_ID;
  const [bizRows, channelRows, userRows, productRows, templateRows, orderNoRows, demoCount] = await Promise.all([
    db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)),
    db.select().from(channels).where(eq(channels.businessId, businessId)),
    db.select({ id: users.id, role: users.role, active: users.active, name: users.name }).from(users).where(eq(users.businessId, businessId)),
    db.select().from(products).where(and(eq(products.businessId, businessId), eq(products.isActive, true))),
    db.select({ name: messageTemplates.name }).from(messageTemplates).where(eq(messageTemplates.businessId, businessId)),
    db.select({ orderNo: orders.orderNo }).from(orders).where(eq(orders.businessId, businessId)),
    existingDemoRows(),
  ]);

  const biz = bizRows[0];
  if (!biz) {
    console.error(`Business ${businessId} not found. Run \`npm run db:seed\` first.`);
    return null;
  }
  if (demoCount > 0) {
    console.error(
      `Found ${demoCount} existing seeddemo_ rows. Run \`npm run db:clear-demo\` first, then re-run this script.`,
    );
    return null;
  }

  const admin = userRows.find((u) => u.role === "admin" && u.active);
  if (!admin) {
    console.error(`No active admin user for business ${businessId}. Run \`npm run db:seed\` first.`);
    return null;
  }
  const staffIds = userRows.filter((u) => u.role === "staff" && u.active).map((u) => u.id);

  const prods: Product[] = productRows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: Math.round(Number(p.sizes[0]?.price ?? 0)),
      lead: p.leadTimeDays,
      customOptions: p.customOptions ?? [],
    }))
    .filter((p) => p.price > 0);
  if (prods.length === 0) {
    console.error("No active products with a price. Add products (or run `npm run db:seed`) first.");
    return null;
  }

  const channelIds = {} as Record<ChannelType, string>;
  const newChannels: ChannelRow[] = [];
  for (const type of ["whatsapp", "instagram"] as const) {
    const existing = channelRows.find((c) => c.type === type && c.status === "active") ?? channelRows.find((c) => c.type === type);
    if (existing) {
      channelIds[type] = existing.id;
    } else {
      const id = sid();
      channelIds[type] = id;
      newChannels.push({ id, businessId, type, identifier: `seeddemo-${type}-${businessId}`, status: "active" });
    }
  }

  console.log(`Business: ${biz.name} (${businessId})`);
  console.log(`Admin: ${admin.name} (${admin.id}); staff: ${staffIds.length}; active products: ${prods.length}`);
  console.log(
    `Channels: whatsapp=${channelIds.whatsapp}, instagram=${channelIds.instagram}` +
      (newChannels.length ? ` (creating ${newChannels.map((c) => c.type).join(", ")})` : ""),
  );

  return {
    businessId,
    channelIds,
    newChannels,
    adminId: admin.id,
    staffIds,
    products: prods,
    templateNames: new Set(templateRows.map((t) => t.name)),
    firstOrderNo: nextOrderNumber(orderNoRows.map((r) => r.orderNo)),
  };
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function build(ctx: Ctx) {
  const { businessId, adminId } = ctx;
  const staffId = ctx.staffIds[0] ?? null;

  const prodBySlug = new Map(ctx.products.map((p) => [p.slug, p]));
  const P = (slug: string): Product => prodBySlug.get(slug) ?? ctx.products[slug.length % ctx.products.length]!;

  const audit = (row: Omit<AuditRow, "id" | "businessId">) => {
    out.auditLog.push({ id: sid(), businessId, ...row });
  };

  out.channels.push(...ctx.newChannels);

  // ── Customers (createdAt finalised once all their activity is known) ──────
  const custRows: CustomerRow[] = CUSTOMERS.map(([name, handle, city, language], i) => {
    const type: ChannelType = handle ? "instagram" : "whatsapp";
    return {
      id: sid(),
      businessId,
      channelId: ctx.channelIds[type],
      name,
      handleOrPhone: handle ?? `91${pick(["9", "8", "7", "6"])}${digits(9)}`,
      language,
      city,
      notes: NOTES[i] ?? null,
      isFavourite: FAVOURITES.has(i),
      isPriority: PRIORITY.has(i),
      optedOut: false,
      createdAt: new Date(NOW),
    };
  });
  const custType = (i: number): ChannelType => (CUSTOMERS[i]![1] ? "instagram" : "whatsapp");
  const earliest = new Map<number, number>();
  const latest = new Map<number, number>();
  const touch = (i: number, ms: number) => {
    earliest.set(i, Math.min(earliest.get(i) ?? Infinity, ms));
    latest.set(i, Math.max(latest.get(i) ?? -Infinity, ms));
  };

  // ── Order plans (timelines first, so conversations can line up with them) ──
  function orderTotals(spec: OrderSpec, city: string) {
    const lines = [
      ...spec.items.map(([slug, qty]) => P(slug).price * qty),
      ...(spec.custom ?? []).map(([, , price, qty]) => price * qty),
    ];
    const subtotal = lines.reduce((a, b) => a + b, 0);
    const delivery = spec.pickup ? 0 : zone(city).charge;
    const discount = spec.discountPct ? Math.round((subtotal * spec.discountPct) / 100) : (spec.discountFlat ?? 0);
    const total = Math.max(0, subtotal + delivery - discount);
    return { subtotal, delivery, discount, total, advance: roundTo10(total / 2) };
  }

  const FORWARD: readonly OrderStatus[] = ["confirmed", "in_production", "ready", "dispatched", "delivered"];
  const orderPlans = ORDER_SPECS.map((spec) => {
    const [custName, handle, city] = CUSTOMERS[spec.cust]!;
    const cust = custRows[spec.cust]!;
    const totals = orderTotals(spec, city);
    const createdAt = past(istAt(spec.days, between(11, 19.5)), 30 * MIN);
    const isCustom = spec.items.some(([, , c]) => c) || (spec.custom?.length ?? 0) > 0;
    const lead = Math.max(3, ...spec.items.map(([slug]) => P(slug).lead), spec.custom?.length ? 8 : 0) + (isCustom ? 2 : 0);
    const ship = spec.pickup ? 0 : zone(city).shipDays;

    // Status timeline (only the transitions this order actually reached)
    const path: OrderStatus[] =
      spec.status === "cancelled"
        ? (spec.voidAdvance ? ["confirmed", "cancelled"] : ["cancelled"])
        : FORWARD.slice(0, FORWARD.indexOf(spec.status) + 1);
    const ideal: Record<OrderStatus, number> = {
      pending: createdAt,
      confirmed: createdAt + between(1, 5) * HOUR,
      in_production: createdAt + between(16, 30) * HOUR,
      ready: createdAt + lead * DAY - between(2, 8) * HOUR,
      dispatched: createdAt + lead * DAY + between(4, 26) * HOUR,
      delivered: createdAt + (lead + Math.max(1, ship)) * DAY + between(2, 30) * HOUR,
      cancelled: createdAt + between(3, 20) * HOUR,
    };
    const times = path.map((s) => daytime(ideal[s]));
    // Squeeze into the past, keeping the order and >= 20 min between steps.
    let limit = NOW - 15 * MIN;
    for (let k = times.length - 1; k >= 0; k--) {
      times[k] = Math.min(times[k]!, limit);
      limit = times[k]! - 20 * MIN;
    }
    const when = (s: OrderStatus): number | null => {
      const k = path.indexOf(s);
      return k >= 0 ? times[k]! : null;
    };
    return { spec, custName, handle, city, cust, totals, createdAt, lead, ship, path, times, when };
  }).sort((a, b) => a.createdAt - b.createdAt);

  // ── Conversations ──────────────────────────────────────────────────────────
  type Step =
    | { k: "c"; text: string; gapMin?: number }
    | { k: "ai"; text: string; intent: Intent; facts: string[]; tag?: ConvTag }
    | { k: "esc"; reason: EscReason; intent: Intent; draft: string; missing?: string[]; assign?: boolean }
    | { k: "h"; who: "owner" | "staff"; text: string; gapMin?: number }
    | { k: "sys"; text: string; kind: string }
    | { k: "resolve"; gapMin?: number }
    | { k: "pause" }
    | { k: "gap"; hours: number };

  interface ConvPlan {
    steps: Step[];
    state: ConvState;
    tag: ConvTag | null;
    endDaysAgo: number;
    lastCustomerAgoH?: number;
    /** Pin step `idx` to time `ms` (used to line an order chat up with the order). */
    anchor?: { idx: number; ms: number };
    unread: boolean;
  }

  // Q&A building blocks
  const shortName = (p: Product) => p.name.replace(/^Resin /, "").toLowerCase();
  const askPrice = (p: Product, ta: boolean) =>
    ta
      ? pick([`${shortName(p)} evlo price?`, `Hi akka, ${shortName(p)} rate enna?`, `${p.name} price sollunga`])
      : pick([`Hi, how much is the ${p.name}?`, `Saw your reel 😍 What's the price of the ${shortName(p)}?`, `Price for ${p.name} pls`]);
  const priceReply = (p: Product) =>
    `Hi! 😊 The ${p.name} is ${rs(p.price)}.` +
    (p.customOptions.length ? ` We can customise the ${humanList(p.customOptions.slice(0, 3))}.` : "") +
    ` It takes about ${p.lead} days to make. Shall I send a few design photos?`;
  const askDelivery = (city: string, ta: boolean) =>
    ta
      ? pick([`${city} ku delivery panuveengala?`, `${city} la delivery evlo naal aagum?`])
      : pick([`Do you deliver to ${city}?`, `How many days for delivery to ${city}?`]);
  const deliveryReply = (city: string) => {
    const z = zone(city);
    return z.charge === 0
      ? "Yes! Within Coimbatore we deliver in 1-2 days, free of charge 🚚 You can also pick it up from our studio."
      : `Yes, we deliver to ${city}! 🚚 It takes ${z.days} days after dispatch and shipping is ${rs(z.charge)}.`;
  };
  const askCare = (ta: boolean) =>
    ta
      ? pick(["Epdi maintain pananum? Water la wash panalama?", "Veyil la vechaa colour pogumaa?"])
      : pick(["How do I clean it? Will it get scratches?", "Can I keep it near the window? Will the colour fade?"]);
  const CARE_REPLY =
    "Easy! Keep it away from direct sunlight and heat, wipe with a soft dry cloth and don't soak it in water. It'll stay glossy for years 🌸";
  const askCustomName = (p: Product, ta: boolean) =>
    ta
      ? `Name potu ${shortName(p)} panna mudiyuma? En ponnu ku gift`
      : pick([`Can you add my daughter's name on the ${shortName(p)}?`, `Can I get the ${shortName(p)} in blue and gold with a name on it?`]);
  const customNameReply = (p: Product) =>
    `Of course! 💛 The ${p.name} is ${rs(p.price)} with the name included. Which colours do you like? I'll share a few options.`;
  const askBeforeDiwali = (ta: boolean) =>
    ta ? "Inniki order panna Diwali ku munnadi kidaikuma?" : "If I order today, will it reach before Diwali?";
  const diwaliReply = (p: Product, city: string) =>
    `Yes, if you confirm in the next 2-3 days ✨ The ${p.name} takes about ${p.lead} days to make, plus ${zone(city).days} days for delivery to ${city}.`;

  function autoSteps(i: number): { steps: Step[]; tag: ConvTag; anchor?: { idx: number; ms: number } } {
    const [, , city, lang] = CUSTOMERS[i]!;
    const ta = lang === "tamil";
    const latestPlan = orderPlans.filter((o) => o.spec.cust === i).sort((a, b) => b.createdAt - a.createdAt)[0];
    const latestOrder = latestPlan?.spec;
    let anchor: { idx: number; ms: number } | undefined;
    const p = latestOrder?.items[0] ? P(latestOrder.items[0][0]) : pick(ctx.products);
    const steps: Step[] = [];

    if (latestOrder?.items.some(([, , c]) => c) && chance(0.6)) {
      steps.push({ k: "c", text: askCustomName(p, ta) });
      steps.push({ k: "ai", text: customNameReply(p), intent: "custom_order", facts: [`product:${p.slug}.price`, `product:${p.slug}.custom_options`], tag: "custom_order" });
    } else if (p.slug === "keychain-set-3" && latestOrder && latestOrder.items[0]![1] >= 10) {
      const qty = latestOrder.items[0]![1];
      steps.push({ k: "c", text: `Need ${qty} keychain sets as Diwali return gifts for my office team. Any discount?` });
      steps.push({
        k: "ai",
        text: `Yes! 🪔 For 10 or more pieces we give 10% off, so ${qty} × ${rs(p.price)} comes to ${rs(qty * p.price * 0.9)}. It takes about ${p.lead + 2} days, so order this week to get them before Diwali.`,
        intent: "custom_order",
        facts: ["custom_orders.bulk_discount", `product:${p.slug}.price`],
        tag: "custom_order",
      });
    } else {
      steps.push({ k: "c", text: askPrice(p, ta) });
      steps.push({ k: "ai", text: priceReply(p), intent: "price", facts: [`product:${p.slug}.price`, `product:${p.slug}.lead_time_days`], tag: "new_lead" });
    }
    if (chance(0.75)) {
      steps.push({ k: "c", text: askDelivery(city, ta) });
      steps.push({ k: "ai", text: deliveryReply(city), intent: "delivery", facts: ["delivery.zones"] });
    }
    if (chance(0.3)) {
      steps.push({ k: "c", text: askCare(ta) });
      steps.push({ k: "ai", text: CARE_REPLY, intent: "care", facts: ["policies.care"] });
    }
    if (!latestOrder && chance(0.4)) {
      steps.push({ k: "c", text: askBeforeDiwali(ta) });
      steps.push({ k: "ai", text: diwaliReply(p, city), intent: "delivery", facts: [`product:${p.slug}.lead_time_days`, "delivery.zones"] });
    }
    let tag: ConvTag = steps.some((s) => s.k === "ai" && s.tag === "custom_order") ? "custom_order" : chance(0.35) ? "follow_up" : "new_lead";
    if (latestPlan && latestOrder && latestOrder.status !== "cancelled") {
      const t = latestPlan.totals;
      // The "please book it" message lands a few minutes before the order was created.
      anchor = { idx: steps.length, ms: latestPlan.createdAt - between(8, 40) * MIN };
      steps.push({
        k: "c",
        text: ta ? "Ok super, book pannunga. Advance ippo anupuren 🙏" : pick(["Ok lovely, please book it. I'll pay the advance now", "Perfect, let's go ahead with the order!"]),
      });
      steps.push({
        k: "ai",
        text: `Lovely, thank you! 💛 Your total is ${rs(t.total)}. Please pay a 50% advance of ${rs(t.advance)} on GPay/UPI to confirm, and the balance before dispatch.`,
        intent: "custom_order",
        facts: ["payment.advance_percent", "payment.methods"],
        tag: "payment_pending",
      });
      tag = latestOrder.status === "pending" ? "payment_pending" : latestOrder.status === "delivered" ? "follow_up" : "order_confirmed";
      const deliveredAt = latestPlan.when("delivered");
      if (deliveredAt) {
        // Thank-you message a few hours after delivery (gap measured from the AI reply ~1 min after the anchor).
        steps.push({ k: "gap", hours: Math.max(2, (daytime(deliveredAt + between(2, 8) * HOUR) - anchor.ms) / HOUR) });
        steps.push({ k: "c", text: ta ? "Parcel vandhuduchu, romba azhaga irukku!! 😍 Thank you" : "Got the parcel today, it's so pretty!! 😍 Thank you" });
        steps.push({
          k: "ai",
          text: "Yay, so happy you loved it! 🥰 Do share a photo if you can. Tip: keep it away from direct sunlight so the colours stay bright.",
          intent: "care",
          facts: ["policies.care"],
          tag: "follow_up",
        });
      }
    } else if (latestOrder?.status === "cancelled") {
      tag = "follow_up";
    }
    return anchor ? { steps, tag, anchor } : { steps, tag };
  }

  /** Hand-written threads for the escalation / owner / paused conversations. */
  function scriptedSteps(i: number): { steps: Step[]; tag: ConvTag | null } | null {
    const [name, , city] = CUSTOMERS[i]!;
    const first = name.split(" ")[0]!;
    const clock = P("resin-clock-12in");
    const tray = P("resin-tray-large");
    const coaster = P("ocean-coaster-set-4");
    const keychain = P("keychain-set-3");
    const SORRY = "I'm so sorry about this. I've passed it to our team and someone will get back to you very shortly 🙏";
    switch (i) {
      case 1: return { tag: "order_confirmed", steps: [
        { k: "c", text: "Tray order status enna? Gold foil design" },
        { k: "ai", text: `Hi ${first}! Your ${tray.name} is being made right now ✨ We'll message you as soon as it's ready.`, intent: "delivery", facts: ["order.status"] },
        { k: "gap", hours: 24 },
        { k: "c", text: "I paid already, where is my order? It was supposed to come yesterday" },
        { k: "esc", reason: "always_escalate_phrase", intent: "delivery", draft: SORRY },
        { k: "c", text: "Hello? Please update", gapMin: 95 },
      ] };
      case 6: return { tag: "custom_order", steps: [
        { k: "c", text: "Vanakkam. Do you make resin tables?" },
        { k: "ai", text: "Vanakkam! 😊 We make coasters, trays, clocks, frames, keychains and bookmarks, and we customise all of them. Could you tell me what you have in mind?", intent: "custom_order", facts: ["products"] },
        { k: "c", text: "How much for a 6 feet resin dining table with river design? Teak wood" },
        { k: "esc", reason: "missing_facts", intent: "price", draft: "That sounds stunning! Let me check with our artist on a 6 ft table and get back to you with a quote.", missing: ["product:6ft river dining table.price", "lead_time"] },
      ] };
      case 9: return { tag: "order_confirmed", steps: [
        { k: "c", text: `Hi, I ordered a ${clock.name} 2 weeks back. Any update?` },
        { k: "ai", text: "Hi! Let me check on that for you.", intent: "delivery", facts: [] },
        { k: "c", text: "It's been 14 days and still no update. Very disappointed, this was for my parents' anniversary." },
        { k: "esc", reason: "intent_complaint", intent: "complaint", draft: SORRY, assign: true },
      ] };
      case 17: return { tag: "new_lead", steps: [
        { k: "c", text: "Hi! Do you conduct resin art workshops for kids? Summer batch maybe" },
        { k: "esc", reason: "intent_unknown", intent: "unknown", draft: "Great question! Let me check with Saba and get back to you on workshops." },
      ] };
      case 22: return { tag: "payment_pending", steps: [
        { k: "c", text: `${clock.name} with dried flowers and family name, evlo?` },
        { k: "ai", text: `Hi! 😊 The ${clock.name} is ${rs(clock.price)} with dried flowers and your family name. It takes about ${clock.lead + 2} days for a custom piece.`, intent: "custom_order", facts: [`product:${clock.slug}.price`, "custom_orders.lead_time_extra_days"], tag: "custom_order" },
        { k: "c", text: "Ok book pannunga" },
        { k: "ai", text: `Lovely! 💛 Please pay a 50% advance of ${rs(roundTo10((clock.price + 60) / 2))} on GPay/UPI to confirm your slot.`, intent: "custom_order", facts: ["payment.advance_percent"], tag: "payment_pending" },
        { k: "c", text: "Sent money on GPay just now, screenshot attached. Please confirm", gapMin: 45 },
        { k: "esc", reason: "payment_claim", intent: "payment", draft: "Thank you! Our team will verify the payment and confirm shortly 🙏" },
      ] };
      case 28: return { tag: "follow_up", steps: [
        { k: "c", text: "Hi, I received the coaster set yesterday but one coaster has a crack across the middle 😞" },
        { k: "c", text: "I want a refund for this, it was a gift", gapMin: 2 },
        { k: "esc", reason: "intent_refund", intent: "refund", draft: SORRY, assign: true },
      ] };
      case 33: return { tag: "order_confirmed", steps: [
        { k: "c", text: `Tracking says delivered but I have not received my ${tray.name}` },
        { k: "esc", reason: "always_escalate_phrase", intent: "delivery", draft: SORRY, assign: true },
        { k: "c", text: "Checked with security also, nothing came", gapMin: 30 },
      ] };
      case 39: return { tag: "custom_order", steps: [
        { k: "c", text: `Hi! Price for the ${coaster.name}?` },
        { k: "ai", text: priceReply(coaster), intent: "price", facts: [`product:${coaster.slug}.price`], tag: "new_lead" },
        { k: "c", text: "We need 50 sets with our company logo printed, for a client event on Friday. Can you do it? What's the price?" },
        { k: "esc", reason: "missing_facts", intent: "custom_order", draft: "Let me check logo printing and the timeline with our team and get back to you today.", missing: ["logo printing", "rush lead time for 50 sets"] },
      ] };
      case 4: return { tag: "follow_up", steps: [
        { k: "c", text: "Clock vandhuduchu, but the colour is very different from the photo you sent. I asked for maroon, this looks brown" },
        { k: "esc", reason: "intent_complaint", intent: "complaint", draft: SORRY, assign: true },
        { k: "h", who: "staff", text: `Hi ${first} ma'am, Priya from Saba Art here. Really sorry about this! Could you send a photo in daylight? If it's off we'll redo it at no cost.`, gapMin: 25 },
        { k: "c", text: "Sent the photo now. Please check", gapMin: 40 },
      ] };
      case 25: return { tag: "payment_pending", steps: [
        { k: "c", text: "Hi, has my clock been dispatched?" },
        { k: "ai", text: "Hi! Your order is dispatched 🚚 You'll get the tracking ID on this chat.", intent: "delivery", facts: ["order.status"] },
        { k: "c", text: "Also I already paid the balance on PhonePe yesterday. Why is it still showing pending?" },
        { k: "esc", reason: "payment_claim", intent: "payment", draft: "Thanks for letting us know! Our team will verify and update it shortly.", assign: true },
        { k: "h", who: "staff", text: "Hi sir, I'm checking with our accounts team now. Could you share the PhonePe transaction ID?", gapMin: 35 },
        { k: "c", text: "T2610231845. Please update fast", gapMin: 20 },
      ] };
      case 15: return { tag: "custom_order", steps: [
        { k: "c", text: `Hi, how much is the ${tray.name}?` },
        { k: "ai", text: priceReply(tray), intent: "price", facts: [`product:${tray.slug}.price`], tag: "new_lead" },
        { k: "c", text: "Need 3 trays for my sister's housewarming in Chennai. Same design for all 3?" },
        { k: "ai", text: `Yes, we can do matching designs! 3 × ${rs(tray.price)} = ${rs(3 * tray.price)}, plus ${rs(zone(city).charge)} shipping to ${city}.`, intent: "custom_order", facts: [`product:${tray.slug}.price`, "delivery.zones"], tag: "custom_order" },
        { k: "h", who: "owner", text: `Hi ${first}! Saba here 😊 For 3 trays I can do ${rs(3 * tray.price - 300)} with free shipping. Shall I block the slot?`, gapMin: 18 },
        { k: "c", text: "Oh that's sweet, thank you! Yes please", gapMin: 12 },
        { k: "h", who: "owner", text: "Done! Will share colour options by evening ✨", gapMin: 8 },
      ] };
      case 37: return { tag: "custom_order", steps: [
        { k: "c", text: "Hi! I run a wedding blog in Chennai. Do you preserve varmala flowers in resin?" },
        { k: "ai", text: `Yes, we love doing these! 🌸 We preserve garland flowers in frames and clocks. The ${clock.name} with your flowers starts at ${rs(clock.price)}.`, intent: "custom_order", facts: [`product:${clock.slug}.price`], tag: "custom_order" },
        { k: "c", text: "Would love to collaborate on a feature. Could I speak to the owner?" },
        { k: "h", who: "owner", text: `Hi ${first}, this is Saba! Would love to collaborate 💛 Can we talk tomorrow at 11?`, gapMin: 40 },
        { k: "c", text: "Perfect, talk then!", gapMin: 25 },
      ] };
      case 3: return { tag: "custom_order", steps: [
        { k: "c", text: "Resin name board for shop, 3 feet length, evlo aagum?" },
        { k: "esc", reason: "missing_facts", intent: "price", draft: "Let me check with our artist on a 3 ft shop board and come back with a quote.", missing: ["product:3ft shop name board.price"] },
        { k: "h", who: "owner", text: `Hi ${first}! A 3 ft shop board is ₹4,800 with your logo, 10 days to make. Want a mock-up?`, gapMin: 22 },
        { k: "c", text: "Ok send mock-up", gapMin: 15 },
        { k: "resolve", gapMin: 6 },
      ] };
      case 12: return { tag: "follow_up", steps: [
        { k: "c", text: "Where is my order? Booked bookmarks last week" },
        { k: "esc", reason: "always_escalate_phrase", intent: "delivery", draft: SORRY },
        { k: "h", who: "staff", text: "Hi ma'am! It was dispatched yesterday via ST Courier, tracking ST48213977. Should reach Madurai in 2 days 😊", gapMin: 70 },
        { k: "c", text: "Ok thank you", gapMin: 12 },
        { k: "resolve", gapMin: 8 },
      ] };
      case 19: return { tag: "follow_up", steps: [
        { k: "c", text: `I booked the ${clock.name} this morning but I want to cancel my order. Plans changed, sorry` },
        { k: "esc", reason: "intent_refund", intent: "refund", draft: SORRY },
        { k: "h", who: "owner", text: "No problem at all! Since it's within 24 hours, your advance will be refunded to the same GPay number within 3 working days.", gapMin: 160 },
        { k: "c", text: "Thank you so much 🙏", gapMin: 30 },
        { k: "resolve", gapMin: 5 },
      ] };
      case 31: return { tag: "order_confirmed", steps: [
        { k: "c", text: `${keychain.name} rate?` },
        { k: "ai", text: priceReply(keychain), intent: "price", facts: [`product:${keychain.slug}.price`], tag: "new_lead" },
        { k: "c", text: "Payment done via UPI, ref 4471 2290 1185. Please confirm" },
        { k: "esc", reason: "payment_claim", intent: "payment", draft: "Thank you! We'll verify the payment and confirm shortly.", assign: true },
        { k: "h", who: "staff", text: "Received, thank you! Your order is confirmed ✨", gapMin: 40 },
        { k: "resolve", gapMin: 4 },
      ] };
      case 41: return { tag: "follow_up", steps: [
        { k: "c", text: "The bookmarks came but the tassels are missing on two of them" },
        { k: "esc", reason: "intent_complaint", intent: "complaint", draft: SORRY },
        { k: "h", who: "owner", text: "So sorry about that! We're sending two new tassels by post today, no charge 💛", gapMin: 300 },
        { k: "c", text: "Ok fine, thanks", gapMin: 50 },
        { k: "resolve", gapMin: 10 },
      ] };
      case 11: return { tag: "new_lead", steps: [
        { k: "c", text: askPrice(coaster, false) },
        { k: "ai", text: priceReply(coaster), intent: "price", facts: [`product:${coaster.slug}.price`], tag: "new_lead" },
        { k: "pause" },
        { k: "c", text: "Can you do it in black and silver?", gapMin: 120 },
      ] };
      case 34: return { tag: "custom_order", steps: [
        { k: "c", text: "Bro, do you sell resin art supplies? Pigments, moulds?" },
        { k: "ai", text: "Hi! We only sell finished pieces right now, not supplies. But we can customise any of our products for you 😊", intent: "custom_order", facts: ["products"] },
        { k: "pause" },
        { k: "c", text: "Ok. Can I visit your studio?", gapMin: 90 },
      ] };
      default: return null;
    }
  }

  function planFor(i: number): ConvPlan {
    const plan = CUSTOMERS[i]![4];
    const endDaysAgo = ACTIVE_DAY[i] ?? int(0, 20);
    const scripted = scriptedSteps(i);
    const base: { steps: Step[]; tag: ConvTag | null; anchor?: { idx: number; ms: number } } = scripted ?? autoSteps(i);
    const steps = [...base.steps];
    let anchor = base.anchor;
    // Some returning customers had an earlier enquiry 3-6 weeks before (fills the previous period).
    if (!NEW_CUSTOMERS.has(i) && plan !== "old" && chance(0.5)) {
      const [, , , lang] = CUSTOMERS[i]!;
      const p = pick(ctx.products);
      const early: Step[] = [
        { k: "c", text: askPrice(p, lang === "tamil") },
        { k: "ai", text: priceReply(p), intent: "price", facts: [`product:${p.slug}.price`, `product:${p.slug}.lead_time_days`], tag: "new_lead" },
        { k: "gap", hours: int(20, 40) * 24 + between(-2, 2) },
      ];
      steps.unshift(...early);
      if (anchor) anchor = { idx: anchor.idx + early.length, ms: anchor.ms };
    }
    if (OPTED_OUT[i] === "keyword") {
      steps.push({ k: "c", text: "STOP", gapMin: 60 * 24 * 3 });
      steps.push({ k: "sys", text: "You won't receive offers from us anymore. Reply START to subscribe again.", kind: "opt_out_ack" });
    }
    const state: ConvState =
      plan === "escalated" ? "escalated"
      : plan === "owner_esc" || plan === "owner_direct" ? "owner_handling"
      : plan === "paused" ? "paused"
      : "ai_active";
    const lastCustomerAgoH = i === 22 ? 22.6 : i === 4 ? 23.1 : undefined;
    const unread =
      plan === "escalated" ? i !== 6
      : plan === "paused" || plan === "owner_esc" ? true
      : plan === "old" ? false
      : endDaysAgo <= 1 ? chance(0.6) : chance(0.1);
    return {
      steps, state, tag: base.tag, endDaysAgo, unread,
      ...(lastCustomerAgoH !== undefined ? { lastCustomerAgoH } : {}),
      ...(anchor ? { anchor } : {}),
    };
  }

  const outboundStatus = (ms: number): DeliveryStatus => {
    if (NOW - ms < 20 * MIN) return pick(["sent", "delivered"] as const);
    const r = rnd();
    return r < 0.62 ? "read" : r < 0.9 ? "delivered" : r < 0.98 ? "sent" : "failed";
  };

  const convByCust = new Map<number, ConversationRow>();
  const convMsgTimes = new Map<string, number[]>();
  const unreadByConv = new Map<string, boolean>();

  CUSTOMERS.forEach(([name], i) => {
    const cust = custRows[i]!;
    const plan = planFor(i);
    const convId = sid();

    // Relative timeline
    const rel: number[] = [];
    let t = 0;
    plan.steps.forEach((s, idx) => {
      switch (s.k) {
        case "c": t += idx === 0 ? 0 : (s.gapMin ?? between(2, 35)) * MIN; break;
        case "ai": t += between(12, 45) * 1000; break;
        case "esc": t += between(8, 25) * 1000; break;
        case "h": t += (s.gapMin ?? between(12, 140)) * MIN; break;
        case "sys": t += between(1, 3) * 1000; break;
        case "resolve": t += (s.gapMin ?? between(4, 25)) * MIN; break;
        case "pause": t += between(10, 50) * MIN; break;
        case "gap": t += s.hours * HOUR; break;
      }
      rel.push(t);
    });
    const total = t;
    const lastCustIdx = plan.steps.map((s) => s.k).lastIndexOf("c");
    const escIdx = plan.steps.findIndex((s) => s.k === "esc");
    const resolved = plan.steps.some((s) => s.k === "resolve");

    let start =
      plan.lastCustomerAgoH !== undefined
        ? NOW - plan.lastCustomerAgoH * HOUR - (rel[lastCustIdx] ?? 0)
        : plan.anchor
          ? plan.anchor.ms - (rel[plan.anchor.idx] ?? 0)
          : istAt(plan.endDaysAgo, between(10.5, 20.5)) - total;
    start = Math.min(start, NOW - 2 * MIN - total);
    // Open escalations are >= 3h old (reminded_at is set below, so no reminder job fires).
    if (escIdx >= 0 && !resolved) start = Math.min(start, NOW - 3 * HOUR - (rel[escIdx] ?? 0));
    const at = (idx: number) => start + (rel[idx] ?? 0);

    let lastInboundId: string | null = null;
    let batchSize = 0;
    let escalation: EscalationRow | null = null;
    let lastHumanId: string | null = null;
    let lastHumanRole: "admin" | "staff" = "admin";
    let tag: ConvTag | null = null;
    const times: number[] = [];

    plan.steps.forEach((s, idx) => {
      const ms = at(idx);
      switch (s.k) {
        case "c": {
          const id = sid();
          out.messages.push({
            id, conversationId: convId, businessId, direction: "inbound", senderType: "customer", senderId: null,
            content: s.text, deliveryStatus: "delivered", metadata: {}, mediaUrls: [], createdAt: D(ms),
          });
          lastInboundId = id;
          batchSize += 1;
          times.push(ms);
          touch(i, ms);
          break;
        }
        case "ai": {
          const id = sid();
          out.messages.push({
            id, conversationId: convId, businessId, direction: "outbound", senderType: "ai", senderId: null,
            content: s.text, deliveryStatus: outboundStatus(ms), metadata: {}, mediaUrls: [], createdAt: D(ms),
          });
          if (lastInboundId) {
            out.aiDecisions.push({
              id: sid(), messageId: lastInboundId, conversationId: convId, businessId, intent: s.intent,
              replyDraft: s.text, factsUsed: s.facts, missingFacts: [], escalate: false, escalateReason: null,
              suggestedTag: s.tag ?? null, languageDetected: "english", sent: true, createdAt: D(ms - 2000),
            });
          }
          audit({
            actorId: null, actorType: "ai", action: "auto_reply_sent", conversationId: convId,
            details: { intent: s.intent, messageId: id, batchSize: Math.max(1, batchSize), replyPreview: s.text.slice(0, 100), customerName: name },
            createdAt: D(ms + 1500),
          });
          if (s.tag) tag = s.tag;
          batchSize = 0;
          times.push(ms);
          break;
        }
        case "esc": {
          const assigned = Boolean(s.assign && staffId);
          const isOpen = !resolved;
          escalation = {
            id: sid(), businessId, conversationId: convId, reason: s.reason,
            assignedToUserId: assigned ? staffId : null,
            assignedByUserId: assigned ? adminId : null,
            assignedAt: assigned ? D(past(ms + between(3, 10) * MIN)) : null,
            alertedAt: D(ms + 3000),
            remindedAt: isOpen && NOW - ms > 2 * HOUR ? D(ms + 2 * HOUR + between(1, 14) * MIN) : null,
            resolvedAt: null, resolvedByUserId: null, createdAt: D(ms),
          };
          out.escalations.push(escalation);
          if (lastInboundId) {
            out.aiDecisions.push({
              id: sid(), messageId: lastInboundId, conversationId: convId, businessId, intent: s.intent,
              replyDraft: s.draft, factsUsed: [], missingFacts: s.missing ?? [], escalate: true, escalateReason: s.reason,
              suggestedTag: null, languageDetected: "english", sent: false, createdAt: D(ms - 2000),
            });
          }
          audit({
            actorId: null, actorType: "ai", action: "escalation_created", conversationId: convId, escalationId: escalation.id,
            details: { reason: s.reason, fromState: "ai_active", toState: "escalated", customerName: name },
            createdAt: D(ms),
          });
          if (assigned && escalation.assignedAt) {
            audit({
              actorId: adminId, actorType: "admin", action: "escalation_assigned", conversationId: convId,
              escalationId: escalation.id, targetUserId: staffId, details: { assignedToUserId: staffId },
              createdAt: escalation.assignedAt,
            });
          }
          batchSize = 0;
          break;
        }
        case "h": {
          const role = s.who === "staff" && staffId ? "staff" : "admin";
          const userId = role === "staff" ? staffId! : adminId;
          const id = sid();
          out.messages.push({
            id, conversationId: convId, businessId, direction: "outbound", senderType: role === "staff" ? "staff" : "owner",
            senderId: userId, content: s.text, deliveryStatus: outboundStatus(ms), metadata: {}, mediaUrls: [], createdAt: D(ms),
          });
          audit({
            actorId: userId, actorType: role, action: "reply_sent", conversationId: convId,
            details: { messageId: id, preview: s.text.slice(0, 100), customerName: name },
            createdAt: D(ms + 800),
          });
          lastHumanId = userId;
          lastHumanRole = role;
          batchSize = 0;
          times.push(ms);
          break;
        }
        case "sys": {
          out.messages.push({
            id: sid(), conversationId: convId, businessId, direction: "outbound", senderType: "system", senderId: null,
            content: s.text, deliveryStatus: outboundStatus(ms), metadata: { kind: s.kind }, mediaUrls: [], createdAt: D(ms),
          });
          times.push(ms);
          break;
        }
        case "resolve": {
          const esc = escalation as EscalationRow | null;
          if (esc) {
            esc.resolvedAt = D(ms);
            esc.resolvedByUserId = lastHumanId ?? adminId;
          }
          audit({
            actorId: lastHumanId ?? adminId, actorType: lastHumanId ? lastHumanRole : "admin", action: "conversation_resolved",
            conversationId: convId, ...(esc ? { escalationId: esc.id } : {}),
            details: { resolvedByRole: lastHumanId ? lastHumanRole : "admin" },
            createdAt: D(ms),
          });
          break;
        }
        case "pause": {
          audit({
            actorId: adminId, actorType: "admin", action: "conversation_paused", conversationId: convId,
            details: { from: "ai_active", to: "paused" }, createdAt: D(ms),
          });
          break;
        }
        case "gap":
          break;
      }
    });

    if (OPTED_OUT[i] === "keyword") {
      const stopMsg = [...out.messages].reverse().find((m) => m.conversationId === convId && m.content === "STOP");
      if (stopMsg) {
        cust.optedOut = true;
        cust.optedOutAt = stopMsg.createdAt;
        cust.optOutSource = "keyword";
        audit({
          actorId: null, actorType: "system", action: "customer_opted_out", conversationId: convId,
          details: { customerId: cust.id, source: "keyword", messageId: stopMsg.id }, createdAt: D(stopMsg.createdAt.getTime() + 500),
        });
      }
    }

    const inboundTimes = plan.steps.flatMap((s, idx) => (s.k === "c" ? [at(idx)] : []));
    const lastCustomerAt = inboundTimes.length ? Math.max(...inboundTimes) : null;
    const conv: ConversationRow = {
      id: convId,
      businessId,
      customerId: cust.id,
      channelId: cust.channelId,
      state: plan.state,
      tag: plan.tag ?? tag,
      lastCustomerMessageAt: lastCustomerAt ? D(lastCustomerAt) : null,
      windowClosesAt: lastCustomerAt ? D(lastCustomerAt + DAY) : null,
      lastMessageAt: D(Math.max(...times, start)),
      adminLastReadAt: null,
      createdAt: D(start),
      updatedAt: D(Math.max(...times, start)),
    };
    // adminLastReadAt is finalised after broadcasts are added (see below)
    unreadByConv.set(convId, plan.unread);
    out.conversations.push(conv);
    convByCust.set(i, conv);
    convMsgTimes.set(convId, times);
  });

  // ── Orders, items, payments ────────────────────────────────────────────────
  const methods = ["UPI", "GPay", "GPay", "PhonePe", "Bank transfer", "UPI"] as const;
  const reference = (method: string) =>
    method === "Cash" ? null : method === "Bank transfer" ? `NEFT/N${digits(12)}` : `${int(3, 5)}${digits(11)}`;
  const trackingFor = (courier: string) =>
    courier === "DTDC" ? `D${digits(9)}` : courier === "Delhivery" ? digits(13) : courier === "ST Courier" ? `ST${digits(8)}` : `EK${digits(9)}IN`;

  orderPlans.forEach((o, n) => {
    const { spec, totals, createdAt, lead, ship, city, path, times, when } = o;
    const orderId = sid();
    const orderNo = `SA-${ctx.firstOrderNo + n}`;
    touch(spec.cust, createdAt);

    const dispatchedAt = when("dispatched");
    const deliveredAt = when("delivered");
    const courier = dispatchedAt ? (spec.pickup ? null : pick(["DTDC", "Delhivery", "ST Courier", "India Post"])) : null;
    const due =
      spec.overdueDays !== undefined ? NOW - spec.overdueDays * DAY
      : spec.dueInDays !== undefined ? NOW + spec.dueInDays * DAY
      : createdAt + (lead + ship) * DAY;
    const lastChange = Math.max(createdAt, ...times);

    out.orders.push({
      id: orderId,
      businessId,
      customerId: o.cust.id,
      orderNo,
      customerName: o.custName,
      customerPhone: o.handle ? (chance(0.5) ? `91${pick(["9", "8", "7"])}${digits(9)}` : null) : o.cust.handleOrPhone,
      customerEmail: chance(0.15) ? `${o.custName.split(" ")[0]!.toLowerCase()}${int(10, 99)}@gmail.com` : null,
      channel: custType(spec.cust),
      status: spec.status,
      subtotal: money(totals.subtotal),
      deliveryCharge: money(totals.delivery),
      discountAmount: money(totals.discount),
      totalAmount: money(totals.total),
      currency: "INR",
      shippingAddress: spec.pickup ? null : address(city),
      courier,
      trackingId: courier ? trackingFor(courier) : null,
      customerNotes: spec.customerNotes ?? null,
      internalNotes: spec.internalNotes ?? (spec.pickup ? "Studio pickup" : null),
      expectedDeliveryDate: istDate(due),
      dispatchedAt: dispatchedAt ? D(dispatchedAt) : null,
      deliveredAt: deliveredAt ? D(deliveredAt) : null,
      isDeleted: false,
      createdAt: D(createdAt),
      updatedAt: D(lastChange),
    });

    for (const [slug, qty, customizations] of spec.items) {
      const p = P(slug);
      out.orderItems.push({
        id: sid(), orderId, productId: p.id, productName: p.name, productDescription: null, quantity: qty,
        unitPrice: money(p.price), customizations: customizations ?? {}, createdAt: D(createdAt), updatedAt: D(createdAt),
      });
    }
    for (const [cname, desc, price, qty] of spec.custom ?? []) {
      out.orderItems.push({
        id: sid(), orderId, productId: null, productName: cname, productDescription: desc, quantity: qty,
        unitPrice: money(price), customizations: { custom: "yes" }, createdAt: D(createdAt), updatedAt: D(createdAt),
      });
    }

    const details = { orderId, orderNo, customerName: o.custName };
    audit({ actorId: adminId, actorType: "admin", action: "order_created", details: { ...details, total: totals.total }, createdAt: D(createdAt) });
    let from: OrderStatus = "pending";
    path.forEach((to, k) => {
      audit({
        actorId: adminId, actorType: "admin", action: "order_status_changed",
        details: { ...details, fromStatus: from, toStatus: to, notificationSent: to === "dispatched" || to === "ready" },
        createdAt: D(times[k]!),
      });
      from = to;
    });

    // Payments
    const addPayment = (p: {
      kind: "advance" | "balance" | "other"; amount: number; createdAt: number;
      paidAt?: number | null; voidAt?: number; voidReason?: string; method?: string; note?: string;
    }) => {
      if (p.amount <= 0) return;
      const method = p.method ?? pick(methods);
      const paid = p.paidAt !== undefined && p.paidAt !== null;
      const status = p.voidAt !== undefined ? "void" : paid ? "paid" : "pending";
      const id = sid();
      out.payments.push({
        id, businessId, orderId, kind: p.kind, amount: p.amount, status,
        method, reference: paid ? reference(method) : null, note: p.note ?? null,
        paidAt: paid ? D(p.paidAt!) : null, recordedByUserId: paid ? adminId : null,
        voidedReason: p.voidReason ?? null,
        createdAt: D(p.createdAt), updatedAt: D(p.voidAt ?? p.paidAt ?? p.createdAt),
      });
      audit({ actorId: adminId, actorType: "admin", action: "payment_recorded", details: { paymentId: id, orderId, kind: p.kind, amount: p.amount }, createdAt: D(p.createdAt) });
      if (paid && p.paidAt! - p.createdAt > MIN) {
        audit({ actorId: adminId, actorType: "admin", action: "payment_marked_paid", details: { paymentId: id, orderId, amount: p.amount, method }, createdAt: D(p.paidAt!) });
      }
      if (p.voidAt !== undefined) {
        audit({ actorId: adminId, actorType: "admin", action: "payment_voided", details: { paymentId: id, orderId, reason: p.voidReason ?? "" }, createdAt: D(p.voidAt) });
      }
    };

    if (spec.noPayments) return;
    const confirmedAt = when("confirmed");
    const advanceCreated = createdAt + between(5, 30) * MIN;
    if (spec.cashOnPickup) {
      const paidAt = deliveredAt ?? past(createdAt + DAY);
      addPayment({ kind: "other", amount: totals.total, createdAt: paidAt, paidAt, method: "Cash", note: "Paid in full at studio pickup" });
      return;
    }
    if (spec.status === "pending") {
      if (spec.advancePending) addPayment({ kind: "advance", amount: totals.advance, createdAt: past(advanceCreated) });
      return;
    }
    if (spec.status === "cancelled") {
      const cancelAt = when("cancelled")!;
      if (spec.voidAdvance && confirmedAt) {
        addPayment({ kind: "advance", amount: totals.advance, createdAt: advanceCreated, paidAt: confirmedAt, voidAt: cancelAt + 10 * MIN, voidReason: "Order cancelled within 24h, advance refunded" });
      }
      return;
    }
    addPayment({ kind: "advance", amount: totals.advance, createdAt: Math.min(advanceCreated, confirmedAt ?? advanceCreated), paidAt: confirmedAt });
    const balance = totals.total - totals.advance;
    if (spec.paidInFull) {
      const at = when("in_production") ?? confirmedAt!;
      addPayment({ kind: "balance", amount: balance, createdAt: at - 30 * MIN, paidAt: at - 5 * MIN, note: "Paid full amount upfront" });
      return;
    }
    const readyAt = when("ready");
    if (!readyAt) return;
    const dispatched = when("dispatched");
    const balancePaidAt = dispatched && !spec.balancePending ? Math.max(readyAt + 15 * MIN, dispatched - between(1, 4) * HOUR) : null;
    addPayment({ kind: "balance", amount: balance, createdAt: readyAt + 5 * MIN, paidAt: balancePaidAt });
    if (spec.duplicateVoid) {
      const at = readyAt + 12 * MIN;
      addPayment({ kind: "balance", amount: balance, createdAt: at, voidAt: at + 6 * MIN, voidReason: "Duplicate entry" });
    }
  });

  // ── Opt-outs by admin ──────────────────────────────────────────────────────
  for (const [idxStr, source] of Object.entries(OPTED_OUT)) {
    if (source !== "admin") continue;
    const i = Number(idxStr);
    const cust = custRows[i]!;
    const at = past((latest.get(i) ?? NOW - 5 * DAY) + between(1, 3) * DAY, HOUR);
    cust.optedOut = true;
    cust.optedOutAt = D(at);
    cust.optOutSource = "admin";
    audit({ actorId: adminId, actorType: "admin", action: "customer_opted_out", details: { customerId: cust.id, source: "admin" }, createdAt: D(at) });
  }

  // ── Customer createdAt ─────────────────────────────────────────────────────
  custRows.forEach((c, i) => {
    const first = earliest.get(i) ?? NOW - DAY;
    const plan = CUSTOMERS[i]![4];
    const created =
      plan === "old" ? Math.min(first, istAt(int(150, 185), between(10, 19))) - between(5, 60) * MIN
      : NEW_CUSTOMERS.has(i) ? first - between(2, 30) * MIN
      : Math.min(first - between(2, 30) * MIN, istAt(int(20, 75), between(10, 19)));
    c.createdAt = D(created);
    c.updatedAt = D(Math.max(created, latest.get(i) ?? created, c.optedOutAt?.getTime() ?? 0));
  });
  out.customers.push(...custRows);

  // ── Templates + broadcasts ─────────────────────────────────────────────────
  const tplName = (n: string) => (ctx.templateNames.has(n) ? `${n} (demo)` : n);
  const mkTemplate = (name: string, metaName: string, body: string, createdDaysAgo: number) => {
    const at = istAt(createdDaysAgo, between(11, 17));
    const row: TemplateRow = {
      id: sid(), businessId, name: tplName(name), category: "festive", channel: "whatsapp", body,
      variables: extractVariables(body), isActive: true, metaTemplateName: metaName, metaStatus: "approved",
      createdByUserId: adminId, updatedByUserId: adminId, createdAt: D(at), updatedAt: D(at + 2 * DAY),
    };
    out.messageTemplates.push(row);
    return row;
  };
  const tNavaratri = mkTemplate(
    "Navaratri golu collection", "navaratri_golu_2026",
    "Hi {customerName}, Navaratri vazhthukkal! 🌸 Our golu return-gift range starts at ₹{startingPrice}. Bulk orders of 10+ get 10% off. Want the price list?",
    34,
  );
  const tDiwali = mkTemplate(
    "Diwali gift sets 2026", "diwali_gift_sets_2026",
    "Hi {customerName}! 🪔 Our Diwali resin gift sets are here: coasters, trays and name keychains, handmade in Coimbatore. Order by {lastOrderDate} for delivery before Diwali ✨",
    15,
  );
  const tXmas = mkTemplate(
    "Christmas preview 2026", "christmas_preview_2026",
    "Hi {customerName}, our handmade Christmas collection drops on {launchDate} 🎄 Favourites get first pick. Reply YES to get the catalogue early!",
    3,
  );

  const waIdx = CUSTOMERS.map((_, i) => i).filter((i) => custType(i) === "whatsapp");
  const nonCancelledOrderTimes = (i: number) =>
    out.orders.filter((o) => o.customerId === custRows[i]!.id && o.status !== "cancelled").map((o) => o.createdAt.getTime());
  const reachable = (i: number, at: number) => {
    const c = custRows[i]!;
    return c.createdAt.getTime() < at && !(c.optedOutAt && c.optedOutAt.getTime() <= at);
  };

  const mkBroadcast = (opts: {
    name: string; template: TemplateRow; segment: BroadcastRow["segment"]; filters?: BroadcastFilters;
    variables: Record<string, string>; status: "sent" | "scheduled" | "draft"; createdAt: number;
    startedAt?: number; scheduledAt?: number; audience: number[];
  }) => {
    const id = sid();
    const sentStats = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    const recipients = opts.status === "draft" ? [] : opts.audience;
    const done = { at: 0 };
    recipients.forEach((i, k) => {
      const cust = custRows[i]!;
      const conv = convByCust.get(i) ?? null;
      const rId = sid();
      if (opts.status === "scheduled") {
        sentStats.pending += 1;
        out.broadcastRecipients.push({ id: rId, businessId, broadcastId: id, customerId: cust.id, conversationId: conv?.id ?? null, phone: cust.handleOrPhone, status: "pending", createdAt: D(opts.createdAt) });
        return;
      }
      const sentAt = opts.startedAt! + (k + 1) * between(2, 5) * 1000;
      const r = rnd();
      const status = r < 0.5 ? "read" : r < 0.8 ? "delivered" : r < 0.92 ? "sent" : "failed";
      sentStats[status] += 1;
      const deliveredAt = status === "read" || status === "delivered" ? sentAt + between(3, 60) * 1000 : null;
      const readAt = status === "read" ? past(deliveredAt! + between(5, 360) * MIN) : null;
      const text = renderTemplate(opts.template.body, { ...opts.variables, customerName: cust.name?.split(" ")[0] ?? cust.handleOrPhone }).text;
      let messageId: string | null = null;
      if (conv) {
        messageId = sid();
        out.messages.push({
          id: messageId, conversationId: conv.id, businessId, direction: "outbound", senderType: "system", senderId: null,
          content: text, deliveryStatus: status, metadata: { kind: "broadcast", broadcastId: id, templateId: opts.template.id },
          mediaUrls: [], createdAt: D(sentAt),
        });
        convMsgTimes.get(conv.id)?.push(sentAt);
      }
      out.broadcastRecipients.push({
        id: rId, businessId, broadcastId: id, customerId: cust.id, conversationId: conv?.id ?? null, messageId,
        phone: cust.handleOrPhone, status,
        error: status === "failed" ? pick(["(#131026) Message undeliverable", "Recipient phone number not on WhatsApp"]) : null,
        sentAt: status === "failed" ? null : D(sentAt), deliveredAt: deliveredAt ? D(deliveredAt) : null, readAt: readAt ? D(readAt) : null,
        createdAt: D(opts.startedAt!),
      });
      done.at = Math.max(done.at, sentAt + 2000);
    });

    const row: BroadcastRow = {
      id, businessId, name: opts.name, templateId: opts.template.id!, segment: opts.segment, filters: opts.filters ?? {},
      variables: opts.variables, status: opts.status,
      scheduledAt: opts.scheduledAt !== undefined ? D(opts.scheduledAt) : null,
      startedAt: opts.startedAt !== undefined ? D(opts.startedAt) : null,
      completedAt: done.at ? D(done.at) : null,
      recipientCount: recipients.length, error: null, createdByUserId: adminId,
      createdAt: D(opts.createdAt), updatedAt: D(done.at || opts.createdAt),
    };
    out.broadcasts.push(row);
    const d = { broadcastId: id, name: opts.name };
    audit({ actorId: adminId, actorType: "admin", action: "broadcast_created", details: { ...d, segment: opts.segment, status: opts.status === "sent" ? "sending" : opts.status }, createdAt: D(opts.createdAt) });
    if (opts.status === "scheduled") audit({ actorId: adminId, actorType: "admin", action: "broadcast_scheduled", details: { ...d, scheduledAt: D(opts.scheduledAt!) }, createdAt: D(opts.createdAt + 1000) });
    if (opts.status === "sent") {
      audit({ actorId: adminId, actorType: "admin", action: "broadcast_started", details: { ...d, scheduledAt: null }, createdAt: D(opts.startedAt!) });
      audit({ actorId: null, actorType: "system", action: "broadcast_sent", details: { ...d, status: "sent", ...sentStats }, createdAt: D(done.at || opts.startedAt!) });
    }
  };

  const b1Start = istAt(26, 11.2);
  mkBroadcast({
    name: "Navaratri return gifts", template: tNavaratri, segment: "all", variables: { startingPrice: "380" },
    status: "sent", createdAt: b1Start - 40 * MIN, startedAt: b1Start,
    audience: waIdx.filter((i) => reachable(i, b1Start)),
  });
  const b2Start = istAt(6, 10.5);
  mkBroadcast({
    name: "Diwali early bird (past buyers)", template: tDiwali, segment: "previous_buyers", variables: { lastOrderDate: "1 Nov" },
    status: "sent", createdAt: b2Start - 25 * MIN, startedAt: b2Start,
    audience: waIdx.filter((i) => reachable(i, b2Start) && nonCancelledOrderTimes(i).some((t) => t < b2Start)),
  });
  const b3At = istAt(-6, 10);
  mkBroadcast({
    name: "Diwali last call (Coimbatore)", template: tDiwali, segment: "all", filters: { city: "Coimbatore" },
    variables: { lastOrderDate: "4 Nov" }, status: "scheduled", createdAt: past(istAt(0, 12)), scheduledAt: b3At,
    audience: waIdx.filter((i) => CUSTOMERS[i]![2] === "Coimbatore" && reachable(i, NOW)),
  });
  mkBroadcast({
    name: "Christmas preview for favourites", template: tXmas, segment: "favourites", variables: { launchDate: "1 Dec" },
    status: "draft", createdAt: past(istAt(1, 16)), audience: [],
  });

  // ── Finalise conversations (last message incl. broadcasts, read markers) ───
  for (const conv of out.conversations) {
    const times = convMsgTimes.get(conv.id) ?? [];
    const last = Math.max(conv.createdAt!.getTime(), ...times);
    conv.lastMessageAt = D(last);
    conv.updatedAt = D(last);
    const unread = unreadByConv.get(conv.id) ?? false;
    const lastCust = conv.lastCustomerMessageAt?.getTime() ?? null;
    if (unread && lastCust) {
      conv.adminLastReadAt = chance(0.4) ? null : D(Math.max(conv.createdAt!.getTime(), lastCust - between(1, 20) * HOUR));
      if (conv.adminLastReadAt && conv.adminLastReadAt.getTime() >= lastCust) conv.adminLastReadAt = null;
    } else {
      conv.adminLastReadAt = D(past(last + between(1, 40) * MIN, MIN));
    }
  }

  out.auditLog.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  out.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

// ─── Reporting ────────────────────────────────────────────────────────────────

const TABLE_ORDER = [
  ["channels", out.channels],
  ["message_templates", out.messageTemplates],
  ["customers", out.customers],
  ["conversations", out.conversations],
  ["messages", out.messages],
  ["ai_decisions", out.aiDecisions],
  ["escalations", out.escalations],
  ["orders", out.orders],
  ["order_items", out.orderItems],
  ["payments", out.payments],
  ["broadcasts", out.broadcasts],
  ["broadcast_recipients", out.broadcastRecipients],
  ["audit_log", out.auditLog],
] as const;

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): string {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) ?? "null";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ");
}

function report(ctx: Ctx) {
  console.log("\nRows per table:");
  let total = 0;
  for (const [name, rows] of TABLE_ORDER) {
    console.log(`  ${name.padEnd(22)} ${String(rows.length).padStart(5)}`);
    total += rows.length;
  }
  console.log(`  ${"TOTAL".padEnd(22)} ${String(total).padStart(5)}`);

  const waId = ctx.channelIds.whatsapp;
  console.log("\nBreakdown:");
  console.log(`  customers: whatsapp=${out.customers.filter((c) => c.channelId === waId).length}, instagram=${out.customers.filter((c) => c.channelId !== waId).length}, favourite=${out.customers.filter((c) => c.isFavourite).length}, priority=${out.customers.filter((c) => c.isPriority).length}, opted_out=${out.customers.filter((c) => c.optedOut).length}, new(<14d)=${out.customers.filter((c) => NOW - c.createdAt.getTime() < 14 * DAY).length}`);
  console.log(`  conversation states: ${countBy(out.conversations, (c) => c.state)}`);
  console.log(`  conversation tags: ${countBy(out.conversations, (c) => c.tag)}`);
  console.log(`  unread for admin: ${out.conversations.filter((c) => c.lastCustomerMessageAt && (!c.adminLastReadAt || c.lastCustomerMessageAt > c.adminLastReadAt)).length}, windows open: ${out.conversations.filter((c) => c.windowClosesAt && c.windowClosesAt.getTime() > NOW).length}`);
  console.log(`  messages by sender: ${countBy(out.messages, (m) => m.senderType)}`);
  console.log(`  outbound delivery: ${countBy(out.messages.filter((m) => m.direction === "outbound"), (m) => m.deliveryStatus)}`);
  console.log(`  escalations: open=${out.escalations.filter((e) => !e.resolvedAt).length} (assigned=${out.escalations.filter((e) => !e.resolvedAt && e.assignedToUserId).length}), resolved=${out.escalations.filter((e) => e.resolvedAt).length}; reasons: ${countBy(out.escalations, (e) => e.reason)}`);
  console.log(`  orders by status: ${countBy(out.orders, (o) => o.status)}; by channel: ${countBy(out.orders, (o) => o.channel)}`);
  console.log(`  order numbers: ${out.orders[0]?.orderNo} .. ${out.orders[out.orders.length - 1]?.orderNo} (allocated like POST /orders: highest existing number + 1)`);
  console.log(`  payments: ${countBy(out.payments, (p) => `${p.kind}:${p.status}`)}`);
  console.log(`  broadcasts: ${out.broadcasts.map((b) => `${b.name} [${b.status}, ${b.recipientCount}]`).join("; ")}`);
  console.log(`  recipients: ${countBy(out.broadcastRecipients, (r) => r.status)}`);
  console.log(`  audit actions: ${countBy(out.auditLog, (a) => a.action)}`);

  // A few sample threads so the content can be eyeballed.
  const fmt = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(5, 16).replace("T", " ");
  for (const i of [0, 1, 3]) {
    const conv = out.conversations[i];
    const cust = out.customers[i];
    if (!conv || !cust) continue;
    console.log(`\nSample thread: ${cust.name} (${cust.city}, ${conv.state}, tag=${conv.tag}) [IST]`);
    for (const m of out.messages.filter((x) => x.conversationId === conv.id)) {
      console.log(`  ${fmt(m.createdAt)}  ${m.senderType.padEnd(8)} ${(m.content ?? "").slice(0, 110)}`);
    }
  }

  // Preview of what GET /analytics will see from the demo rows alone.
  const window = (days: number, offset: number) => [NOW - (days + offset) * DAY, NOW - offset * DAY] as const;
  for (const days of [7, 30]) {
    const preview = (offset: number) => {
      const [from, to] = window(days, offset);
      const inR = (d: Date | null | undefined) => !!d && d.getTime() >= from && d.getTime() < to;
      const msgs = out.messages.filter((m) => inR(m.createdAt));
      const ai = msgs.filter((m) => m.senderType === "ai").length;
      const esc = out.escalations.filter((e) => inR(e.createdAt)).length;
      const sales = out.orders.filter((o) => o.status !== "cancelled" && inR(o.createdAt));
      const revenue = sales.reduce((s, o) => s + Number(o.totalAmount), 0);
      const resolved = out.escalations.filter((e) => inR(e.createdAt) && e.resolvedAt);
      const avgMin = resolved.length ? Math.round(resolved.reduce((s, e) => s + (e.resolvedAt!.getTime() - e.createdAt.getTime()), 0) / resolved.length / MIN) : null;
      const ig = sales.filter((o) => o.channel === "instagram");
      return `messages=${msgs.length}, autoReplies=${ai}, escalations=${esc}, autoReplyRate=${ai + esc ? Math.round((ai / (ai + esc)) * 100) : 0}%, orders=${sales.length}, revenue=${rs(revenue)} (instagram ${ig.length} / ${rs(ig.reduce((s, o) => s + Number(o.totalAmount), 0))}), avgResolve=${avgMin ?? "-"}min`;
    };
    console.log(`\nAnalytics preview (demo rows only), last ${days}d:\n  current : ${preview(0)}\n  previous: ${preview(days)}`);
  }
}

// ─── Sanity checks (run before any write) ─────────────────────────────────────

function validate() {
  const problems: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok && problems.length < 20) problems.push(msg);
  };
  const future = NOW + 1000;
  for (const [name, rows] of TABLE_ORDER) {
    for (const r of rows as ReadonlyArray<{ id?: string | undefined }>) {
      check(typeof r.id === "string" && r.id.startsWith(PREFIX), `${name}: id without ${PREFIX} prefix`);
    }
  }
  const datesOf = (r: object) => Object.entries(r).filter(([, v]) => v instanceof Date) as Array<[string, Date]>;
  for (const [name, rows] of TABLE_ORDER) {
    if (name === "broadcasts" || name === "orders") continue; // scheduled_at / expected dates may be ahead
    for (const r of rows) {
      for (const [k, v] of datesOf(r)) check(k === "windowClosesAt" || v.getTime() <= future, `${name}.${k} is in the future`);
    }
  }
  for (const b of out.broadcasts) for (const [k, v] of datesOf(b)) check(k === "scheduledAt" || v.getTime() <= future, `broadcasts.${k} is in the future`);
  for (const o of out.orders) for (const [k, v] of datesOf(o)) check(v.getTime() <= future, `orders.${k} is in the future`);

  const custById = new Map(out.customers.map((c) => [c.id, c]));
  for (const conv of out.conversations) {
    const c = custById.get(conv.customerId);
    check(!!c && c.createdAt.getTime() <= conv.createdAt!.getTime() + 1000, `conversation ${conv.id} starts before its customer`);
  }
  const openByConv = new Map<string, number>();
  for (const e of out.escalations) if (!e.resolvedAt) openByConv.set(e.conversationId, (openByConv.get(e.conversationId) ?? 0) + 1);
  for (const [convId, n] of openByConv) check(n === 1, `conversation ${convId} has ${n} open escalations`);
  for (const conv of out.conversations) {
    const open = openByConv.has(conv.id);
    check(open === (conv.state === "escalated" || (conv.state === "owner_handling" && open)), `conversation ${conv.id} state ${conv.state} vs open escalation ${open}`);
  }
  for (const o of out.orders) {
    const total = Number(o.subtotal) + Number(o.deliveryCharge) - Number(o.discountAmount);
    check(Math.abs(total - Number(o.totalAmount)) < 0.01, `order ${o.orderNo} total mismatch`);
    const items = out.orderItems.filter((it) => it.orderId === o.id).reduce((s, it) => s + it.quantity! * Number(it.unitPrice), 0);
    check(Math.abs(items - Number(o.subtotal)) < 0.01, `order ${o.orderNo} subtotal != items`);
    const paid = out.payments.filter((p) => p.orderId === o.id && p.status === "paid").reduce((s, p) => s + p.amount, 0);
    check(paid <= Number(o.totalAmount), `order ${o.orderNo} overpaid`);
  }
  if (problems.length) throw new Error(`Generated data failed sanity checks:\n  - ${problems.join("\n  - ")}`);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertAll<T extends PgTable>(tx: Tx, table: T, rows: PgInsertValue<T>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK));
  }
}

async function write(ctx: Ctx) {
  await db.transaction(async (tx) => {
    // Re-check the order number sequence inside the transaction.
    const rows = await tx.select({ orderNo: orders.orderNo }).from(orders).where(eq(orders.businessId, ctx.businessId));
    if (nextOrderNumber(rows.map((r) => r.orderNo)) !== ctx.firstOrderNo) {
      throw new Error("Order numbers changed while seeding (a new order was created). Re-run the script.");
    }
    await insertAll(tx, channels, out.channels);
    await insertAll(tx, messageTemplates, out.messageTemplates);
    await insertAll(tx, customers, out.customers);
    await insertAll(tx, conversations, out.conversations);
    await insertAll(tx, messages, out.messages);
    await insertAll(tx, aiDecisions, out.aiDecisions);
    await insertAll(tx, escalations, out.escalations);
    await insertAll(tx, orders, out.orders);
    await insertAll(tx, orderItems, out.orderItems);
    await insertAll(tx, payments, out.payments);
    await insertAll(tx, broadcasts, out.broadcasts);
    await insertAll(tx, broadcastRecipients, out.broadcastRecipients);
    await insertAll(tx, auditLog, out.auditLog);
  });
}

async function main() {
  const ctx = await loadContext();
  if (!ctx) {
    process.exitCode = 1;
    return;
  }
  build(ctx);
  report(ctx);
  validate();
  console.log("\nSanity checks passed.");

  if (DRY_RUN) {
    // Build (never execute) every insert statement so value mapping errors surface here too.
    const built: Array<[PgTable, unknown[]]> = [
      [channels, out.channels], [messageTemplates, out.messageTemplates], [customers, out.customers],
      [conversations, out.conversations], [messages, out.messages], [aiDecisions, out.aiDecisions],
      [escalations, out.escalations], [orders, out.orders], [orderItems, out.orderItems], [payments, out.payments],
      [broadcasts, out.broadcasts], [broadcastRecipients, out.broadcastRecipients], [auditLog, out.auditLog],
    ];
    let statements = 0;
    for (const [table, rows] of built) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        db.insert(table).values(rows.slice(i, i + CHUNK) as PgInsertValue<PgTable>[]).toSQL();
        statements += 1;
      }
    }
    console.log(`Built ${statements} insert statements (chunks of ${CHUNK}) without executing them.`);
    console.log("\n[dry-run] Nothing was written. Run without --dry-run to insert.");
    return;
  }
  await write(ctx);
  console.log("\nDemo data inserted. Remove it with: npm run db:clear-demo");
}

try {
  await main();
} catch (err) {
  console.error("seed-demo failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
