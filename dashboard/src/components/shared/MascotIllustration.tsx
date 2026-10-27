import { cn } from "../../lib/cn.ts";

export interface MascotIllustrationProps {
  size?: "default" | "compact";
  className?: string;
}

export function MascotIllustration({
  size = "default",
  className,
}: MascotIllustrationProps) {
  const sizeClasses = {
    default: "w-44 h-44 sm:w-48 sm:h-48",
    compact: "w-28 h-28",
  }[size];

  return (
    <div className={cn("relative inline-flex flex-col items-center justify-center select-none", className)}>
      <style>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes mascot-blink {
          0%, 82%, 100% { opacity: 0; }
          86%, 96% { opacity: 1; }
        }
        @keyframes mascot-shadow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(0.88); opacity: 0.15; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mascot-animated-float { animation: none !important; }
          .mascot-animated-blink { display: none !important; }
          .mascot-animated-shadow { animation: none !important; }
        }
      `}</style>

      {/* Floating Mascot Container */}
      <div
        className={cn(
          "relative mascot-animated-float aspect-square overflow-hidden rounded-2xl shadow-sm border border-border/60 bg-[#FAF7F2] dark:brightness-95",
          sizeClasses
        )}
        style={{
          animation: "mascot-float 3.5s ease-in-out infinite",
        }}
      >
        {/* Curious Frame (Base) */}
        <img
          src="/illustrations/astronaut-search-curious.jpg"
          alt="Searching robot mascot"
          className="w-full h-full object-contain"
          loading="lazy"
          draggable={false}
        />

        {/* Happy/Blinking Frame (Overlay) */}
        <img
          src="/illustrations/astronaut-search-happy.jpg"
          alt=""
          aria-hidden="true"
          className="mascot-animated-blink absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            animation: "mascot-blink 3.5s ease-in-out infinite",
          }}
          loading="lazy"
          draggable={false}
        />
      </div>

      {/* Breathing Ground Shadow */}
      <div
        className={cn(
          "mascot-animated-shadow rounded-full bg-stone-900/10 dark:bg-black/40 blur-xs mt-2.5",
          size === "default" ? "w-32 h-2.5" : "w-20 h-1.5"
        )}
        style={{
          animation: "mascot-shadow 3.5s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
