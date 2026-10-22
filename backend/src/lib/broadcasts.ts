// Broadcast rules shared by routes/broadcasts.ts and the send-broadcast job.

import { extractVariables } from "./templates.ts";

/** Filled per recipient from the customer's name (falls back to the phone number). */
export const PER_RECIPIENT_VARIABLES = ["customerName"] as const;

interface TemplateLike {
  isActive: boolean;
  channel: "whatsapp" | "instagram" | "both";
  metaTemplateName: string | null;
  metaStatus: "not_submitted" | "pending" | "approved" | "rejected";
  body: string;
}

/** Only an active WhatsApp template approved by Meta may be broadcast. */
export function isBroadcastableTemplate(t: TemplateLike): boolean {
  return (
    t.isActive &&
    (t.channel === "whatsapp" || t.channel === "both") &&
    Boolean(t.metaTemplateName) &&
    t.metaStatus === "approved"
  );
}

/** Template variables (other than per-recipient ones) without a non-empty value. */
export function missingBroadcastVariables(body: string, variables: Record<string, string>): string[] {
  const perRecipient = new Set<string>(PER_RECIPIENT_VARIABLES);
  return extractVariables(body).filter((name) => {
    if (perRecipient.has(name)) return false;
    const value = Object.hasOwn(variables, name) ? variables[name] : undefined;
    return value === undefined || value.trim() === "";
  });
}
