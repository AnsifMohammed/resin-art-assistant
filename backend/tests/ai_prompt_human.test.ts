import { describe, expect, it } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv();

const { buildSystemPrompt, customerFirstName } = await import("../src/ai/prompt.ts");
const { applyRules } = await import("../src/ai/rules.ts");

describe("customerFirstName", () => {
  it.each([
    ["Priya Raman (@priya.r)", "123", "Priya"],
    ["vj allan (@vj_allan05)", "2201", "vj"],
    ["𝘼𝙣𝙨𝙞𝙁  🥀 (@ansif._390)", "1138", "AnsiF"],
    ["@only_handle", "1", null],
    ["2201488770401671", "2201488770401671", null],
    ["+91 98765 43210", "919876543210", null],
    [null, "x", null],
  ])("%s -> %s", (name, handle, expected) => {
    expect(customerFirstName(name, handle)).toBe(expected);
  });
});

describe("buildSystemPrompt", () => {
  const kb = { business_name: "Saba Art", products: [] };

  it("uses the business name and the customer's first name", () => {
    const prompt = buildSystemPrompt(kb, { customerFirstName: "Priya" });
    expect(prompt).toContain("for Saba Art");
    expect(prompt).toContain("The customer's first name is Priya.");
  });

  it("says the name is unknown when there is none", () => {
    expect(buildSystemPrompt(kb)).toContain("You don't know the customer's name");
  });
});

describe("new auto-reply intents", () => {
  const base = {
    reply: "x",
    facts_used: [],
    missing_facts: [],
    escalate: false,
    escalate_reason: null,
    suggested_tag: null,
    language_detected: "english" as const,
  };

  it.each(["product_info", "business_info"] as const)("%s auto-replies", (intent) => {
    expect(applyRules({ ...base, intent }, "Can you show me your catalogue").escalate).toBe(false);
  });

  it("product_info still escalates when facts are missing (e.g. photos)", () => {
    const res = applyRules({ ...base, intent: "product_info", missing_facts: ["product photos"] }, "send photos");
    expect(res.escalate).toBe(true);
    expect(res.escalate_reason).toBe("missing_facts");
  });
});
