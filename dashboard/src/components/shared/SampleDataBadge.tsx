import { FlaskConical } from "lucide-react";

interface SampleDataBadgeProps {
  className?: string;
  /** Tooltip text. */
  title?: string;
}

/** Marks UI that shows static sample data because no backend endpoint exists yet. */
export function SampleDataBadge({
  className = "",
  title = "Sample data: there is no backend endpoint for this yet",
}: SampleDataBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-text select-none ${className}`}
    >
      <FlaskConical size={11} aria-hidden />
      Sample data
    </span>
  );
}
