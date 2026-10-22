import type { BadgeTone } from "../components/shared/StatusBadge.tsx";
import type { BroadcastRecipientStatus, BroadcastStatus, BroadcastSummary } from "../types/index.ts";
import { humanize } from "./format.ts";

export const BROADCAST_STATUS_TONES: Record<BroadcastStatus, BadgeTone> = {
  draft: "muted",
  scheduled: "info",
  sending: "warning",
  sent: "success",
  cancelled: "muted",
  failed: "danger",
};

export const RECIPIENT_STATUS_TONES: Record<BroadcastRecipientStatus, BadgeTone> = {
  pending: "muted",
  sent: "info",
  delivered: "teal",
  read: "success",
  failed: "danger",
};

/** Messages that actually went out (a recipient's status only moves forward: sent → delivered → read). */
export function reachedCount(b: Pick<BroadcastSummary, "stats">): number {
  return b.stats.sent + b.stats.delivered + b.stats.read;
}

/** Delivered (incl. read) and read shares of the messages that went out; null when nothing went out. */
export function deliveryRates(b: Pick<BroadcastSummary, "stats" | "recipientCount">): {
  delivered: number | null;
  read: number | null;
} {
  const reached = reachedCount(b);
  if (b.recipientCount === 0 || reached === 0) return { delivered: null, read: null };
  return { delivered: (b.stats.delivered + b.stats.read) / reached, read: b.stats.read / reached };
}

/** "all_recipients_failed" → "All recipients failed"; Meta errors ("131026: …") are shown as-is. */
export function broadcastErrorLabel(error: string | null): string | null {
  if (!error) return null;
  return /^[a-z_]+$/.test(error) ? humanize(error) : error;
}
