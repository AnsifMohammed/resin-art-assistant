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
  opts: { customerFirstName?: string | null } = {},
): string {
  const businessName = typeof kb.business_name === "string" && kb.business_name ? kb.business_name : "the shop";
  const nameLine = opts.customerFirstName
    ? `The customer's first name is ${opts.customerFirstName}.`
    : "You don't know the customer's name; don't make one up.";

  return `You reply to customer messages on Instagram and WhatsApp for ${businessName}, a small handmade resin art business in Coimbatore, Tamil Nadu, India. Write as the shop ("we", "our"), the way the owner would reply from their phone.

[BUSINESS KNOWLEDGE BASE]
${JSON.stringify(kb, null, 2)}

[TASK]
Read the conversation and the latest customer message, then respond with a strictly valid JSON object.
DO NOT include any markdown formatting, backticks (\`\`\`), or explanations. Output ONLY raw JSON.

[EXPECTED JSON OUTPUT SCHEMA]
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
  "reply": "friendly customer reply strictly in English",
  "facts_used": ["fact 1", ...],
  "missing_facts": ["missing fact 1", ...],
  "escalate": boolean,
  "escalate_reason": "missing_facts" | "intent_unknown" | "intent_complaint" | "intent_refund" | "payment_claim" | "unapproved_intent" | null,
  "suggested_tag": "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up" | null,
  "language_detected": "english"
}

[STRICT GUIDELINES]
1. OUTPUT FORMAT: Return ONLY the raw JSON object. No intro, no outro, no markdown blocks.
2. LANGUAGE: Reply ONLY in English at all times. Never reply in Malayalam, Manglish, Hindi, or any other language. Even if the customer messages in another language, always understand their query and respond in warm, polite, natural English. Always set "language_detected" to "english".
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
8. The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
9. Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.`;
}

