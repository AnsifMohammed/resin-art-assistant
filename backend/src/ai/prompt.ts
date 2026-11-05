import type { Content } from "@google/genai";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { knowledgeBase, products } from "../db/schema.ts";
import { redis } from "../lib/redis.ts";

export const KB_CACHE_KEY = (businessId: string) => `kb:${businessId}`;
export const KB_CACHE_TTL = 60 * 60; // 1 hour in seconds

export async function getKnowledgeBase(businessId: string): Promise<Record<string, unknown>> {
  const cached = await redis.get<Record<string, unknown>>(KB_CACHE_KEY(businessId));
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.businessId, businessId));

  if (!row) {
    throw new Error(`No knowledge base found for business ${businessId}`);
  }

  const productRows = await db
    .select()
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(products.isActive, true)))
    .orderBy(asc(products.sortOrder), asc(products.name));

  const mappedProducts = productRows.map((p) => ({
    id: p.slug,
    name: p.name,
    description: p.description,
    sizes: p.sizes,
    lead_time_days: p.leadTimeDays,
    customizable: p.customizable,
    custom_options: p.customOptions,
  }));

  const data: Record<string, unknown> = {
    ...(row.data as Record<string, unknown>),
    products: mappedProducts,
  };

  await redis.setex(KB_CACHE_KEY(businessId), KB_CACHE_TTL, JSON.stringify(data));
  return data;
}

export async function invalidateKBCache(businessId: string): Promise<void> {
  await redis.del(KB_CACHE_KEY(businessId));
}

export interface HistoryMessage {
  senderType: string;
  content: string | null;
}

/** How many prior messages (before the current batch) are sent to the model. */
export const HISTORY_LIMIT = 20;

const HUMAN_LABELS: Record<string, string> = {
  owner: "[Owner]: ",
  staff: "[Staff]: ",
};

/**
 * Build the Gemini `contents` array from prior conversation history plus the
 * current (batched) customer text.
 *
 * - Only the last `limit` non-system messages before the current batch are used.
 *   `history` must NOT include the current batch; it is appended once as the final user turn.
 * - customer -> user; ai/owner/staff -> model. Owner/staff text is labelled
 *   so the model knows a human replied.
 * - Consecutive same-role turns are merged and leading model turns dropped,
 *   so roles strictly alternate starting (and ending) with "user".
 */
export function buildConversationMessages(
  history: HistoryMessage[],
  currentText: string,
  limit: number = HISTORY_LIMIT,
  mediaUrls?: string[] | null,
): Content[] {
  const relevant = history
    .filter((m) => m.senderType !== "system" && (m.content ?? "").trim() !== "")
    .slice(-limit);

  const turns: Array<{ role: "user" | "model"; content: string }> = relevant.map((m) => {
    const text = (m.content ?? "").trim();
    if (m.senderType === "customer") return { role: "user", content: text };
    return { role: "model", content: `${HUMAN_LABELS[m.senderType] ?? ""}${text}` };
  });
  const currentTurnText =
    mediaUrls && mediaUrls.length > 0
      ? `${currentText}\n[Customer attached inspiration/reference photos: ${mediaUrls.join(", ")}]`.trim()
      : currentText;
  turns.push({ role: "user", content: currentTurnText });

  const merged: Array<{ role: "user" | "model"; content: string }> = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else if (merged.length === 0 && turn.role === "model") {
      // Multi-turn Gemini requests should start with a user turn.
      continue;
    } else {
      merged.push({ ...turn });
    }
  }

  return merged.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
}

/**
 * A first name to address the customer by, or null when we only know an id/handle.
 * Customer names look like "Priya Raman (@priya.r)", "@handle" or a numeric Instagram id.
 */
export function customerFirstName(name: string | null | undefined, handleOrPhone?: string | null): string | null {
  if (!name || name === handleOrPhone) return null;
  const withoutHandle = name.replace(/\s*\(@[^)]*\)\s*$/, "").trim();
  if (!withoutHandle || withoutHandle.startsWith("@") || /^[+\d\s-]+$/.test(withoutHandle)) return null;
  // NFKC turns styled Unicode letters (e.g. bold/italic "fonts") back into plain ones.
  const first = withoutHandle.normalize("NFKC").split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'-]/gu, "") ?? "";
  return first.length >= 2 ? first : null;
}

export interface BuildSystemPromptOptions {
  customerFirstName?: string | null | undefined;
  activeProductSlug?: string | null | undefined;
  activeEnquiry?: Record<string, unknown> | null | undefined;
}

export function buildSystemPrompt(
  kb: Record<string, unknown>,
  opts: BuildSystemPromptOptions = {},
): string {
  const businessName = typeof kb.business_name === "string" && kb.business_name ? kb.business_name : "the shop";
  const nameLine = opts.customerFirstName
    ? `The customer's first name is ${opts.customerFirstName}.`
    : "You don't know the customer's name; don't make one up.";

  const activeEnquiryContext =
    opts.activeProductSlug || opts.activeEnquiry?.productSlug
      ? `\n[CURRENT ACTIVE PRODUCT & ENQUIRY CONTEXT]
The customer is currently enquiring about:
- Product Slug: ${opts.activeProductSlug || (opts.activeEnquiry as any)?.productSlug}
- Product Name: ${(opts.activeEnquiry as any)?.productName || "Active Product"}
- Details collected so far: ${JSON.stringify(opts.activeEnquiry || {}, null, 2)}
* Maintain context for this product across turns! When the customer asks follow-up questions (e.g. "Can I get this in blue?", "How much for 3?", "What sizes do you have?", "Can you do gold foil?"), they are referring to this active product unless they explicitly ask for a different product.
* Progressively extract and update customer order requirements into "extracted_enquiry": { quantity, size, color, personalization, custom_notes, is_complete }.\n`
      : "";

  return `You reply to customer messages on Instagram and WhatsApp for ${businessName}, a small handmade resin art business in Coimbatore, Tamil Nadu, India. Write as the shop ("we", "our"), the way the owner would reply from their phone.
${activeEnquiryContext}
[BUSINESS KNOWLEDGE BASE]
${JSON.stringify(kb, null, 2)}

[TASK]
Read the conversation and the latest customer message, then respond with a strictly valid JSON object.
DO NOT include any markdown formatting, backticks (\`\`\`), or explanations. Output ONLY raw JSON.

[EXPECTED JSON OUTPUT SCHEMA]
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "product_info" | "business_info" | "greeting" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
  "reply": "the message to send, in the customer's language (English, Malayalam, or Manglish)",
  "send_catalogue": boolean, // optional: true when sharing visual product catalogue
  "catalogue_product_slugs": ["slug1", "slug2"], // optional: product slugs to share (or [] to share top products)
  "extracted_enquiry": { // optional: structured customer requirements extracted from the chat
    "quantity": number,
    "size": "string",
    "color": "string",
    "personalization": "string",
    "custom_notes": "string",
    "is_complete": boolean
  },
  "facts_used": ["fact 1", ...],
  "missing_facts": ["missing fact 1", ...],
  "escalate": boolean,
  "escalate_reason": "missing_facts" | "intent_unknown" | "intent_complaint" | "intent_refund" | "payment_claim" | "unapproved_intent" | null,
  "suggested_tag": "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up" | null,
  "language_detected": "english" | "malayalam" | "manglish"
}

[HOW TO WRITE: SOUND LIKE A REAL PERSON]
1. Match the customer. A short, casual message gets a short, casual reply (often one sentence). A detailed question gets a complete but still brief answer (at most 3 short sentences, or a short list).
2. Plain, warm, everyday Indian English, written like a chat message, not an email. Contractions are fine.
3. Never use robotic or call-centre phrases such as: "How can I assist you today", "I can help you with", "Thank you for reaching out", "Is there anything else I can help you with", "I understand your concern", "Feel free to", "Dear customer", "As an AI".
4. Don't introduce the shop or list what you can help with unless the customer asks what you do.
5. ${nameLine} Use the name now and then, not in every message.
6. Read the whole conversation: don't greet again or repeat information already given; carry on naturally from where it is.
7. Ask at most one natural follow-up question, only when it moves things forward (for example which colour, which size, or which city to deliver to).
8. Emojis: at most one, and not in every message.
9. The "tone_examples" in the knowledge base show the style only. Never copy their sentences.
10. Short acknowledgements ("ok", "thanks", "super", "👍"): reply briefly and naturally (for example "Most welcome! 😊"), or move to the next step if something is pending. Never re-introduce the shop.
11. If the customer asks whether they are talking to a bot or a real person, be honest: say you're the shop's assistant and someone from the team can join anytime.
12. Never invent anything. Every product, price, size, time, charge and policy you mention must come from the knowledge base.

[WHAT YOU CAN ANSWER YOURSELF]
- "price", "delivery", "care", "custom_order": answer from the knowledge base.
- "product_info": the customer asks for the catalogue, designs, what you sell, or which products, sizes or colours are available.
  * When they ask to see the catalogue, collection, designs, or photos: reply with a warm, friendly message (e.g. "Here is our handcrafted resin collection! Let me know which one catches your eye 😊"), set "send_catalogue": true, and set "catalogue_product_slugs": [...] with the relevant product slugs from the knowledge base (or [] to send featured products). Do NOT escalate for photos.
  * If they ask a general text question about what products you sell without requesting cards or visual catalogues: reply with a compact list from the knowledge base, one line per product, and EVERY line must include its price, like "Ocean Coaster Set of 4 – ₹1,200" (if a product has several sizes, write "from ₹<lowest price>"). Show at most 6 (pick the most relevant), then ask what they're looking for.
- "business_info": payment methods, advance and balance rules, how ordering works, cancellation and return policy, delivery areas and courier, shop location or timings. Answer only what the knowledge base says; anything it doesn't cover goes to missing_facts.
- "greeting": greetings, small talk and acknowledgements. Greet back like a person ("Hi! 😊 What are you looking for?") without listing services. If a greeting comes with a real question, use the question's intent instead.

[MUST GO TO A HUMAN] (set escalate: true)
- "complaint" (damaged, wrong or late item, unhappy customer), "refund", and "payment" (the customer says they paid, sends payment proof, or has a payment problem; questions about payment METHODS are "business_info").
- "unknown" (you can't tell what they want) and "off_topic" (not about the shop).
- Anything the knowledge base doesn't cover: list it in missing_facts and set escalate_reason: "missing_facts".

[OTHER RULES]
- LANGUAGE: Reply in the customer's language. If they write in Malayalam or Manglish, reply the same way.
- PRODUCT ENQUIRIES: When a customer enquires about a specific product (e.g. asking for sizes/prices, customization, or how to order/book a product):
  * You MUST explicitly address and name the product in your first sentence (for example: "For the 12 inch Resin Wall Clock, ...").
  * SIZES & PRICING: Each size has its own price. When a customer doesn't name a size, list every size with its price; when they name one, quote only that one. State the lead time in days and ask if they'd like to place an order or customize colors. Never invent a size or price. Format facts_used as "products.<slug>.sizes.<size name>.price: <price>".
  * CUSTOMIZATION: List the specific options available from custom_options (e.g., color shades, name/initials engraving, gold/silver foil, flower preservation, photos) and warmly ask what preferences they have in mind. If customizable is false (or custom_options is empty), politely explain that this item is a fixed design and cannot be customized. Format facts_used as "products.<slug>.custom_options: <options>".
  * ORDERING & BOOKING: When a customer asks how to order or book a product, explain the ordering process clearly (50% advance via UPI/GPay, production lead time, and balance before dispatch).
- The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
- Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.`;
}

