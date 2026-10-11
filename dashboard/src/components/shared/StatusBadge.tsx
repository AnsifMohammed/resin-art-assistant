export type BadgeTone = "success" | "warning" | "danger" | "info" | "teal" | "violet" | "muted";

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  size?: "sm" | "md";
}

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-emerald-500/10 dark:bg-emerald-400/12",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  warning: {
    bg: "bg-amber-500/12 dark:bg-amber-400/14",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  danger: {
    bg: "bg-rose-500/12 dark:bg-rose-400/14",
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  info: {
    bg: "bg-blue-500/12 dark:bg-blue-400/14",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  teal: {
    bg: "bg-teal-500/12 dark:bg-teal-400/14",
    text: "text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  violet: {
    bg: "bg-violet-500/12 dark:bg-violet-400/14",
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  muted: {
    bg: "bg-stone-500/10 dark:bg-stone-400/10",
    text: "text-stone-700 dark:text-stone-300",
    dot: "bg-stone-400",
  },
};

export function StatusBadge({ label, tone = "muted", dot = false, className = "", size = "md" }: StatusBadgeProps) {
  const styles = TONE_STYLES[tone];
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full select-none ${styles.bg} ${styles.text} ${sizeClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden />}
      <span>{label}</span>
    </span>
  );
}

export function ConversationStateBadge({ state }: { state: string }) {
  switch (state) {
    case "ai_active":
      return <StatusBadge label="AI active" tone="success" dot />;
    case "escalated":
      return <StatusBadge label="Escalated" tone="danger" dot />;
    case "owner_handling":
      return <StatusBadge label="Human handling" tone="warning" dot />;
    case "paused":
      return <StatusBadge label="Paused" tone="muted" dot />;
    default:
      return <StatusBadge label={state} tone="muted" />;
  }
}

export function OrderStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <StatusBadge label="Pending" tone="warning" />;
    case "confirmed":
      return <StatusBadge label="Confirmed" tone="info" />;
    case "in_production":
      return <StatusBadge label="In production" tone="violet" />;
    case "ready":
      return <StatusBadge label="Ready" tone="teal" />;
    case "dispatched":
      return <StatusBadge label="Dispatched" tone="info" />;
    case "delivered":
      return <StatusBadge label="Delivered" tone="success" />;
    case "cancelled":
      return <StatusBadge label="Cancelled" tone="muted" />;
    default:
      return <StatusBadge label={status} tone="muted" />;
  }
}

export function RoleBadge({ role }: { role: "admin" | "staff" }) {
  if (role === "admin") {
    return <StatusBadge label="Admin" tone="success" size="sm" />;
  }
  return <StatusBadge label="Staff" tone="violet" size="sm" />;
}
