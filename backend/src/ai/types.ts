import { z } from "zod";

export const intentEnum = z.enum([
  "price",
  "delivery",
  "care",
  "custom_order",
  "payment",
  "complaint",
  "refund",
  "unknown",
  "off_topic",
]);

export const tagEnum = z.enum([
  "new_lead",
  "custom_order",
  "payment_pending",
  "order_confirmed",
  "follow_up",
]);

export const languageEnum = z.enum(["english", "malayalam", "manglish"]);

export const aiDecisionSchema = z.object({
  intent: intentEnum,
  reply: z.string().min(1).max(2000),
  facts_used: z.array(z.string()),
  missing_facts: z.array(z.string()),
  escalate: z.boolean(),
  escalate_reason: z.string().nullable(),
  suggested_tag: tagEnum.nullable(),
  language_detected: languageEnum,
});

export type AiDecision = z.infer<typeof aiDecisionSchema>;
export type Intent = z.infer<typeof intentEnum>;
export type SuggestedTag = z.infer<typeof tagEnum>;
export type DetectedLanguage = z.infer<typeof languageEnum>;
