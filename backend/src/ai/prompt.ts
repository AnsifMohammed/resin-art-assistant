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

/** Pick top N tone examples most relevant to the customer's message using keyword overlap. */
export function pickRelevantToneExamples(
  toneExamples: Array<{ customer: string; reply: string }>,
  customerText: string,
  topN = 6,
): Array<{ customer: string; reply: string }> {
  if (!toneExamples || toneExamples.length === 0) return [];

  const words = customerText
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) return toneExamples.slice(0, topN);

  const scored = toneExamples.map((ex) => {
    const exLower = ex.customer.toLowerCase();
    const score = words.reduce((s, w) => s + (exLower.includes(w) ? 1 : 0), 0);
    return { ex, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.ex);
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
): Content[] {
  const relevant = history
    .filter((m) => m.senderType !== "system" && (m.content ?? "").trim() !== "")
    .slice(-limit);

  const turns: Array<{ role: "user" | "model"; content: string }> = relevant.map((m) => {
    const text = (m.content ?? "").trim();
    if (m.senderType === "customer") return { role: "user", content: text };
    return { role: "model", content: `${HUMAN_LABELS[m.senderType] ?? ""}${text}` };
  });
  turns.push({ role: "user", content: currentText });

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

export function buildSystemPrompt(
  kb: Record<string, unknown>,
  opts: { customerFirstName?: string | null; customerText?: string } = {},
): string {
  const businessName = typeof kb.business_name === "string" && kb.business_name ? kb.business_name : "the shop";
  const nameLine = opts.customerFirstName
    ? `The customer's first name is ${opts.customerFirstName}.`
    : "You don't know the customer's name; don't make one up.";

  // Strip tone_examples from the KB dump — we inject relevant ones separately
  const allToneExamples = Array.isArray(kb["tone_examples"])
    ? (kb["tone_examples"] as Array<{ customer: string; reply: string }>)
    : [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tone_examples: _, ...kbWithoutExamples } = kb;

  const relevantExamples = pickRelevantToneExamples(
    allToneExamples,
    opts.customerText ?? "",
    6,
  );

  // Use | delimiters to avoid conflicts with " inside tone example text
  const toneSection = relevantExamples.length > 0
    ? `\n[TONE EXAMPLES — style reference only, do not copy sentences]\n${relevantExamples
        .map((e, i) => `${i + 1}. Customer: |${e.customer.replace(/\|/g, "")}|\n   Reply: |${e.reply.replace(/\|/g, "")}|`)
        .join("\n")}`
    : "";

  return `You reply to customer messages on Instagram and WhatsApp for ${businessName}, a small handmade resin art business in Coimbatore, Tamil Nadu, India. Write as the shop ("we", "our"), the way the owner would reply from their phone.

[BUSINESS KNOWLEDGE BASE]
${JSON.stringify(kbWithoutExamples, null, 2)}${toneSection}

[TASK]
Read the conversation and the latest customer message, then respond with a strictly valid JSON object.
DO NOT include any markdown formatting, backticks (\`\`\`), or explanations. Output ONLY raw JSON.

[EXPECTED JSON OUTPUT SCHEMA]
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "product_info" | "business_info" | "greeting" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
  "reply": "the message to send, always in English",
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
3. Never use robotic or call-centre phrases such as: "How can I assist you today", "How can I help you today", "I can help you with", "Thank you for reaching out", "Is there anything else I can help you with", "I understand your concern", "Feel free to", "Dear customer", "As an AI", "I'm doing well".
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
- "price", "delivery", "care": answer from the knowledge base.
- "custom_order": if the customer asks WHETHER you can customise something, answer YES or NO from the knowledge base, then ask the one most useful follow-up (colour, name, size or city). Do NOT put customisation details in missing_facts — only escalate if the requested item is completely absent from the knowledge base.
- "product_info": the customer asks for the catalogue, what you sell, or which products, sizes or colours are available. Reply with a compact list from the knowledge base, one line per product, and EVERY line must include its price, like "Ocean Coaster Set of 4 – ₹1,200" (if a product has several sizes, write "from ₹<lowest price>"). Show at most 6 (pick the most relevant), then ask what they're looking for. If they specifically want photos, we can't send them from here: set escalate: true, escalate_reason: "missing_facts", missing_facts: ["product photos"].
- "business_info": payment methods, advance and balance rules, how ordering works, cancellation and return policy, delivery areas and courier, shop location or timings. Answer only what the knowledge base says; anything it doesn't cover goes to missing_facts.
- "greeting": greetings, small talk, short acknowledgements ("ok", "thanks", "super", "👍", "hi", "hello"). Greet back like a person ("Hi! 😊 What are you looking for?") without listing services. Set escalate: false, missing_facts: []. If a greeting comes with a real question, use the question's intent instead.

[MUST GO TO A HUMAN] (set escalate: true)
- "complaint" (damaged, wrong or late item, unhappy customer), "refund", and "payment" (the customer says they paid, sends payment proof, or has a payment problem; questions about payment METHODS are "business_info").
- "unknown" (you can't tell what they want) and "off_topic" (not about the shop).
- Anything the knowledge base doesn't cover: list it in missing_facts and set escalate_reason: "missing_facts".

[OTHER RULES]
- LANGUAGE: Always reply in English only, regardless of what language the customer writes in.
- SIZES & PRICING: Each size has its own price. When a customer doesn't name a size, list every size with its price; when they name one, quote only that one. Never invent a size or price. Format facts_used for product prices as "products.<slug>.sizes.<size name>.price: <price>".
- The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
- Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.`;
}

