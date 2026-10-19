import { Sparkles, Bot } from "lucide-react";
import { cn } from "../../lib/cn.ts";

/**
 * 1. ResinSpinner — The Cured Resin Orbital Spinner
 * Conic-arc spinner with glowing molten gold tip for buttons & micro-actions.
 */
interface ResinSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | undefined;
  className?: string | undefined;
  tone?: "primary" | "teal" | "current" | "white" | undefined;
  label?: string | undefined;
}

const SPINNER_SIZES = {
  xs: "w-3.5 h-3.5 border-[1.5px]",
  sm: "w-4 h-4 border-[2px]",
  md: "w-6 h-6 border-[2.5px]",
  lg: "w-8 h-8 border-[3px]",
  xl: "w-11 h-11 border-[3.5px]",
};

export function ResinSpinner({
  size = "md",
  tone = "primary",
  className,
  label = "Loading...",
}: ResinSpinnerProps) {
  const toneClasses = {
    primary: {
      track: "border-primary/20",
      head: "border-t-primary border-r-amber-400",
    },
    teal: {
      track: "border-teal/20",
      head: "border-t-teal border-r-teal-300",
    },
    current: {
      track: "border-current/20",
      head: "border-t-current border-r-current",
    },
    white: {
      track: "border-white/25",
      head: "border-t-white border-r-white/80",
    },
  }[tone];

  return (
    <div
      role="status"
      aria-label={label}
      className={cn("relative inline-flex items-center justify-center shrink-0 select-none", className)}
    >
      {/* Background Track */}
      <div className={cn("rounded-full", SPINNER_SIZES[size], toneClasses.track)} />
      {/* Animated Arc */}
      <div
        className={cn(
          "absolute rounded-full border-transparent animate-spin",
          SPINNER_SIZES[size],
          toneClasses.head
        )}
        style={{
          animationDuration: "750ms",
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}

/**
 * 2. PageResinLoader — The Resin Droplet Aura Splash Loader
 * Saba Art amber resin droplet logo with breathing caustics aura rings.
 */
export function PageResinLoader({
  title = "Saba Art",
  label = "Preparing dashboard...",
  compact = false,
}: {
  title?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center w-full text-center animate-in fade-in duration-300 select-none",
        compact ? "py-8" : "min-h-[40vh] py-12"
      )}
    >
      {/* Droplet & Aura Stack */}
      <div className="relative flex items-center justify-center w-16 h-16 mb-4">
        {/* Breathing aura rings */}
        <span
          className="absolute inset-0 rounded-2xl bg-primary/25 animate-ping opacity-75"
          style={{ animationDuration: "2.2s" }}
        />
        <span className="absolute -inset-1.5 rounded-2xl bg-primary/10 animate-pulse" />

        {/* Resin Drop Mark */}
        <div className="relative z-10 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 text-white shadow-lg shadow-amber-500/30">
          <Sparkles className="w-6 h-6 fill-white/20" />
        </div>
      </div>

      <h3 className="font-display font-bold text-base tracking-tight text-text">{title}</h3>
      <p className="text-xs text-text-muted mt-1 animate-pulse">{label}</p>
    </div>
  );
}

/**
 * 3. AITypingBeads — Fluid Resin Beads (AI Thinking & Typing)
 * Three animated organic fluid beads shifting between amber and ocean teal.
 */
export function AITypingBeads({
  label = "AI Thinking",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl rounded-tl-xs bg-primary-soft text-primary-text border border-primary/20 shadow-xs",
        className
      )}
    >
      <Bot className="w-3.5 h-3.5 text-primary shrink-0 opacity-90" />
      {label && <span className="text-[10px] font-bold tracking-wider uppercase mr-0.5 opacity-80">{label}</span>}
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce shadow-xs"
        style={{ animationDelay: "0ms", animationDuration: "900ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce shadow-xs"
        style={{ animationDelay: "150ms", animationDuration: "900ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-teal animate-bounce shadow-xs"
        style={{ animationDelay: "300ms", animationDuration: "900ms" }}
      />
    </div>
  );
}

/**
 * 4. LinearStreamBar — Top Stream Indeterminate Progress Bar
 * 2px Linear/Vercel-style amber-to-teal fluid stream across container top.
 */
export function LinearStreamBar({ active = true, className }: { active?: boolean; className?: string }) {
  if (!active) return null;
  return (
    <div className={cn("relative w-full h-[2.5px] bg-surface-muted overflow-hidden", className)}>
      <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-primary to-teal-400 animate-stream-flow" />
    </div>
  );
}

/**
 * 5. ResinProgressRing — Radial Molten Resin Ring
 * Radial SVG circle with gradient stroke and tabular readout.
 */
export function ResinProgressRing({
  progress = 75,
  size = 56,
  strokeWidth = 4.5,
  label,
}: {
  progress?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-muted fill-transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#resin-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500 fill-transparent"
        />
        <defs>
          <linearGradient id="resin-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold font-display text-text tabular-nums">{Math.round(progress)}%</span>
      </div>
      {label && <span className="text-[11px] text-text-muted mt-1">{label}</span>}
    </div>
  );
}

/**
 * 6. LivePulseBadge — Fluid Connection / Status Dot
 * Subtle pulse ring for connection status (Live WhatsApp, Escalation pending).
 */
export function LivePulseBadge({
  status = "live",
  label,
}: {
  status?: "live" | "syncing" | "paused";
  label?: string;
}) {
  const config = {
    live: {
      dot: "bg-emerald-500",
      ring: "bg-emerald-500/30",
      text: "text-emerald-700 dark:text-emerald-400",
      defaultLabel: "Live",
    },
    syncing: {
      dot: "bg-amber-500",
      ring: "bg-amber-500/30",
      text: "text-amber-700 dark:text-amber-400",
      defaultLabel: "Syncing",
    },
    paused: {
      dot: "bg-red-500",
      ring: "bg-red-500/30",
      text: "text-red-700 dark:text-red-400",
      defaultLabel: "Paused",
    },
  }[status];

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-muted border border-border">
      <span className="relative flex h-2 w-2">
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", config.ring)} />
        <span className={cn("relative inline-flex rounded-full h-2 w-2", config.dot)} />
      </span>
      <span className={config.text}>{label || config.defaultLabel}</span>
    </span>
  );
}

/**
 * 7. NormalSkeleton — Clean, neutral shimmer skeleton (surface-muted)
 */
export function NormalSkeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded-md bg-surface-muted", className)} aria-hidden />;
}

export const ResinSkeleton = NormalSkeleton;
