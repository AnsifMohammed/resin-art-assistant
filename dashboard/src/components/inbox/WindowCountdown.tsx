import { Clock } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { windowTimeLeft } from "../../lib/format.ts";
import { useNow } from "../../hooks/useNow.ts";

/** Time left in Meta's 24h customer-service window. Red under 2h, "Window closed" when past. Ticks every 30s. */
export function WindowCountdown({
  windowClosesAt,
  className,
}: {
  windowClosesAt: string | null | undefined;
  className?: string;
}) {
  const now = useNow(30_000);
  const t = windowTimeLeft(windowClosesAt, now);
  const tone = t.expired
    ? "bg-red-100 text-red-800"
    : t.urgent
      ? "bg-red-50 text-red-700 ring-1 ring-red-200"
      : "bg-gray-100 text-gray-700";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
      title="Time left in the 24-hour reply window"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Reply window: </span>
      {t.label}
    </span>
  );
}
