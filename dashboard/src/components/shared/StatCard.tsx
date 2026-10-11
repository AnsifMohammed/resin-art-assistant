import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { themeColors } from "../../theme/index.ts";

export interface StatCardProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  sparkline?: number[];
  color?: "amber" | "emerald" | "blue" | "violet" | "danger" | "teal";
  radialProgress?: number; // 0 - 100
  pulsingDot?: boolean;
  onClick?: () => void;
  className?: string;
  icon?: ReactNode;
  /** Small tag shown next to the label (e.g. <SampleDataBadge />). */
  tag?: ReactNode;
}

const colorMap = {
  amber: {
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    sparklineStroke: themeColors.light.primary,
    sparklineFill: "rgba(245, 158, 11, 0.15)",
  },
  emerald: {
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    sparklineStroke: "#10B981",
    sparklineFill: "rgba(16, 185, 129, 0.15)",
  },
  blue: {
    accent: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    sparklineStroke: "#3B82F6",
    sparklineFill: "rgba(59, 130, 246, 0.15)",
  },
  violet: {
    accent: "text-violet-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    sparklineStroke: "#8B5CF6",
    sparklineFill: "rgba(139, 92, 246, 0.15)",
  },
  danger: {
    accent: "text-danger",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    sparklineStroke: themeColors.light.danger,
    sparklineFill: "rgba(185, 28, 28, 0.15)",
  },
  teal: {
    accent: "text-teal",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    sparklineStroke: themeColors.light.teal,
    sparklineFill: "rgba(15, 118, 110, 0.15)",
  },
};



function MiniRadialRing({ progress, color }: { progress: number; color: string }) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="34" height="34" className="rotate-[-90deg]">
        <circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-border"
        />
        <circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-text">
        {Math.round(progress)}
      </span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  trend,
  color = "amber",
  radialProgress,
  pulsingDot,
  onClick,
  className = "",
  icon,
  tag,
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
    const start = 0;
    const end = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (end - start) * ease);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [value]);

  const formattedDisplay =
    typeof displayValue === "number"
      ? displayValue.toLocaleString("en-IN")
      : displayValue;

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
      className={`relative p-5 rounded-xl border border-border bg-surface transition-all duration-200 outline-none select-none h-full flex flex-col justify-between ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-border/80 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary"
          : ""
      } ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2 min-h-[28px] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {pulsingDot && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
          <span className="text-13 font-medium text-text-muted truncate">{label}</span>
          {tag}
        </div>

        {icon && (
          <div className={`p-1.5 rounded-lg shrink-0 ${c.bg} ${c.accent}`}>
            {icon}
          </div>
        )}

        {radialProgress !== undefined && (
          <div className="shrink-0">
            <MiniRadialRing progress={radialProgress} color={c.sparklineStroke} />
          </div>
        )}
      </div>

      {/* Main KPI Number */}
      <div className="flex-1 flex items-baseline gap-1 my-1">
        {prefix && (
          <span className="text-xl font-semibold font-outfit text-text-muted">
            {prefix}
          </span>
        )}
        <span className="text-32 md:text-36 font-bold font-outfit text-text tabular-nums tracking-tight">
          {formattedDisplay}
        </span>
        {suffix && (
          <span className="text-lg font-semibold font-outfit text-text-muted ml-0.5">
            {suffix}
          </span>
        )}
      </div>

      {/* Footer: Trend chip */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-3 min-h-[34px] shrink-0">
        {trend ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-12 font-medium tabular-nums shrink-0 ${
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
              {trend.value.replace(/^[↑↓+\-\s]+/, "")}
            </span>
            {trend.label && (
              <span className="text-11 text-text-muted truncate">
                {trend.label}
              </span>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
