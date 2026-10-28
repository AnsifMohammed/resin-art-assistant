import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import {
  isPlaceholderKey,
  thinkingConfigFor,
  GEMINI_TIMEOUT_MS,
  GEMINI_MAX_RETRIES,
} from "./pipeline.ts";
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

export const commentClassificationJsonSchema: Record<string, unknown> = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(commentClassificationSchema) as Record<string, unknown>;
  return schema;
})();

const useMockClassifier = config.DEMO_MODE && isPlaceholderKey(config.GEMINI_API_KEY);

const aiClient = useMockClassifier
  ? null
  : new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY,
      httpOptions: {
        timeout: GEMINI_TIMEOUT_MS,
        retryOptions: { attempts: GEMINI_MAX_RETRIES + 1, initialDelay: 1, maxDelay: 8 },
      },
    });

export function mockClassifyComment(text: string): CommentClassification {
  const lower = text.toLowerCase().trim();

  // 1. Complaint first (ALWAYS_ESCALATE_PHRASES or clear complaint keywords)
  if (ALWAYS_ESCALATE_PHRASES.some((p) => lower.includes(p.toLowerCase()))) {
    return { category: "complaint", confidence: 0.99 };
  }
  const complaintKeywords = [
    "waste",
    "bad quality",
    "cheat",
    "scam",
    "damaged",
    "broken",
    "worst",
    "fake",
    "terrible",
    "poor",
    "horrible",
    "fraud",
  ];
  if (complaintKeywords.some((w) => lower.includes(w))) {
    return { category: "complaint", confidence: 0.95 };
  }

  // 2. Price
  const priceKeywords = [
    "price",
    "cost",
    "how much",
    "rate",
    "evlo",
    "rate pls",
    "₹",
    "rs",
    "விலை",
    "ethra",
    "ethraya",
    "rate please",
    "how much is this",
  ];
  if (priceKeywords.some((w) => lower.includes(w))) {
    return { category: "price", confidence: 0.95 };
  }

  // 3. Custom order / order / buying
  const customKeywords = [
    "custom",
    "customize",
    "customise",
    "order",
    "want to buy",
    "name plaque",
    "personalize",
    "buy",
    "how to buy",
    "can you make",
    "wedding favor",
  ];
  if (customKeywords.some((w) => lower.includes(w))) {
    return { category: "custom_order", confidence: 0.9 };
  }

  // 4. Availability
  const availKeywords = [
    "available",
    "avail",
    "in stock",
    "is this available",
    "undoo",
    "irukka",
    "still available",
  ];
  if (availKeywords.some((w) => lower.includes(w))) {
    return { category: "availability", confidence: 0.9 };
  }

  // 5. Compliment
  const complimentKeywords = [
    "beautiful",
    "love",
    "wow",
    "😍",
    "❤️",
    "superb",
    "nice",
    "gorgeous",
    "awesome",
    "pretty",
    "lovely",
    "polichu",
    "super",
    "aesthetic",
    "🔥",
    "✨",
    "cuteness",
    "stunning",
  ];
  if (complimentKeywords.some((w) => lower.includes(w))) {
    return { category: "compliment", confidence: 0.95 };
  }

  // 6. Spam
  const spamKeywords = [
    "dm to promote",
    "promote it on",
    "follow for follow",
    "crypto",
    "forex",
    "collab on",
    "send pic on",
    "check bio",
  ];
  if (spamKeywords.some((w) => lower.includes(w))) {
    return { category: "spam", confidence: 0.95 };
  }

  // 7. Question
  const questionKeywords = [
    "where",
    "when",
    "ship to",
    "deliver to",
    "delivery time",
    "how long",
    "material",
    "size",
    "dimension",
    "?",
  ];
  if (questionKeywords.some((w) => lower.includes(w))) {
    return { category: "question", confidence: 0.85 };
  }

  return { category: "other", confidence: 0.5 };
}

/**
 * Classify an Instagram comment into one of the 8 categories.
 * On any error or timeout, safely falls back to category "other".
 */
export async function classifyComment(text: string): Promise<CommentClassification> {
  if (useMockClassifier || !aiClient) {
    return mockClassifyComment(text);
  }

  try {
    const prompt = `Classify this Instagram comment on a handmade resin art shop post: "${text}"`;
    const response = await aiClient.models.generateContent({
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
