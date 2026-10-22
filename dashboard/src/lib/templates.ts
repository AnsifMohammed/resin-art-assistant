import type { TemplateCategory, TemplateChannel } from "../types/index.ts";

/** Same rules as backend/src/lib/templates.ts: {name} where name is \w+. */
const VARIABLE_RE = /\{(\w+)\}/g;

/** Body length limit per template channel ("both" = the stricter Instagram limit). */
export const TEMPLATE_MAX_LENGTH: Record<TemplateChannel, number> = {
  whatsapp: 1024,
  instagram: 1000,
  both: 1000,
};

/** Variables the server fills in on its own (still overridable). */
export const AUTO_FILLED_VARIABLES = ["customerName"] as const;

/** Variables offered as quick-insert pills in the template editor. */
export const COMMON_TEMPLATE_VARIABLES = [
  "customerName",
  "product",
  "amount",
  "trackingId",
  "deliveryDate",
  "advanceAmount",
  "balanceAmount",
  "eventName",
  "leadTime",
  "offerEndDate",
] as const;

export const templateCategoryLabels: Record<TemplateCategory, string> = {
  delivery: "Delivery",
  festive: "Festive",
  custom_order: "Custom order",
  payment: "Payment",
  general: "General",
};

export const templateChannelLabels: Record<TemplateChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  both: "Both channels",
};

/** Variable names in a template body, unique, in first-seen order. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(VARIABLE_RE)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Fill {variable} placeholders. Variables with no non-empty value stay as `{name}`
 * in the text and are listed in `missing` (matches the server).
 */
export function renderTemplate(body: string, vars: Record<string, string>): { text: string; missing: string[] } {
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

/** Split a body into text and {variable} parts, for highlighting. */
export function splitTemplateBody(body: string): Array<{ text: string; variable: string | null }> {
  const parts: Array<{ text: string; variable: string | null }> = [];
  let last = 0;
  for (const match of body.matchAll(VARIABLE_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: body.slice(last, index), variable: null });
    parts.push({ text: match[0], variable: match[1] ?? null });
    last = index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), variable: null });
  return parts;
}

/** "trackingId" → "Tracking id". */
export function variableLabel(name: string): string {
  const s = name.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
