import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { buildConversationMessages, buildSystemPrompt, getKnowledgeBase, type HistoryMessage } from "./prompt.ts";
import { applyRules } from "./rules.ts";
import { aiDecisionSchema, type AiDecision } from "./types.ts";

const isDev = () => config.NODE_ENV === "development";

/** Anthropic request limits: fail fast and escalate instead of hanging the job. */
export const ANTHROPIC_TIMEOUT_MS = 20_000;
export const ANTHROPIC_MAX_RETRIES = 2;

/** A key that doesn't look like a real Anthropic key (dummy/placeholder values). */
export const isPlaceholderKey = (key: string | undefined) =>
  !key || !key.startsWith("sk-ant-") || key.length < 40;

/** The keyword mock is ONLY used in DEMO_MODE without a real API key. */
export const useMockDecisions = config.DEMO_MODE && isPlaceholderKey(config.ANTHROPIC_API_KEY);

const anthropic = useMockDecisions
  ? null
  : new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
      timeout: ANTHROPIC_TIMEOUT_MS,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    });

/**
 * Decision returned when the LLM call fails or its output can't be parsed.
 * Always escalates with parse_error; never sends a canned reply.
 */
export function parseErrorDecision(): AiDecision {
  return {
    intent: "unknown",
    reply: "(no reply: AI response unavailable)",
    facts_used: [],
    missing_facts: [],
    escalate: true,
    escalate_reason: "parse_error",
    suggested_tag: null,
    language_detected: "english",
  };
}

function mockDemoDecision(text: string): AiDecision {
  const lower = text.toLowerCase();

  if (lower.includes("refund")) {
    return {
      intent: "refund",
      reply: "I understand you are asking for a refund. Let me connect you with the business owner right away.",
      facts_used: ["policies.cancellation"],
      missing_facts: [],
      escalate: true,
      escalate_reason: "intent_refund",
      suggested_tag: "follow_up",
      language_detected: "english",
    };
  }

  if (lower.includes("paid") || lower.includes("payment")) {
    return {
      intent: "payment",
      reply: "Thank you for the update. Let me check your payment with the owner.",
      facts_used: [],
      missing_facts: [],
      escalate: true,
      escalate_reason: "always_escalate_phrase",
      suggested_tag: "payment_pending",
      language_detected: "english",
    };
  }

  if (lower.includes("ocean coaster set") || (lower.includes("coaster") && !text.includes("രൂപ"))) {
    return {
      intent: "price",
      reply: "Hi! 😊 The Ocean Coaster Set of 4 is ₹1,200. We can customise colours and add a name too! Lead time is about 5 days. Interested?",
      facts_used: ["products.ocean-coaster-set-4.price: 1200"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: "new_lead",
      language_detected: "english",
    };
  }

  if (lower.includes("daughter") || (lower.includes("clock") && lower.includes("custom"))) {
    return {
      intent: "custom_order",
      reply: "Of course! 💕 The 12 inch clock with her name is ₹2,800. Which colours does she like? I'll send some options!",
      facts_used: ["products.resin-clock-12in.price: 2800"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: "custom_order",
      language_detected: "english",
    };
  }

  if (lower.includes("bangalore") || lower.includes("deliver")) {
    return {
      intent: "delivery",
      reply: "Yes, we deliver all over India! 🚚 Bangalore takes 7-10 days, shipping is ₹120. Want to place an order?",
      facts_used: ["delivery.zones: Rest of India (7-10 days, ₹120)"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: "new_lead",
      language_detected: "english",
    };
  }

  if (lower.includes("table") || lower.includes("6 foot")) {
    return {
      intent: "custom_order",
      reply: "We'd love to help with custom pieces. Let me check with the owner about 6 foot resin table pricing and availability.",
      facts_used: [],
      missing_facts: ["6 foot resin table not in catalogue"],
      escalate: true,
      escalate_reason: "missing_facts",
      suggested_tag: "custom_order",
      language_detected: "english",
    };
  }

  if (text.includes("എത്ര") || text.includes("രൂപ") || lower.includes("keychain")) {
    return {
      intent: "price",
      reply: "Resin Keychain Set of 3 ₹450 ആണ് 😊 Colour, name, shape customise ചെയ്യാം. Interest ഉണ്ടോ?",
      facts_used: ["products.keychain-set-3.price: 450"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: "new_lead",
      language_detected: text.includes("രൂപ") ? "malayalam" : "manglish",
    };
  }

  if (lower.includes("care") || lower.includes("clean") || lower.includes("wash")) {
    return {
      intent: "care",
      reply: "Easy! Keep away from direct sunlight and heat, wipe with a dry cloth, don't soak in water. They'll last for years 🌸",
      facts_used: ["policies.care"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: null,
      language_detected: "english",
    };
  }

  return {
    intent: "unknown",
    reply: "Thank you for reaching out! Let me connect you with our team so we can help you with this.",
    facts_used: [],
    missing_facts: ["Intent not recognized in knowledge base"],
    escalate: true,
    escalate_reason: "intent_unknown",
    suggested_tag: "new_lead",
    language_detected: "english",
  };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function processAiDecision(params: {
  businessId: string;
  /** The current batch of customer text (one message per line). */
  incomingText: string;
  /** Prior messages BEFORE the current batch (the batch itself must not be included). */
  history?: HistoryMessage[];
}): Promise<AiDecision> {
  if (!anthropic) {
    logger.info(
      { businessId: params.businessId, incomingTextLength: params.incomingText.length },
      "Using demo mock decision (DEMO_MODE with placeholder Anthropic API key)",
    );
    return applyRules(mockDemoDecision(params.incomingText), params.incomingText);
  }

  let rawDecision: AiDecision;
  try {
    const kb = await getKnowledgeBase(params.businessId);
    const response = await anthropic.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: buildSystemPrompt(kb),
      messages: buildConversationMessages(params.history ?? [], params.incomingText),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn({ stopReason: response.stop_reason }, "LLM response had no text block, escalating (parse_error)");
      return parseErrorDecision();
    }

    // Message and LLM text are only logged in development (M7). Elsewhere: lengths only.
    if (isDev()) {
      logger.debug({ incomingText: params.incomingText, llmText: textBlock.text }, "LLM raw response");
    }

    let json: unknown;
    try {
      json = extractJson(textBlock.text);
    } catch {
      // SyntaxError messages quote the input, so never log the error itself.
      logger.warn({ llmTextLength: textBlock.text.length }, "LLM response was not valid JSON, escalating (parse_error)");
      return parseErrorDecision();
    }

    const validated = aiDecisionSchema.safeParse(json);
    if (!validated.success) {
      logger.warn(
        { issues: validated.error.issues.map((i) => ({ path: i.path.join("."), code: i.code })) },
        "LLM response failed schema validation, escalating (parse_error)",
      );
      return parseErrorDecision();
    }
    rawDecision = validated.data;
  } catch (err) {
    logger.error({ err }, "Anthropic API call or JSON parse failed, escalating (parse_error)");
    return parseErrorDecision();
  }

  return applyRules(rawDecision, params.incomingText);
}
