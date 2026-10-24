import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn.ts";
import { humanize } from "../../lib/format.ts";
import type { ConvState, ConvTag, Role } from "../../types/index.ts";

/** Theme-aware soft tint colours with subtle borders. */
const stateColors: Record<ConvState, string> = {
  ai_active: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  escalated: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  owner_handling: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  paused: "bg-surface-muted text-text-muted border-border/70",
};

const roleColors: Record<Role, string> = {
  admin: "bg-primary-soft text-primary-text border-primary/25",
  staff: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
};

const tagColors: Record<ConvTag, string> = {
  new_lead: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  custom_order: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
  payment_pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  order_confirmed: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  follow_up: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
};

const stateLabels: Record<ConvState, string> = {
  ai_active: "AI active",
  escalated: "Escalated",
  owner_handling: "Owner handling",
  paused: "Paused",
};

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-10 font-medium transition-colors",
        "border-border/70 bg-surface-muted text-text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function StateBadge({ state, className }: { state: ConvState; className?: string }) {
  return <Badge className={cn(stateColors[state], className)}>{stateLabels[state]}</Badge>;
}

export function TagBadge({ tag, className }: { tag: ConvTag; className?: string }) {
  return <Badge className={cn(tagColors[tag], className)}>{humanize(tag)}</Badge>;
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <Badge className={cn(roleColors[role], className)}>{role === "admin" ? "Admin" : "Staff"}</Badge>;
}
