import { useEffect, useState, type ReactNode } from "react";
import { themeColors } from "../../theme/index.ts";

export interface StatCardProps {
  label: string;
  value: number | string;
  prefix?: string | undefined;
  suffix?: string | undefined;
  /** Omit (undefined) to hide the chip, e.g. when there is no previous-period value. */
  trend?: {
    /** e.g. "12%" (sign/arrow characters are stripped; the arrow comes from `direction`). */
    value: string;
    /** Good (emerald) or bad (rose) for the business. */
    isPositive: boolean;
    /** Arrow direction of the change. Defaults to up when positive, down otherwise. */
    direction?: "up" | "down";
    /** Shown in the tooltip as "vs {label}". */
    label?: string;
  } | undefined;
  color?: "amber" | "emerald" | "blue" | "violet" | "danger" | "teal";
  pulsingDot?: boolean;
  onClick?: () => void;
  className?: string;
  icon?: ReactNode;
  /** Marks the card as sample data: rendered as a tiny flask icon next to the label.
   *  Kept for compatibility; Analytics shows real data only and never passes it. */
  tag?: ReactNode;
  /** @deprecated  Radial ring removed — pass nothing; kept for compat. */
  radialProgress?: number;
}

const colorMap = {
  amber: {
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    sparklineStroke: themeColors.light.primary,
    sparklineFill: "rgba(245, 158, 11, 0.12)",
  },
  emerald: {
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    sparklineStroke: "#10B981",
    sparklineFill: "rgba(16, 185, 129, 0.12)",
  },
  blue: {
    accent: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    sparklineStroke: "#3B82F6",
    sparklineFill: "rgba(59, 130, 246, 0.12)",
  },
  violet: {
    accent: "text-violet-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    sparklineStroke: "#8B5CF6",
    sparklineFill: "rgba(139, 92, 246, 0.12)",
  },
  danger: {
    accent: "text-rose-500",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    sparklineStroke: themeColors.light.danger,
    sparklineFill: "rgba(225, 29, 72, 0.12)",
  },
  teal: {
    accent: "text-teal",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    sparklineStroke: themeColors.light.teal,
    sparklineFill: "rgba(15, 118, 110, 0.12)",
  },
};

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  trend,
  color = "amber",
  pulsingDot,
  onClick,
  className = "",
  icon,
  tag,
  // radialProgress kept for compat but no longer rendered
}: StatCardProps) {
  const c = colorMap[color];
  const [displayValue, setDisplayValue] = useState<string | number>(
    typeof value === "number" ? 0 : value
  );

  useEffect(() => {
    if (typeof value !== "number") {
      setDisplayValue(value);
      return;
    }
    const duration = 650;
    const end = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(end * ease);
      setDisplayValue(current);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);

  const formattedDisplay =
    typeof displayValue === "number"
      ? displayValue.toLocaleString("en-IN")
      : displayValue;

  // The caller omits `trend` when there is no previous-period value.
  const hasValidTrend = Boolean(trend?.value);
  const trendUp = trend ? (trend.direction ?? (trend.isPositive ? "up" : "down")) === "up" : true;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`@container relative p-4 lg:p-3 xl:p-4 rounded-xl border border-border bg-surface transition-all duration-200 outline-none select-none h-[104px] flex flex-col justify-between min-w-0 ${
        onClick
          ? "cursor-pointer hover:border-primary/50 hover:shadow-xs active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-primary"
          : ""
      } ${className}`}
    >
      {/* ─── Top Row: Icon + Label + sample flask + trend chip ──────────────────
            Narrow cards (< 12rem content) move the label to its own line below,
            so neither the label nor the value is ever truncated. */}
      <div className="flex items-center gap-1.5 shrink-0 min-w-0">
        {icon && (
          <div
            className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center ${c.bg} ${c.accent}`}
          >
            {icon}
          </div>
        )}
        {pulsingDot && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
        )}
        {/* Label — single line, full text in the tooltip (wide cards only) */}
        <span
          title={label}
          className="hidden @min-[12rem]:block text-11 uppercase tracking-wide font-semibold text-text-muted leading-tight truncate flex-1 min-w-0"
        >
          {label}
        </span>
        <span className="flex-1 @min-[12rem]:hidden" aria-hidden />
        {/* Sample indicator: tiny flask icon, no text, no wide pill */}
        {tag && (
          <span className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" title="Sample data">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
              aria-hidden
            >
              <path d="M9 3h6l2 6-5 13L7 9z" />
              <path d="M3 9h18" />
            </svg>
          </span>
        )}
        {/* Trend chip lives in the top row so the value gets the full card width */}
        {hasValidTrend && trend && (
          <span
            title={trend.label ? `vs ${trend.label}` : "vs previous period"}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 cursor-default whitespace-nowrap ${
              trend.isPositive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
            }`}
          >
            {trendUp ? "↑" : "↓"}
            <span>{trend.value.replace(/^[↑↓+\-\s]+/, "")}</span>
          </span>
        )}
      </div>

      {/* ─── Label line for narrow cards ─────────────────────────────────────── */}
      <span
        title={label}
        className="@min-[12rem]:hidden text-11 uppercase tracking-wide font-semibold text-text-muted leading-tight truncate min-w-0"
      >
        {label}
      </span>

      {/* ─── Bottom Row: Value (full width, never truncated) ─────────────────── */}
      <div className="flex items-baseline gap-0.5 mt-auto min-w-0 whitespace-nowrap">
        {prefix && (
          <span className="text-15 sm:text-[17px] lg:text-15 xl:text-[17px] font-semibold font-outfit text-text-muted">
            {prefix}
          </span>
        )}
        <span className="text-[22px] sm:text-28 lg:text-[22px] xl:text-28 font-bold font-outfit text-text tracking-tight leading-none">
          {formattedDisplay}
        </span>
        {suffix && (
          <span className="text-13 sm:text-15 lg:text-13 xl:text-15 font-semibold font-outfit text-text-muted ml-0.5">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
