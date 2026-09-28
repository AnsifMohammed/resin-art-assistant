import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn.ts";
import { humanize } from "../../lib/format.ts";
import type { ConvState, ConvTag, Role } from "../../types/index.ts";

/** Exact colour maps from CLAUDE.md → "Dashboard UI patterns". */
export const stateColors: Record<ConvState, string> = {
  ai_active: "bg-emerald-100 text-emerald-800",
  escalated: "bg-red-100 text-red-800",
  owner_handling: "bg-amber-100 text-amber-800",
  paused: "bg-gray-100 text-gray-500",
};

export const roleColors: Record<Role, string> = {
  admin: "bg-emerald-100 text-emerald-800",
  staff: "bg-violet-100 text-violet-800",
};

/** Not specified in CLAUDE.md; chosen to stay distinct from the state colours. */
export const tagColors: Record<ConvTag, string> = {
  new_lead: "bg-sky-100 text-sky-800",
  custom_order: "bg-fuchsia-100 text-fuchsia-800",
  payment_pending: "bg-orange-100 text-orange-800",
  order_confirmed: "bg-teal-100 text-teal-800",
  follow_up: "bg-indigo-100 text-indigo-800",
};

export const stateLabels: Record<ConvState, string> = {
  ai_active: "AI active",
  escalated: "Escalated",
  owner_handling: "Owner handling",
  paused: "Paused",
};

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-gray-100 text-gray-700",
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
