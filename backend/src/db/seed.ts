// Seeds the demo business, one admin, one staff user, the knowledge base and
// the starter message templates.
// Idempotent: safe to run more than once (existing rows are left untouched).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { config } from "../config.ts";
import { extractVariables } from "../lib/templates.ts";
import { db, sql } from "./index.ts";
import { businesses, knowledgeBase, messageTemplates, users } from "./schema.ts";

// backend/src/db/seed.ts -> <repo>/docs/knowledge-base.json
const KB_PATH = fileURLToPath(new URL("../../../docs/knowledge-base.json", import.meta.url));

const hash = (password: string) => argon2.hash(password, { type: argon2.argon2id });

type TemplateSeed = Pick<typeof messageTemplates.$inferInsert, "name" | "category" | "body" | "channel">;

// Starter templates: 3 per category. {variables} are filled in when replying.
const TEMPLATES: TemplateSeed[] = [
  // delivery
  {
    name: "Order confirmed",
    category: "delivery",
    body: "Hi {customerName}, your order for {product} is confirmed! We'll start making it now and it should be ready in {leadTime}. Thank you for choosing Saba Art 💛",
  },
  {
    name: "Order dispatched",
    category: "delivery",
    body: "Hi {customerName}, your {product} has been dispatched! Tracking ID: {trackingId}. Expected delivery by {deliveryDate}.",
  },
  {
    name: "Order delivered",
    category: "delivery",
    body: "Hi {customerName}, your {product} should have reached you today. We hope you love it! Please share a photo if you can 😊",
  },
  // payment
  {
    name: "Advance payment request",
    category: "payment",
    body: "Hi {customerName}, to confirm your {product}, please pay an advance of ₹{advanceAmount} via GPay/UPI. We'll begin work as soon as it's received.",
  },
  {
    name: "Payment received",
    category: "payment",
    body: "Hi {customerName}, we've received your payment of ₹{amount}. Thank you! 🙏 We'll keep you posted on your {product}.",
  },
  {
    name: "Balance payment reminder",
    category: "payment",
    body: "Hi {customerName}, your {product} is ready! Please pay the balance of ₹{balanceAmount} so we can dispatch it.",
  },
  // festive
  {
    name: "Pongal wishes",
    category: "festive",
    body: "Happy Pongal, {customerName}! 🌾 Wishing you and your family a sweet and joyful harvest season from all of us at Saba Art.",
  },
  {
    name: "Diwali offer",
    category: "festive",
    body: "Hi {customerName}, Diwali is almost here! ✨ Our resin gift sets are on special offer until {offerEndDate}. Order early to get it in time.",
  },
  {
    name: "Christmas collection",
    category: "festive",
    body: "Hi {customerName}, our handmade Christmas collection is here 🎄 Ornaments, coasters and gift boxes, all made in Coimbatore. Want to see the catalogue?",
  },
  // custom_order
  {
    name: "Custom order enquiry",
    category: "custom_order",
    body: "Hi {customerName}, thanks for your interest in a custom {product}! Could you share your preferred colours, size and any name or date to include?",
  },
  {
    name: "Custom order summary",
    category: "custom_order",
    body: "Hi {customerName}, here's your order: {product} for ₹{amount}. It will be ready in {leadTime}. Reply YES to confirm 😊",
  },
  {
    name: "Bulk order quote",
    category: "custom_order",
    body: "Hi {customerName}, for your {eventName} order of {product}, the total comes to ₹{amount}, with {leadTime} to make. Shall we go ahead?",
  },
  // general
  {
    name: "Thank you",
    category: "general",
    body: "Thank you so much for your order, {customerName}! It means a lot to our small studio 💛",
  },
  {
    name: "Review request",
    category: "general",
    body: "Hi {customerName}, we hope you're enjoying your {product}! Would you mind leaving us a quick review? It really helps a small business like ours 🙏",
  },
  {
    name: "Business hours",
    category: "general",
    body: "Hi {customerName}, thanks for messaging Saba Art! We reply between 10 AM and 7 PM, Monday to Saturday. We'll get back to you soon 😊",
  },
];

async function seed() {
  const businessId = config.BUSINESS_ID;

  await db
    .insert(businesses)
    .values({ id: businessId, name: "Asha Resin Art" })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values([
      {
        businessId,
        name: "Asha",
        email: "asha@asharesins.com",
        passwordHash: await hash("changeme123"),
        role: "admin",
      },
      {
        businessId,
        name: "Priya",
        email: "priya@asharesins.com",
        passwordHash: await hash("staffpass123"),
        role: "staff",
      },
    ])
    .onConflictDoNothing();

  const kbData = JSON.parse(readFileSync(KB_PATH, "utf-8"));
  await db
    .insert(knowledgeBase)
    .values({ businessId, data: kbData })
    .onConflictDoUpdate({
      target: [knowledgeBase.businessId],
      set: {
        data: kbData,
        updatedAt: new Date(),
      },
    });

  // Unique on (business_id, name): existing templates are left untouched.
  await db
    .insert(messageTemplates)
    .values(
      TEMPLATES.map((t) => ({
        businessId,
        name: t.name,
        category: t.category,
        channel: t.channel ?? "both",
        body: t.body,
        variables: extractVariables(t.body),
      })),
    )
    .onConflictDoNothing();

  console.log(`Seed complete for business ${businessId}`);
}

try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
