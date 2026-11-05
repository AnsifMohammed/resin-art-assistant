import { describe, expect, it } from "vitest";
import { aiDecisionSchema } from "../src/ai/types.ts";
import { buildSystemPrompt, buildConversationMessages } from "../src/ai/prompt.ts";
import { sendWhatsAppInteractiveCard } from "../src/services/meta/whatsapp.ts";

describe("AI + Human Collaborative Catalogue & Enquiry System", () => {
  it("validates aiDecisionSchema with extracted_enquiry fields", () => {
    const validDecision = {
      intent: "custom_order",
      reply: "For the 12 inch Resin Wall Clock, we can customize with ocean blue waves and gold foil! Shall I proceed with 1 piece?",
      extracted_enquiry: {
        quantity: 1,
        size: "12 inch",
        color: "Ocean Blue",
        personalization: "Gold foil lettering",
        is_complete: true,
      },
      facts_used: ["products.resin-clock-12in.sizes.12 inch.price: 2400"],
      missing_facts: [],
      escalate: false,
      escalate_reason: null,
      suggested_tag: "custom_order",
      language_detected: "english",
    };

    const parsed = aiDecisionSchema.safeParse(validDecision);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.extracted_enquiry?.color).toBe("Ocean Blue");
      expect(parsed.data.extracted_enquiry?.is_complete).toBe(true);
    }
  });

  it("builds system prompt with active product context across turns", () => {
    const kb = {
      business_name: "Saba Art Assistant",
      products: [
        {
          slug: "letter-keychains",
          name: "Custom Letter Keychains",
          sizes: [{ name: "Standard", price: 299 }],
        },
      ],
    };

    const prompt = buildSystemPrompt(kb, {
      customerFirstName: "Priya",
      activeProductSlug: "letter-keychains",
      activeEnquiry: {
        productSlug: "letter-keychains",
        productName: "Custom Letter Keychains",
        color: "Navy Blue",
        quantity: 3,
      },
    });

    expect(prompt).toContain("CURRENT ACTIVE PRODUCT & ENQUIRY CONTEXT");
    expect(prompt).toContain("letter-keychains");
    expect(prompt).toContain("Custom Letter Keychains");
    expect(prompt).toContain("Navy Blue");
    expect(prompt).toContain("The customer's first name is Priya");
  });

  it("includes customer inspiration reference photos in conversation messages", () => {
    const messages = buildConversationMessages(
      [{ senderType: "customer", content: "Hi" }],
      "Can you make something like this?",
      5,
      ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    );

    expect(messages.length).toBeGreaterThan(0);
    const lastPart = messages[messages.length - 1]?.parts?.[0]?.text;
    expect(lastPart).toContain("Customer attached inspiration/reference photos");
    expect(lastPart).toContain("sample.jpg");
  });
});

