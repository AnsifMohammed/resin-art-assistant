import { BellOff, Clock, Repeat, Sparkles } from "lucide-react";
import type { CustomerListItem } from "../../types/index.ts";
import { SegmentBadge } from "./SegmentBadge.tsx";

const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium";

/** Muted "Opted out" marker: the customer will not receive broadcasts. */
export function OptedOutBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${chip} bg-surface-muted text-text-muted border border-border ${className}`}
      title="Opted out: won't receive broadcasts"
    >
      <BellOff size={11} />
      <span>Opted out</span>
    </span>
  );
}

/**
 * Segment chips for a customer: favourite, priority, repeat buyer, new, inactive, opted out.
 * (previous_buyers / never_ordered are implied by the orders count, so they are not repeated here.)
 */
export function CustomerSegmentChips({
  customer,
  className = "",
}: {
  customer: Pick<CustomerListItem, "isFavourite" | "isPriority" | "optedOut" | "segments">;
  className?: string;
}) {
  const has = (s: CustomerListItem["segments"][number]) => customer.segments.includes(s);
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {customer.isFavourite && <SegmentBadge type="favourite" />}
      {customer.isPriority && <SegmentBadge type="priority" />}
      {has("repeat_buyers") && (
        <span className={`${chip} bg-teal-500/10 text-teal-700 dark:text-teal-300`}>
          <Repeat size={11} />
          <span>Repeat buyer</span>
        </span>
      )}
      {has("new") && (
        <span className={`${chip} bg-blue-500/10 text-blue-700 dark:text-blue-300`}>
          <Sparkles size={11} />
          <span>New</span>
        </span>
      )}
      {has("inactive") && (
        <span className={`${chip} bg-stone-500/10 text-stone-700 dark:text-stone-300`}>
          <Clock size={11} />
          <span>Inactive</span>
        </span>
      )}
      {customer.optedOut && <OptedOutBadge />}
    </div>
  );
}
