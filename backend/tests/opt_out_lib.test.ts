import { describe, expect, it } from "vitest";
import { normalizeKeyword, optKeywordAction } from "../src/lib/optOut.ts";

describe("normalizeKeyword", () => {
  it("trims, lowercases, collapses spaces and strips trailing punctuation", () => {
    expect(normalizeKeyword("  STOP!!  ")).toBe("stop");
    expect(normalizeKeyword("Stop   All.")).toBe("stop all");
    expect(normalizeKeyword("unsubscribe?!")).toBe("unsubscribe");
  });
});

describe("optKeywordAction", () => {
  it.each(["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "stop all", "Stop All!", "நிறுத்து", " நிறுத்து! "])(
    "%j opts out",
    (text) => {
      expect(optKeywordAction(text, false)).toBe("opt_out");
      expect(optKeywordAction(text, true)).toBe("opt_out");
    },
  );

  it("START opts back in only when the customer is opted out", () => {
    expect(optKeywordAction("START", true)).toBe("opt_in");
    expect(optKeywordAction("start!", true)).toBe("opt_in");
    expect(optKeywordAction("START", false)).toBeNull();
  });

  it.each([
    "please stop sending me offers",
    "stop the order",
    "stopping by tomorrow",
    "start my order",
    "How much is the ocean coaster set?",
    "",
  ])("ignores normal text %j", (text) => {
    expect(optKeywordAction(text, false)).toBeNull();
    expect(optKeywordAction(text, true)).toBeNull();
  });

  it("ignores missing text", () => {
    expect(optKeywordAction(null, false)).toBeNull();
    expect(optKeywordAction(undefined, true)).toBeNull();
  });
});
