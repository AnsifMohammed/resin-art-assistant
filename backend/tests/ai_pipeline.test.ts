import { describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

// A real-looking key ("AIza" + 35 chars = 39) so the pipeline uses the (mocked) API
// instead of the demo keyword mock, even though DEMO_MODE=true.
const REAL_LOOKING_KEY = "AIza" + "SyD3mo_k3y-".padEnd(35, "x");
applyTestEnv({ GEMINI_API_KEY: REAL_LOOKING_KEY });

const generateContent = vi.fn();
const ctorOptions: any[] = [];
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
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

const textResponse = (text: string) => ({ text });


describe("AI pipeline", () => {
  it("uses the real API (not the keyword mock) in DEMO_MODE with a real key, with timeout and retries", () => {
    expect(REAL_LOOKING_KEY).toHaveLength(39);
    expect(pipeline.useMockDecisions).toBe(false);
    expect(ctorOptions[0]).toMatchObject({
      apiKey: REAL_LOOKING_KEY,
      httpOptions: { timeout: 20_000, retryOptions: { attempts: 3 } },
    });
    expect(pipeline.GEMINI_TIMEOUT_MS).toBe(20_000);
    expect(pipeline.GEMINI_MAX_RETRIES).toBe(2);
  });

  it("treats short or non-Google-format keys as placeholders", () => {
    expect(pipeline.isPlaceholderKey(undefined)).toBe(true);
    expect(pipeline.isPlaceholderKey("")).toBe(true);
    expect(pipeline.isPlaceholderKey("AIzaSy...")).toBe(true);
    expect(pipeline.isPlaceholderKey("AIza-test-key-for-gemini-API")).toBe(true);
    expect(pipeline.isPlaceholderKey("AIza" + "x".repeat(34))).toBe(true);
    expect(pipeline.isPlaceholderKey("x".repeat(60))).toBe(true);
    expect(pipeline.isPlaceholderKey("sk-" + "x".repeat(50))).toBe(true);
    expect(pipeline.isPlaceholderKey("AQ.short")).toBe(true);
    expect(pipeline.isPlaceholderKey(REAL_LOOKING_KEY)).toBe(false);
    expect(pipeline.isPlaceholderKey("AQ." + "x".repeat(50))).toBe(false);
  });

  it("requests JSON structured output derived from the Zod schema, low temperature, no thinking", async () => {
    generateContent.mockResolvedValue(textResponse("not json"));
    await pipeline.processAiDecision({ businessId: "b", incomingText: "hi" });
    const cfg = generateContent.mock.lastCall![0].config;
    expect(cfg).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(cfg.responseJsonSchema).toBe(pipeline.aiDecisionJsonSchema);
    expect(cfg.responseJsonSchema).not.toHaveProperty("$schema");
    expect(cfg.responseJsonSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["intent", "reply", "escalate", "language_detected"]),
    });
  });

  it("escalates with parse_error (no canned reply) when the API call fails", async () => {
    generateContent.mockImplementation(async () => {
      throw new Error("529 overloaded");
    });
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much is the ocean coaster set?" });
    expect(decision.escalate).toBe(true);
    expect(decision.escalate_reason).toBe("parse_error");
    expect(decision.reply).not.toContain("1,200");
  });

  it("escalates with parse_error on invalid JSON", async () => {
    generateContent.mockResolvedValue(textResponse("Sure! The coasters are ₹1,200."));
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much?" });
    expect(decision).toMatchObject({ escalate: true, escalate_reason: "parse_error" });
  });

  it("escalates with parse_error on schema-invalid JSON", async () => {
    generateContent.mockResolvedValue(textResponse(JSON.stringify({ intent: "price", reply: "hi" })));
    const decision = await pipeline.processAiDecision({ businessId: "b", incomingText: "How much?" });
    expect(decision).toMatchObject({ escalate: true, escalate_reason: "parse_error" });
  });

  it("returns a valid decision (with rules applied) and sends history without duplicating the current message", async () => {
    generateContent.mockResolvedValue(
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
    const sent = generateContent.mock.lastCall![0].contents;
    expect(sent).toEqual([{ role: "user", parts: [{ text: "Hi\n\nhow much is the ocean set?" }] }]);
  });
});

describe("AI pipeline logging (non-development)", () => {
  it("never logs the customer text or raw LLM output", async () => {
    const { logger } = await import("../src/lib/logger.ts");
    const spies = (["debug", "info", "warn", "error"] as const).map((lvl) => vi.spyOn(logger, lvl));

    generateContent.mockResolvedValue(textResponse("SECRET-LLM-OUTPUT not json"));
    await pipeline.processAiDecision({ businessId: "b", incomingText: "SECRET-CUSTOMER-TEXT" });
    generateContent.mockResolvedValue(textResponse(JSON.stringify({ intent: "price", reply: "SECRET-LLM-OUTPUT" })));
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
      { role: "user", parts: [{ text: "Do you ship to Kochi?" }] },
      { role: "model", parts: [{ text: "Yes, 3-5 days.\n\n[Owner]: I'll send photos\n\n[Staff]: Here they are" }] },
      { role: "user", parts: [{ text: "Thanks, how much?" }] },
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
    expect(out).toEqual([{ role: "user", parts: [{ text: "a\n\nb\n\nc" }] }]);
  });

  it("keeps only the last N history messages", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      senderType: i % 2 === 0 ? "customer" : "ai",
      content: `m${i}`,
    }));
    const out = buildConversationMessages(history, "now", 20);
    // last 20 = m10..m29 (m10 is customer), then "now" merges nothing (m29 is ai)
    expect(out[0]).toEqual({ role: "user", parts: [{ text: "m10" }] });
    expect(out).toHaveLength(21);
    expect(out.at(-1)).toEqual({ role: "user", parts: [{ text: "now" }] });
    for (let i = 1; i < out.length; i++) expect(out[i]!.role).not.toBe(out[i - 1]!.role);
  });
});
