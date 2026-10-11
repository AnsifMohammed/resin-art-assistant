interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-shimmer rounded-md bg-surface-muted ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="saba-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="w-24 h-4" />
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
      <Skeleton className="w-32 h-8" />
      <Skeleton className="w-20 h-4" />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border">
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="w-1/3 h-4" />
        <Skeleton className="w-1/2 h-3" />
      </div>
      <Skeleton className="w-20 h-6 rounded-full" />
    </div>
  );
}
