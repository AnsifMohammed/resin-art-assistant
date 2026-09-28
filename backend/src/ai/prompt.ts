import type Anthropic from "@anthropic-ai/sdk";
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
 * Build the Anthropic `messages` array from prior conversation history plus the
 * current (batched) customer text.
 *
 * - Only the last `limit` non-system messages before the current batch are used.
 *   `history` must NOT include the current batch; it is appended once as the final user turn.
 * - customer -> user; ai/owner/staff -> assistant. Owner/staff text is labelled
 *   so the model knows a human replied.
 * - Consecutive same-role turns are merged and leading assistant turns dropped,
 *   so roles strictly alternate starting (and ending) with "user".
 */
export function buildConversationMessages(
  history: HistoryMessage[],
  currentText: string,
  limit: number = HISTORY_LIMIT,
): Anthropic.MessageParam[] {
  const relevant = history
    .filter((m) => m.senderType !== "system" && (m.content ?? "").trim() !== "")
    .slice(-limit);

  const turns: Array<{ role: "user" | "assistant"; content: string }> = relevant.map((m) => {
    const text = (m.content ?? "").trim();
    if (m.senderType === "customer") return { role: "user", content: text };
    return { role: "assistant", content: `${HUMAN_LABELS[m.senderType] ?? ""}${text}` };
  });
  turns.push({ role: "user", content: currentText });

  const merged: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else if (merged.length === 0 && turn.role === "assistant") {
      // The Anthropic API requires the first message to be from the user.
      continue;
    } else {
      merged.push({ ...turn });
    }
  }

  return merged;
}

export function buildSystemPrompt(kb: Record<string, unknown>): string {
  return `You are an AI messaging assistant for a small handmade resin art business in Kerala, India.
Here is the business knowledge base:
${JSON.stringify(kb, null, 2)}

Your task:
Analyze incoming customer messages against the knowledge base and respond with a strictly valid JSON object matching this schema:
{
  "intent": "price" | "delivery" | "care" | "custom_order" | "payment" | "complaint" | "refund" | "unknown" | "off_topic",
  "reply": "friendly customer reply in the customer's language (English, Malayalam, or Manglish)",
  "facts_used": ["fact 1", ...],
  "missing_facts": ["missing fact 1", ...],
  "escalate": boolean,
  "escalate_reason": string | null,
  "suggested_tag": "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up" | null,
  "language_detected": "english" | "malayalam" | "manglish"
}

Guidelines:
1. Language: Detect language accurately. If customer writes in Malayalam or Manglish, reply in that language matching tone examples.
2. Auto-reply intents: price, delivery, care, custom_order (if item exists in catalogue).
3. If an item is NOT in the knowledge base, do not invent facts; list it under "missing_facts" and set escalate: true with escalate_reason: "missing_facts".
4. If the intent is complaint, refund, unknown, payment, or off_topic, set escalate: true.
5. Tone: Warm, personal, friendly, polite, like a helpful small artisan business owner.
6. The latest user turn may contain several customer messages sent in quick succession (one per line). Answer them together in a single reply.
7. Earlier assistant turns prefixed with "[Owner]: " or "[Staff]: " were written by a human at the business, not by you. Stay consistent with them.
8. Return ONLY the JSON object. No markdown wrappers, no backticks, no explanations.`;
}
