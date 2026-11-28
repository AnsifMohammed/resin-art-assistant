"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function ConfiguratorTeaser() {
  const [shape, setShape] = useState<"round" | "square" | "geode">("round");
  const [theme, setTheme] = useState<"ocean" | "amethyst" | "emerald" | "gold">("ocean");

  const themes = {
    ocean: { name: "Ocean Waves", bg: "radial-gradient(circle, #0E7C7B 0%, #0C0A14 90%)", color: "#0E7C7B" },
    amethyst: { name: "Amethyst Geode", bg: "radial-gradient(circle, #7C5BD9 0%, #16131F 90%)", color: "#7C5BD9" },
    emerald: { name: "Emerald Shore", bg: "radial-gradient(circle, #0F766E 0%, #0C0A14 90%)", color: "#0F766E" },
    gold: { name: "Black & Gold Leaf", bg: "radial-gradient(circle, #C9A227 0%, #1A1620 90%)", color: "#C9A227" },
  };

  const currentTheme = themes[theme];

  return (
    <section className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28">
      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 md:p-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Controls Column */}
          <div className="lg:col-span-6 space-y-6">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)] flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> Interactive Builder
            </span>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl md:text-5xl leading-tight">
              Design a piece that&apos;s only yours.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">
              Every commission starts with choosing your silhouette and signature swirl palette. Test options live below, then open the full studio configurator to add custom dried blooms and engravings.
            </p>

            {/* Shape selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
                1. Choose Base Silhouette
              </label>
              <div className="flex gap-3">
                {(["round", "square", "geode"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setShape(s)}
                    className={`rounded-lg px-4 py-2 text-xs font-medium border transition-colors capitalize ${
                      shape === s
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    {s} Base
                  </button>
                ))}
              </div>
            </div>

            {/* Theme selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
                2. Select Liquid Palette
              </label>
              <div className="flex flex-wrap gap-2.5">
                {(Object.keys(themes) as Array<keyof typeof themes>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTheme(key)}
                    className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium border transition-colors ${
                      theme === key
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: themes[key].color }}
                    />
                    <span>{themes[key].name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <Link
                href={`/custom?shape=${shape}&theme=${theme}`}
                className="btn-primary"
              >
                <span>Open Full Custom Builder</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Interactive Preview Canvas */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="relative aspect-square w-full max-w-md flex items-center justify-center p-8 bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden">
              <motion.div
                layout
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative h-64 w-64 md:h-72 md:w-72 shadow-2xl transition-all duration-500 overflow-hidden flex items-center justify-center border-2 border-white/20"
                style={{
                  background: currentTheme.bg,
                  borderRadius:
                    shape === "round"
                      ? "9999px"
                      : shape === "square"
                      ? "24px"
                      : "50% 20% / 10% 40%",
                }}
              >
                {/* Simulated metallic foil scatter */}
                <div
                  className="absolute inset-0 opacity-40 mix-blend-overlay"
                  style={{
                    backgroundImage: "radial-gradient(circle at 40% 30%, #C9A227 0%, transparent 60%)",
                  }}
                />
                <span className="font-serif text-sm font-semibold tracking-wider text-white/90 drop-shadow-md">
                  {currentTheme.name}
                </span>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
