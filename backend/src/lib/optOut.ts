// Opt-out / opt-in keywords sent by customers ("STOP", "START"). Pure helpers;
// the side effects live in services/optOut.ts.

/** A whole message equal to one of these (after normalizing) opts the customer out. */
export const OPT_OUT_KEYWORDS: readonly string[] = ["stop", "unsubscribe", "stop all", "நிறுத்து"];
/** A whole message equal to one of these opts a previously opted-out customer back in. */
export const OPT_IN_KEYWORDS: readonly string[] = ["start"];

export const OPT_OUT_ACK = "You won't receive offers from us anymore. Reply START to subscribe again.";
export const OPT_IN_ACK = "You're subscribed again 😊";

export type OptKeywordAction = "opt_out" | "opt_in";

/** Trim, lowercase, collapse inner whitespace and strip trailing punctuation ("STOP!!" → "stop"). */
export function normalizeKeyword(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s\p{P}]+$/u, "");
}

/**
 * What a customer message asks for, if anything. Only a message that is exactly
 * a keyword counts ("please stop sending offers" does not). START only applies
 * to a customer who is currently opted out; otherwise it is a normal message.
 */
export function optKeywordAction(text: string | null | undefined, optedOut: boolean): OptKeywordAction | null {
  if (!text) return null;
  const normalized = normalizeKeyword(text);
  if (OPT_OUT_KEYWORDS.includes(normalized)) return "opt_out";
  if (optedOut && OPT_IN_KEYWORDS.includes(normalized)) return "opt_in";
  return null;
}
