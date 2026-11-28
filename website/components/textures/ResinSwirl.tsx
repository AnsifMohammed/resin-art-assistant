"use client";

import { useEffect, useState } from "react";

interface ResinSwirlProps {
  className?: string;
  opacity?: number;
}

export function ResinSwirl({ className = "", opacity = 0.06 }: ResinSwirlProps) {
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    // Check prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = setInterval(() => {
      setSeed((prev) => (prev >= 100 ? 1 : prev + 1));
    }, 3333); // ~0.3 fps drift

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <svg className="h-full w-full" preserveAspectRatio="none">
        <filter id={`resin-swirl-${seed}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves="3"
            seed={seed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="45"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <rect
          width="100%"
          height="100%"
          fill="url(#resin-gradient)"
          filter={`url(#resin-swirl-${seed})`}
        />
        <defs>
          <linearGradient id="resin-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
            <stop offset="40%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="70%" stopColor="var(--accent-2)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--gold-leaf)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
