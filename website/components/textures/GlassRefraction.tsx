"use client";

interface GlassRefractionProps {
  className?: string;
}

export function GlassRefraction({ className = "" }: GlassRefractionProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute -inset-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.14) 48%, rgba(255, 255, 255, 0.22) 50%, rgba(255, 255, 255, 0.14) 52%, transparent 60%)",
          transform: "translateX(-100%)",
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}
