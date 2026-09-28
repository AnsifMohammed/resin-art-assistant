import { describe, expect, it } from "vitest";
import { applyRules } from "../src/ai/rules.ts";
import type { AiDecision } from "../src/ai/types.ts";

describe("applyRules", () => {
  const baseDecision: AiDecision = {
    intent: "price",
    reply: "The ocean coaster set is ₹1,200.",
    facts_used: ["ocean-coaster-set-4.price: 1200"],
    missing_facts: [],
    escalate: false,
    escalate_reason: null,
    suggested_tag: "new_lead",
    language_detected: "english",
  };

  it("passes approved auto-reply intent without escalation", () => {
    const res = applyRules(baseDecision, "How much is the ocean coaster set?");
    expect(res.escalate).toBe(false);
    expect(res.escalate_reason).toBeNull();
  });

  it("escalates when intent is in ALWAYS_ESCALATE_INTENTS (e.g. refund, complaint)", () => {
    const refundDecision: AiDecision = {
      ...baseDecision,
      intent: "refund",
      reply: "Let me check on your refund.",
    };
    const res = applyRules(refundDecision, "Can I get a refund?");
    expect(res.escalate).toBe(true);
    expect(res.escalate_reason).toBe("intent_refund");
  });

  it("escalates when text contains an ALWAYS_ESCALATE_PHRASE regardless of LLM intent", () => {
    const res = applyRules(baseDecision, "I paid already for the ocean coaster set");
    expect(res.escalate).toBe(true);
    expect(res.escalate_reason).toBe("always_escalate_phrase");
  });

  it("escalates when missing_facts is not empty", () => {
    const missingFactsDecision: AiDecision = {
      ...baseDecision,
      missing_facts: ["6 foot resin table not in catalogue"],
    };
    const res = applyRules(missingFactsDecision, "How much for a 6 foot resin table?");
    expect(res.escalate).toBe(true);
    expect(res.escalate_reason).toBe("missing_facts");
  });

  it("escalates when intent is unknown or unapproved", () => {
    const unknownDecision: AiDecision = {
      ...baseDecision,
      intent: "unknown",
    };
    const res = applyRules(unknownDecision, "Random text");
    expect(res.escalate).toBe(true);
  });
});
