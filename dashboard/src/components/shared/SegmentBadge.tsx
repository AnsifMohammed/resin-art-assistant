import { Star, Zap, ShoppingBag, Sparkles, Clock } from "lucide-react";

interface SegmentBadgeProps {
  type: "favourite" | "priority" | "recent_order" | "new_lead" | "custom_order" | "payment_pending" | "order_confirmed" | "follow_up";
  className?: string;
}

export function SegmentBadge({ type, className = "" }: SegmentBadgeProps) {
  switch (type) {
    case "favourite":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 ${className}`}
          title="Favourite customer"
        >
          <Star size={11} className="fill-amber-500 text-amber-500" />
          <span>Favourite</span>
        </span>
      );
    case "priority":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 ${className}`}
          title="Priority VIP Customer"
        >
          <Zap size={11} className="fill-rose-500 text-rose-500" />
          <span>Priority</span>
        </span>
      );
    case "recent_order":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-700 dark:text-teal-300 ${className}`}
        >
          <ShoppingBag size={11} />
          <span>Recent order</span>
        </span>
      );
    case "new_lead":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 ${className}`}
        >
          <Sparkles size={11} />
          <span>New lead</span>
        </span>
      );
    case "custom_order":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/10 text-violet-700 dark:text-violet-300 ${className}`}
        >
          <span>Custom order</span>
        </span>
      );
    case "payment_pending":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 ${className}`}
        >
          <Clock size={11} />
          <span>Payment pending</span>
        </span>
      );
    case "order_confirmed":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ${className}`}
        >
          <span>Order confirmed</span>
        </span>
      );
    case "follow_up":
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-500/10 text-stone-700 dark:text-stone-300 ${className}`}
        >
          <span>Follow-up</span>
        </span>
      );
    default:
      return null;
  }
}
