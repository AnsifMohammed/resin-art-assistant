"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function MaterialsShowcase() {
  const materials = [
    {
      id: "resin",
      name: "Artist-Grade Epoxy",
      subtitle: "Optical glass clarity with lifetime UV protection",
      desc: "We use high-viscosity, non-toxic casting resin with advanced UV inhibitors that prevent yellowing under indoor lighting for life.",
      color: "linear-gradient(135deg, #0C0A14 0%, #16131F 100%)",
      accent: "#E8912B",
    },
    {
      id: "flowers",
      name: "Preserved Botanical Petals",
      subtitle: "Dehydrated in silica to lock in natural hue",
      desc: "Bouquets and native wildflowers are hand-harvested and gently dehydrated in fine silica crystals to preserve their delicate cellular shapes.",
      color: "linear-gradient(135deg, #7C5BD9 0%, #16131F 100%)",
      accent: "#7C5BD9",
    },
    {
      id: "gold",
      name: "24K Imitation Gold Leaf",
      subtitle: "Micro-flake leafing floating between liquid resin waves",
      desc: "Featherweight gold leaf foils are hand-placed between liquid layers, creating shimmering metallic highlights that catch ambient light.",
      color: "linear-gradient(135deg, #C9A227 0%, #1A1620 100%)",
      accent: "#C9A227",
    },
    {
      id: "wood",
      name: "Seasoned Teak Wood",
      subtitle: "Sustainably sourced timber bases with live grain",
      desc: "Solid native teak slabs kiln-dried and carved with bevelled edges, providing natural warmth and moisture-safe stability for heavy clocks.",
      color: "linear-gradient(135deg, #0E7C7B 0%, #0C0A14 100%)",
      accent: "#0E7C7B",
    },
  ];

  const [activeMaterial, setActiveMaterial] = useState(materials[0]!);

  return (
    <section className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left: Material Selector */}
        <div className="lg:col-span-7 space-y-6">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Honest Raw Elements
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
            Sourced for longevity.
          </h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-lg">
            A piece is only as durable as the materials inside it. We never use cheap polyester resin or untreated moisture-prone wood.
          </p>

          <div className="space-y-4 pt-4">
            {materials.map((mat) => {
              const isActive = activeMaterial.id === mat.id;
              return (
                <div
                  key={mat.id}
                  onMouseEnter={() => setActiveMaterial(mat)}
                  className={`cursor-pointer rounded-2xl p-5 border transition-all duration-300 ${
                    isActive
                      ? "border-[var(--primary)] bg-[var(--surface-muted)] shadow-md translate-x-2"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-serif text-lg font-semibold text-[var(--text)]">
                      {mat.name}
                    </h3>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: mat.accent }}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">
                    {mat.subtitle}
                  </p>
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="text-xs text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border)] leading-relaxed"
                    >
                      {mat.desc}
                    </motion.p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Macro Photo Placeholder Presentation */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="relative aspect-4/5 w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border)] shadow-2xl flex flex-col justify-end p-8 bg-[var(--surface-muted)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMaterial.id}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1.0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex flex-col justify-between p-8"
                style={{ background: activeMaterial.color }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
                  Macro Studio View
                </span>
                <div className="glass-surface p-4 rounded-xl border border-white/10 text-white">
                  <h4 className="font-serif text-base font-semibold">{activeMaterial.name}</h4>
                  <p className="text-xs text-white/80 mt-1">{activeMaterial.subtitle}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
