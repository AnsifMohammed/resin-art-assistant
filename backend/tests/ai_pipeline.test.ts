import { describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// A real-looking key (>= 40 chars, sk-ant- prefix) so the pipeline uses the (mocked) API
// instead of the demo keyword mock, even though DEMO_MODE=true.
applyTestEnv({ ANTHROPIC_API_KEY: "sk-ant-api03-" + "x".repeat(40) });

const create = vi.fn();
const ctorOptions: any[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(opts: any) {
      ctorOptions.push(opts);
    }
  },
}));

vi.mock("../src/ai/prompt.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ai/prompt.ts")>();
  return { ...actual, getKnowledgeBase: () => Promise.resolve({ products: [] }) };
});

const pipeline = await import("../src/ai/pipeline.ts");
const { buildConversationMessages } = await import("../src/ai/prompt.ts");

const textResponse = (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });


describe("AI pipeline", () => {
  it("uses the real API (not the keyword mock) in DEMO_MODE with a real key, with timeout and retries", () => {
    expect(pipeline.useMockDecisions).toBe(false);
    expect(ctorOptions[0]).toMatchObject({ timeout: 20_000, maxRetries: 2 });
  });

  it("treats short or non sk-ant- keys as placeholders", () => {
    expect(pipeline.isPlaceholderKey("sk-ant-test")).toBe(true);
    expect(pipeline.isPlaceholderKey("sk-ant-placeholder")).toBe(true);
    expect(pipeline.isPlaceholderKey("x".repeat(60))).toBe(true);
    expect(pipeline.isPlaceholderKey("")).toBe(true);
    expect(pipeline.isPlaceholderKey("sk-ant-api03-" + "x".repeat(40))).toBe(false);
  });

  it("escalates with parse_error (no canned reply) when the API call fails", async () => {
    create.mockImplementation(async () => {
      throw new Error("529 overloaded");
    });
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much is the ocean coaster set?" });
    expect(decision.escalate).toBe(true);
    expect(decision.escalate_reason).toBe("parse_error");
    expect(decision.reply).not.toContain("1,200");
  });

  it("escalates with parse_error on invalid JSON", async () => {
    create.mockResolvedValue(textResponse("Sure! The coasters are ₹1,200."));
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much?" });
    expect(decision).toMatchObject({ escalate: true, escalate_reason: "parse_error" });
  });

  it("escalates with parse_error on schema-invalid JSON", async () => {
    create.mockResolvedValue(textResponse(JSON.stringify({ intent: "price", reply: "hi" })));
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much?" });
    expect(decision).toMatchObject({ escalate: true, escalate_reason: "parse_error" });
  });

  it("returns a valid decision (with rules applied) and sends history without duplicating the current message", async () => {
    create.mockResolvedValue(
      textResponse(
        "```json\n" +
          JSON.stringify({
            intent: "price",
            reply: "The Ocean Coaster Set of 4 is ₹1,200.",
            facts_used: ["price"],
            missing_facts: [],
            escalate: false,
            escalate_reason: null,
            suggested_tag: "new_lead",
            language_detected: "english",
          }) +
          "\n```",
      ),
    );

    const decision = await pipeline.processAiDecision({
      businessId: "b",
      incomingText: "how much is the ocean set?",
      history: [{ senderType: "customer", content: "Hi" }],
    });

    expect(decision.escalate).toBe(false);
    const sent = create.mock.lastCall![0].messages;
    expect(sent).toEqual([{ role: "user", content: "Hi\n\nhow much is the ocean set?" }]);
  });
});

describe("AI pipeline logging (non-development)", () => {
  it("never logs the customer text or raw LLM output", async () => {
    const { logger } = await import("../src/lib/logger.ts");
    const spies = (["debug", "info", "warn", "error"] as const).map((lvl) => vi.spyOn(logger, lvl));

    create.mockResolvedValue(textResponse("SECRET-LLM-OUTPUT not json"));
    await pipeline.processAiDecision({ businessId: "b", incomingText: "SECRET-CUSTOMER-TEXT" });
    create.mockResolvedValue(textResponse(JSON.stringify({ intent: "price", reply: "SECRET-LLM-OUTPUT" })));
    await pipeline.processAiDecision({ businessId: "b", incomingText: "SECRET-CUSTOMER-TEXT" });

    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("SECRET-CUSTOMER-TEXT");
    expect(logged).not.toContain("SECRET-LLM-OUTPUT");
    expect(spies.some((s) => s.mock.calls.length > 0)).toBe(true);
    spies.forEach((s) => s.mockRestore());
  });
});

describe("buildConversationMessages", () => {
  it("maps roles, labels humans, skips system messages and appends the current text once", () => {
    const out = buildConversationMessages(
      [
        { senderType: "customer", content: "Do you ship to Kochi?" },
        { senderType: "ai", content: "Yes, 3-5 days." },
        { senderType: "system", content: "Conversation escalated" },
        { senderType: "owner", content: "I'll send photos" },
        { senderType: "staff", content: "Here they are" },
      ],
      "Thanks, how much?",
    );

    expect(out).toEqual([
      { role: "user", content: "Do you ship to Kochi?" },
      { role: "assistant", content: "Yes, 3-5 days.\n\n[Owner]: I'll send photos\n\n[Staff]: Here they are" },
      { role: "user", content: "Thanks, how much?" },
    ]);
  });

  it("merges consecutive same-role turns and drops leading assistant turns", () => {
    const out = buildConversationMessages(
      [
        { senderType: "owner", content: "Hello from the shop" },
        { senderType: "customer", content: "a" },
        { senderType: "customer", content: "b" },
      ],
      "c",
    );
    expect(out).toEqual([{ role: "user", content: "a\n\nb\n\nc" }]);
  });

  it("keeps only the last N history messages", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      senderType: i % 2 === 0 ? "customer" : "ai",
      content: `m${i}`,
    }));
    const out = buildConversationMessages(history, "now", 20);
    // last 20 = m10..m29 (m10 is customer), then "now" merges nothing (m29 is ai)
    expect(out[0]).toEqual({ role: "user", content: "m10" });
    expect(out).toHaveLength(21);
    expect(out.at(-1)).toEqual({ role: "user", content: "now" });
    for (let i = 1; i < out.length; i++) expect(out[i]!.role).not.toBe(out[i - 1]!.role);
  });
});
