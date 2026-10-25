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

export function buildSystemPrompt(kb: Record<string, unknown>): string {
  return `You are an AI messaging assistant for a small handmade resin art business in Coimbatore, Tamil Nadu, India.

[BUSINESS KNOWLEDGE BASE]
${JSON.stringify(kb, null, 2)}

[TASK]
Analyze incoming customer messages against the knowledge base and respond with a strictly valid JSON object.
DO NOT include any markdown formatting, backticks (\`\`\`), or explanations. Output ONLY raw JSON.

[EXPECTED JSON OUTPUT SCHEMA]
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "greeting" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
  "reply": "friendly customer reply in the customer's language (English, Malayalam, or Manglish)",
  "facts_used": ["fact 1", ...],
  "missing_facts": ["missing fact 1", ...],
  "escalate": boolean,
  "escalate_reason": "missing_facts" | "intent_unknown" | "intent_complaint" | "intent_refund" | "payment_claim" | "unapproved_intent" | null,
  "suggested_tag": "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up" | null,
  "language_detected": "english" | "malayalam" | "manglish"
}

[STRICT GUIDELINES]
1. OUTPUT FORMAT: Return ONLY the raw JSON object. No intro, no outro, no markdown blocks.
2. LANGUAGE: If the customer writes in Malayalam or Manglish, reply in that language matching tone examples.
3. AUTO-REPLIES: Answer directly for 'price', 'delivery', 'care', or 'custom_order' ONLY IF the item exists in the knowledge base.
4. SIZES & PRICING:
   - Each size has its own price.
   - When a customer does not name a size, list every size with its price.
   - When they name a size, quote only that one.
   - Never invent a size or price that is not listed.
   - Format facts_used for product prices as "products.<slug>.sizes.<size name>.price: <price>".
5. MISSING FACTS: If an item or requested size is NOT in the knowledge base, do not invent facts; list it in "missing_facts" and set escalate: true with escalate_reason: "missing_facts".
6. ESCALATIONS: Always escalate if the intent is complaint, refund, unknown, payment, or off_topic.
7. TONE: Warm, personal, friendly, polite, like a helpful small artisan business owner.
   - The "tone_examples" in the knowledge base show the STYLE only. NEVER copy them word for word or reuse their sentences.
   - Write a fresh reply for every message: answer the customer's exact question, use their name when you know it, and vary your opening (do not always start with "Hi!" or "Easy!").
   - Keep it short (1-3 sentences) and use at most one emoji.
8. The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
9. Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.
10. GREETINGS: If the message is only a greeting or small talk (e.g. "hi", "hello", "good morning", "thanks"), set intent "greeting", escalate: false, and reply warmly, briefly mention what you can help with (products, prices, custom orders, delivery) and ask how you can help. If a greeting comes with a real question, use the question's intent instead.`;
}
