import { ResinSpinner } from "../shared/Loaders.tsx";

export function Spinner({
  size = "md",
  className,
  label = "Loading",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  return <ResinSpinner size={size} className={className} label={label} />;
}

/** Centered spinner for whole-page or panel loading states. */
export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center">
      <ResinSpinner size="lg" label={label} />
    </div>
  );
}
