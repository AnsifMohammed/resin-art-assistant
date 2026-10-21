// Message template helpers: {variable} placeholders and per-channel length limits.

export type TemplateChannel = "whatsapp" | "instagram" | "both";

/** Max body length per channel (WhatsApp template body / Instagram DM text). */
export const TEMPLATE_MAX_LENGTH = { whatsapp: 1024, instagram: 1000 } as const;

/** "both" must fit the stricter of the two channels. */
export function templateMaxLength(channel: TemplateChannel): number {
  return channel === "both"
    ? Math.min(TEMPLATE_MAX_LENGTH.whatsapp, TEMPLATE_MAX_LENGTH.instagram)
    : TEMPLATE_MAX_LENGTH[channel];
}

const VARIABLE_RE = /\{(\w+)\}/g;

/** Variable names in a template body, unique, in first-seen order. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(VARIABLE_RE)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Fill {variable} placeholders. Variables without a non-empty value are left
 * as `{name}` in the text and listed in `missing`.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(VARIABLE_RE, (placeholder, name: string) => {
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
    if (value === undefined || value.trim() === "") {
      if (!missing.includes(name)) missing.push(name);
      return placeholder;
    }
    return value;
  });
  return { text, missing };
}
