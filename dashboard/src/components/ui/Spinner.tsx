import { cn } from "../../lib/cn.ts";

const sizes = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-10 w-10 border-[3px]" } as const;

export function Spinner({ size = "md", className, label = "Loading" }: { size?: keyof typeof sizes; className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block animate-spin rounded-full border-current border-r-transparent text-emerald-600", sizes[size], className)}
    />
  );
}

/** Centered spinner for whole-page or panel loading states. */
export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  );
}
