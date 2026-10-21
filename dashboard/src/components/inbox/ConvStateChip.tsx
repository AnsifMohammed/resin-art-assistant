import { AlertTriangle, Bot, PauseCircle, UserCheck } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import type { ConvState } from "../../types/index.ts";

const chip: Record<ConvState, { label: string; className: string; Icon: typeof Bot }> = {
  ai_active: {
    label: "AI active",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    Icon: Bot,
  },
  escalated: {
    label: "Escalated",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
    Icon: AlertTriangle,
  },
  owner_handling: {
    label: "Human",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Icon: UserCheck,
  },
  paused: {
    label: "Paused",
    className: "bg-surface-muted text-text-muted",
    Icon: PauseCircle,
  },
};

/** Theme-aware conversation state chip (new design). */
export function ConvStateChip({ state, className }: { state: ConvState; className?: string }) {
  const { label, className: tone, Icon } = chip[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
