import type { AiDecision } from "./types.ts";

export const ALWAYS_ESCALATE_INTENTS = [
  "complaint",
  "refund",
  "unknown",
  "off_topic",
  "payment",
];

export const ALWAYS_ESCALATE_PHRASES = [
  "i paid",
  "already paid",
  "payment done",
  "sent money",
  "where is my order",
  "not received",
  "damaged",
  "broken",
  "want refund",
  "cancel my order",
  "cheated",
  "fraud",
  "police",
  "consumer court",
];

export const AUTO_REPLY_ALLOWED_INTENTS = [
  "price",
  "delivery",
  "care",
  "custom_order",
];

export function applyRules(decision: AiDecision, rawText: string): AiDecision {
  const lower = rawText.toLowerCase();
  const phrase = ALWAYS_ESCALATE_PHRASES.find((p) => lower.includes(p));
  if (phrase) {
    return {
      ...decision,
      escalate: true,
      escalate_reason: "always_escalate_phrase",
    };
  }

  if (ALWAYS_ESCALATE_INTENTS.includes(decision.intent)) {
    let reason = `intent_${decision.intent}`;
    if (decision.intent === "payment") {
      reason = "payment_claim";
    } else if (decision.intent === "off_topic") {
      reason = "unapproved_intent";
    }

    return {
      ...decision,
      escalate: true,
      escalate_reason: reason,
    };
  }

  if (decision.missing_facts.length > 0) {
    return {
      ...decision,
      escalate: true,
      escalate_reason: "missing_facts",
    };
  }

  if (!AUTO_REPLY_ALLOWED_INTENTS.includes(decision.intent)) {
    return {
      ...decision,
      escalate: true,
      escalate_reason: "unapproved_intent",
    };
  }

  return decision;
}
