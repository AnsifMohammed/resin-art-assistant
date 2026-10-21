import { describe, expect, it } from "vitest";
import {
  extractVariables,
  renderTemplate,
  TEMPLATE_MAX_LENGTH,
  templateMaxLength,
} from "../src/lib/templates.ts";

describe("extractVariables", () => {
  it("returns unique names in first-seen order", () => {
    expect(extractVariables("Hi {customerName}, {product} for ₹{amount}. Bye {customerName}")).toEqual([
      "customerName",
      "product",
      "amount",
    ]);
  });

  it("ignores text without valid placeholders", () => {
    expect(extractVariables("No vars here")).toEqual([]);
    expect(extractVariables("{} { spaced } {with-dash}")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("fills every placeholder (including repeats)", () => {
    expect(renderTemplate("Hi {name}, bye {name}", { name: "Meera" })).toEqual({
      text: "Hi Meera, bye Meera",
      missing: [],
    });
  });

  it("leaves missing or blank variables in place and lists them once", () => {
    expect(renderTemplate("{a} {b} {c} {b}", { a: "1", c: "  " })).toEqual({
      text: "1 {b} {c} {b}",
      missing: ["b", "c"],
    });
  });

  it("does not treat inherited object keys as values", () => {
    expect(renderTemplate("{toString}", {}).missing).toEqual(["toString"]);
  });

  it("does not interpret $ patterns in values", () => {
    expect(renderTemplate("Pay {amount}", { amount: "$& 500" }).text).toBe("Pay $& 500");
  });
});

describe("template length limits", () => {
  it("uses the channel limit, and the stricter one for both", () => {
    expect(TEMPLATE_MAX_LENGTH).toEqual({ whatsapp: 1024, instagram: 1000 });
    expect(templateMaxLength("whatsapp")).toBe(1024);
    expect(templateMaxLength("instagram")).toBe(1000);
    expect(templateMaxLength("both")).toBe(1000);
  });
});
