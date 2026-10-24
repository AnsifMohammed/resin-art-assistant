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
    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
    : t.urgent
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
      : "bg-surface-muted text-text-muted border border-border/60";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-10 font-medium",
        tone,
        className,
      )}
      title="Time left in the 24-hour reply window"
    >
      <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span className="sr-only">Reply window: </span>
      {t.label}
    </span>
  );
}
