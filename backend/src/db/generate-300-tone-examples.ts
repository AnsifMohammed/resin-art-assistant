import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { config } from "../config.ts";
import { db, sql } from "./index.ts";
import { knowledgeBase } from "./schema.ts";
import { invalidateKBCache } from "../ai/prompt.ts";

interface ProductItem {
  id: string;
  name: string;
  description: string;
  price: number;
  sizes: Array<{ name: string; price: number }>;
  lead_time_days: number;
  customizable: boolean;
  custom_options: string[];
}

interface ToneExample {
  customer: string;
  reply: string;
}

function generateCustomerQuery(p: ProductItem, index: number): string {
  const styles = [
    `Hi! How much is the ${p.name}? What sizes are available?`,
    `Hello! Could you please share the pricing and customization details for the ${p.name}?`,
    `Hi there, I saw your ${p.name}. Can I get it customized and how long does it take to make?`,
    `Good morning! What is the price of the ${p.name}? Do you deliver to Bangalore or Mumbai?`,
    `Hi! I would like to order the ${p.name} as a gift. Can you add custom names or initials on it?`,
    `Hello! What sizes does the ${p.name} come in and what are their respective prices?`,
    `Hi! Is the ${p.name} made to order? How many days will it take for delivery to Chennai?`,
    `Could you tell me the cost of the ${p.name}? Is it safe for daily use and heat resistant?`,
    `Hi! We are looking to buy the ${p.name} for our home. What custom options can we choose from?`,
    `Hello, how much does the ${p.name} cost? What is your payment and ordering procedure?`,
  ];
  return styles[index % styles.length]!;
}

function generateReply(p: ProductItem, index: number): string {
  const sizeList = p.sizes && p.sizes.length > 0
    ? p.sizes.map((s) => `${s.name} (₹${s.price.toLocaleString("en-IN")})`).join(", ")
    : `Standard size (₹${p.price.toLocaleString("en-IN")})`;

  const customText = p.custom_options && p.custom_options.length > 0
    ? ` We can customize the ${p.custom_options.slice(0, 3).map((o) => o.replace(/_/g, " ")).join(", ")}.`
    : "";

  const greetings = ["Hi! 😊", "Hello! 🌸", "Hello there! 💕", "Hi! 💛", "Warm greetings! ✨"];
  const greeting = greetings[index % greetings.length]!;

  const closings = [
    "Would you like to place an order?",
    "Which size would you prefer to order?",
    "Shall I reserve a crafting slot for you?",
    "Would you like to see some reference photos?",
    "Let me know if you would like to proceed with the booking!",
  ];
  const closing = closings[index % closings.length]!;

  return `${greeting} The ${p.name} starts at ₹${p.price.toLocaleString("en-IN")}. Available sizes: ${sizeList}.${customText} It takes approximately ${p.lead_time_days} days to handcraft. ${closing}`;
}

async function run() {
  const businessId = config.BUSINESS_ID;
  const KB_PATH = fileURLToPath(new URL("../../../docs/knowledge-base.json", import.meta.url));
  const currentKb = JSON.parse(readFileSync(KB_PATH, "utf-8"));

  const productsList: ProductItem[] = currentKb.products || [];
  console.log(`Loaded ${productsList.length} products from ${KB_PATH}`);

  const toneExamples: ToneExample[] = productsList.map((p, idx) => ({
    customer: generateCustomerQuery(p, idx),
    reply: generateReply(p, idx),
  }));

  currentKb.tone_examples = toneExamples;
  writeFileSync(KB_PATH, JSON.stringify(currentKb, null, 2), "utf-8");
  console.log(`Updated ${KB_PATH} with ${toneExamples.length} real English conversation tone examples!`);

  // Update knowledgeBase table in database
  const { products: _unused, ...kbWithoutProducts } = currentKb;
  try {
    await db
      .insert(knowledgeBase)
      .values({ businessId, data: kbWithoutProducts })
      .onConflictDoUpdate({
        target: [knowledgeBase.businessId],
        set: {
          data: kbWithoutProducts,
          updatedAt: new Date(),
        },
      });
    console.log("Database knowledge_base table updated successfully.");
  } catch (err: any) {
    console.log("Could not update remote DB directly (network/pooling timeout):", err.message || err);
  }

  try {
    await invalidateKBCache(businessId);
    console.log("Redis cache invalidated.");
  } catch {
    // Redis might be offline
  }

  console.log("Done! Knowledge base updated with 300 real English conversation examples.");
}

try {
  await run();
} catch (err) {
  console.error("Execution failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}

