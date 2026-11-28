interface PourEdgeProps {
  className?: string;
  flip?: boolean;
  color?: string;
}

export function PourEdge({ className = "", flip = false, color = "var(--surface)" }: PourEdgeProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative w-full overflow-hidden leading-none ${className}`}
      style={{ transform: flip ? "rotate(180deg)" : "none" }}
    >
      <svg
        viewBox="0 0 1440 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="h-10 w-full md:h-14 lg:h-16"
      >
        <path
          d="M0,0 C220,48 440,16 680,38 C920,60 1180,22 1440,44 L1440,64 L0,64 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}
