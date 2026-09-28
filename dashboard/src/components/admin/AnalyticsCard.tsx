import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn.ts";

/** Single metric card. */
export function AnalyticsCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-gray-500">{label}</p>
        {Icon && (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-red-500" : "text-gray-400",
            )}
            aria-hidden
          />
        )}
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sublabel && <p className="mt-1 truncate text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}
