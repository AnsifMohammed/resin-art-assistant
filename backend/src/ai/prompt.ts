import type { Content } from "@google/genai";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { knowledgeBase } from "../db/schema.ts";
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

  const data = row.data as Record<string, unknown>;
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
  return `You are an AI messaging assistant for a small handmade resin art business in Kerala, India.

[BUSINESS KNOWLEDGE BASE]
${JSON.stringify(kb, null, 2)}

[TASK]
Analyze incoming customer messages against the knowledge base and respond with a strictly valid JSON object.
DO NOT include any markdown formatting, backticks (\`\`\`), or explanations. Output ONLY raw JSON.

[EXPECTED JSON OUTPUT SCHEMA]
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
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
4. MISSING FACTS: If an item is NOT in the knowledge base, do not invent facts; list it in "missing_facts" and set escalate: true with escalate_reason: "missing_facts".
5. ESCALATIONS: Always escalate if the intent is complaint, refund, unknown, payment, or off_topic.
6. TONE: Warm, personal, friendly, polite, like a helpful small artisan business owner.
7. The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
8. Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.`;
}
