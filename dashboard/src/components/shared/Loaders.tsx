import { cn } from "../../lib/cn.ts";

/**
 * ResinSpinner — The Cured Resin Orbital Spinner
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
      head: "border-t-primary border-r-[#2BAFC0]",
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
