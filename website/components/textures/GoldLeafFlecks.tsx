"use client";

import { motion } from "framer-motion";

interface GoldLeafFlecksProps {
  className?: string;
  count?: number;
}

export function GoldLeafFlecks({ className = "", count = 12 }: GoldLeafFlecksProps) {
  // Deterministic positions for aesthetic scatter
  const flecks = [
    { x: "12%", y: "18%", w: 14, h: 9, rot: 35 },
    { x: "28%", y: "45%", w: 9, h: 12, rot: -20 },
    { x: "42%", y: "12%", w: 16, h: 11, rot: 60 },
    { x: "65%", y: "24%", w: 11, h: 8, rot: 15 },
    { x: "82%", y: "60%", w: 15, h: 10, rot: -45 },
    { x: "18%", y: "78%", w: 10, h: 14, rot: 80 },
    { x: "55%", y: "82%", w: 13, h: 9, rot: -10 },
    { x: "74%", y: "15%", w: 8, h: 8, rot: 40 },
    { x: "88%", y: "38%", w: 14, h: 12, rot: 25 },
    { x: "35%", y: "68%", w: 12, h: 7, rot: -65 },
    { x: "6%", y: "52%", w: 9, h: 11, rot: 50 },
    { x: "92%", y: "85%", w: 15, h: 13, rot: -30 },
  ].slice(0, count);

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {flecks.map((f, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.6, scale: 0.9 }}
          animate={{
            opacity: [0.4, 0.85, 0.4],
            scale: [0.95, 1.05, 0.95],
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.25,
          }}
          className="absolute"
          style={{
            left: f.x,
            top: f.y,
            width: f.w,
            height: f.h,
            transform: `rotate(${f.rot}deg)`,
            background: "linear-gradient(135deg, #FDE68A 0%, #D97706 50%, #F59E0B 100%)",
            clipPath: "polygon(20% 0%, 80% 10%, 100% 70%, 70% 100%, 15% 90%, 0% 30%)",
            boxShadow: "0 0 4px rgba(201, 162, 39, 0.4)",
          }}
        />
      ))}
    </div>
  );
}
