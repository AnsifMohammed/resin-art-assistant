import { humanize } from "./format.ts";
import type { Segment } from "../types/index.ts";

/** Languages offered in filters (customers.language is free text; these are the common values). */
export const CUSTOMER_LANGUAGES = ["english", "tamil", "malayalam", "manglish"] as const;

export function languageLabel(value: string | null | undefined): string {
  return value ? humanize(value) : "Unknown";
}

/** 1450 → "₹1,450"; keeps up to 2 decimals (en-IN grouping). */
export function formatRupees(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || !Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** One-line explanation of each segment rule (backend/src/lib/segments.ts). */
export const SEGMENT_DESCRIPTIONS: Record<Segment, string> = {
  all: "Every customer",
  favourites: "Starred customers",
  priority: "Marked as priority",
  previous_buyers: "At least 1 order",
  repeat_buyers: "2 or more orders",
  new: "Joined in the last 14 days",
  never_ordered: "No orders yet",
  inactive: "Last order over 90 days ago",
};
