import { z } from "zod";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { ai, useMockDecisions, thinkingConfigFor } from "./pipeline.ts";
import { ALWAYS_ESCALATE_PHRASES } from "./rules.ts";

export const commentCategories = [
  "price",
  "custom_order",
  "availability",
  "compliment",
  "question",
  "complaint",
  "spam",
  "other",
] as const;

export type IgCommentCategory = (typeof commentCategories)[number];

export const commentClassificationSchema = z.object({
  category: z.enum(commentCategories),
  confidence: z.number().min(0).max(1),
});

export type CommentClassification = z.infer<typeof commentClassificationSchema>;

const { $schema: _s, ...commentClassificationJsonSchema } = z.toJSONSchema(commentClassificationSchema) as Record<string, unknown>;
export { commentClassificationJsonSchema };

const LOWER_ESCALATE_PHRASES = ALWAYS_ESCALATE_PHRASES.map((p) => p.toLowerCase());

type CategoryRule = [IgCommentCategory, string[], number];
const CATEGORY_KEYWORDS: CategoryRule[] = [
  ["complaint", ["waste", "bad quality", "cheat", "scam", "damaged", "broken", "worst", "fake", "terrible", "poor", "horrible", "fraud"], 0.95],
  ["price", ["price", "cost", "how much", "rate", "evlo", "rate pls", "₹", "rs", "விலை", "ethra", "ethraya", "rate please", "how much is this"], 0.95],
  ["custom_order", ["custom", "customize", "customise", "order", "want to buy", "name plaque", "personalize", "buy", "how to buy", "can you make", "wedding favor"], 0.9],
  ["availability", ["available", "avail", "in stock", "is this available", "undoo", "irukka", "still available"], 0.9],
  ["compliment", ["beautiful", "love", "wow", "😍", "❤️", "superb", "nice", "gorgeous", "awesome", "pretty", "lovely", "polichu", "super", "aesthetic", "🔥", "✨", "cuteness", "stunning"], 0.95],
  ["spam", ["dm to promote", "promote it on", "follow for follow", "crypto", "forex", "collab on", "send pic on", "check bio"], 0.95],
  ["question", ["where", "when", "ship to", "deliver to", "delivery time", "how long", "material", "size", "dimension", "?"], 0.85],
];

export function mockClassifyComment(text: string): CommentClassification {
  const lower = text.toLowerCase().trim();

  if (LOWER_ESCALATE_PHRASES.some((p) => lower.includes(p))) {
    return { category: "complaint", confidence: 0.99 };
  }

  for (const [category, keywords, confidence] of CATEGORY_KEYWORDS) {
    if (keywords.some((w) => lower.includes(w))) {
      return { category, confidence };
    }
  }

  return { category: "other", confidence: 0.5 };
}

/**
 * Classify an Instagram comment into one of the 8 categories.
 * On any error or timeout, safely falls back to category "other".
 */
export async function classifyComment(text: string): Promise<CommentClassification> {
  if (useMockDecisions || !ai) {
    return mockClassifyComment(text);
  }

  try {
    const prompt = `Classify this Instagram comment on a handmade resin art shop post: "${text}"`;
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          "Classify an Instagram comment on a handmade resin-art shop's post into one category: price, custom_order, availability, compliment, question, complaint, spam, other. Handle English, Tamil, Malayalam, Manglish, and emoji-only comments.",
        responseMimeType: "application/json",
        responseSchema: commentClassificationJsonSchema,
        maxOutputTokens: 200,
        temperature: 0.1,
        thinkingConfig: thinkingConfigFor(config.GEMINI_MODEL),
      },
    });

    const rawText = response.text?.trim() ?? "{}";
    const parsed = JSON.parse(rawText);
    return commentClassificationSchema.parse(parsed);
  } catch (err) {
    logger.warn({ err, text: text.slice(0, 50) }, "Failed to classify Instagram comment; falling back to other");
    return { category: "other", confidence: 0 };
  }
}
