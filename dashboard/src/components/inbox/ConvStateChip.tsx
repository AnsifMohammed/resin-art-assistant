import { AlertTriangle, Bot, PauseCircle, UserCheck } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import type { ConvState } from "../../types/index.ts";

const chip: Record<ConvState, { label: string; className: string; Icon: typeof Bot }> = {
  ai_active: {
    label: "AI active",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    Icon: Bot,
  },
  escalated: {
    label: "Escalated",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    Icon: AlertTriangle,
  },
  owner_handling: {
    label: "Human",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    Icon: UserCheck,
  },
  paused: {
    label: "Paused",
    className: "bg-surface-muted text-text-muted border-border/70",
    Icon: PauseCircle,
  },
};

/** Theme-aware conversation state chip (new design). */
export function ConvStateChip({ state, className }: { state: ConvState; className?: string }) {
  const { label, className: tone, Icon } = chip[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-10 font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
