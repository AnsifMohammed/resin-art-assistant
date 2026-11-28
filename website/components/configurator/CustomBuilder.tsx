"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Undo,
  Redo,
  Share2,
  ShoppingBag,
  MessageCircle,
  Bookmark,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatINR, resolveDeliveryZone, calculateDispatchDate } from "@/lib/pricing";
import { useCartStore } from "@/lib/cartStore";
import { BRAND } from "@/lib/copy";

interface ConfigState {
  shape: "round" | "square" | "hexagon" | "geode";
  theme: "ocean" | "amethyst" | "emerald" | "marble";
  hasFlowers: boolean;
  flowerType: "roses" | "marigold" | "wildflowers";
  flowerDensity: number; // 1 to 5
  hasGoldFoil: boolean;
  foilIntensity: number; // 1 to 5
  engravedText: string;
  engravedFont: "serif" | "cursive" | "sans";
  sizeInches: number; // 12 or 16
  pincode: string;
}

const DEFAULT_CONFIG: ConfigState = {
  shape: "round",
  theme: "ocean",
  hasFlowers: true,
  flowerType: "wildflowers",
  flowerDensity: 3,
  hasGoldFoil: true,
  foilIntensity: 3,
  engravedText: "S & A",
  engravedFont: "serif",
  sizeInches: 12,
  pincode: "600001",
};

export function CustomBuilder() {
  const searchParams = useSearchParams();
  const addItem = useCartStore((s) => s.addItem);

  // Read URL initial parameters if present
  const rawShape = searchParams.get("shape");
  const rawTheme = searchParams.get("theme");
  const initialShape = (rawShape === "round" || rawShape === "square" || rawShape === "hexagon" || rawShape === "geode") ? rawShape : DEFAULT_CONFIG.shape;
  const initialTheme = (rawTheme === "ocean" || rawTheme === "amethyst" || rawTheme === "emerald" || rawTheme === "marble") ? rawTheme : DEFAULT_CONFIG.theme;

  const [config, setConfig] = useState<ConfigState>({
    ...DEFAULT_CONFIG,
    shape: initialShape,
    theme: initialTheme,
  });

  // Undo / Redo history stack (up to 20 steps)
  const [history, setHistory] = useState<ConfigState[]>([config]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Specular mouse tracking
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const previewRef = useRef<HTMLDivElement>(null);

  const updateConfig = (patch: Partial<ConfigState>) => {
    const next = { ...config, ...patch };
    const newHistory = history.slice(0, historyIndex + 1);
    if (newHistory.length >= 20) newHistory.shift();
    newHistory.push(next);

    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setConfig(next);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1]!;
      setHistoryIndex(historyIndex - 1);
      setConfig(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1]!;
      setHistoryIndex(historyIndex + 1);
      setConfig(next);
    }
  };

  // Keyboard shortcut for Cmd+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) {
          if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            const next = history[nextIndex];
            if (next) setConfig(next);
          }
        } else {
          if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            const prev = history[prevIndex];
            if (prev) setConfig(prev);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyIndex, history]);

  // Pricing calculations
  const basePrice = config.sizeInches === 12 ? 2800 : 4200;
  const flowerSurcharge = config.hasFlowers ? 200 : 0;
  const foilSurcharge = config.hasGoldFoil ? 150 : 0;
  const engravingSurcharge = config.engravedText.trim() ? 100 : 0;

  const delivery = resolveDeliveryZone(config.pincode);
  const total = basePrice + flowerSurcharge + foilSurcharge + engravingSurcharge + delivery.charge;
  const dispatchDate = calculateDispatchDate(7, true);

  const handleShareUrl = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("shape", config.shape);
    url.searchParams.set("theme", config.theme);
    navigator.clipboard.writeText(url.toString());
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSaveDraft = () => {
    localStorage.setItem("saba-config-draft", JSON.stringify(config));
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  const handleWhatsAppInquiry = () => {
    const text = `Hi Saba Art! I customized a piece on your website:%0A- Shape: ${config.shape}%0A- Theme: ${config.theme}%0A- Size: ${config.sizeInches}"%0A- Total: ₹${total}%0ACan we commission this?`;
    window.open(`${BRAND.whatsappUrl}?text=${text}`, "_blank");
  };

  const handleAddToCart = () => {
    addItem({
      slug: "resin-clock-12in",
      name: `Custom ${config.sizeInches}" Resin Wall Art`,
      sizeName: `${config.sizeInches} inch ${config.shape}`,
      unitPrice: basePrice + flowerSurcharge + foilSurcharge + engravingSurcharge,
      quantity: 1,
      leadTimeDays: 7,
      isCustomized: true,
      customDetails: {
        shape: config.shape,
        theme: config.theme,
        hasFlowers: config.hasFlowers,
        hasGoldFoil: config.hasGoldFoil,
        engraving: config.engravedText,
      },
    });
  };

  // Specular movement
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  // Theme gradient definitions
  const themeGradients = {
    ocean: "radial-gradient(circle at 40% 40%, #0E7C7B 0%, #0C0A14 85%)",
    amethyst: "radial-gradient(circle at 50% 50%, #7C5BD9 0%, #16131F 85%)",
    emerald: "radial-gradient(circle at 30% 60%, #0F766E 0%, #0C0A14 85%)",
    marble: "radial-gradient(circle at 40% 30%, #E8E3DB 0%, #1A1620 90%)",
  };

  return (
    <div className="mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-8 md:py-12">
      {/* Top Header & History Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6 mb-8">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Bespoke Studio Configurator
          </span>
          <h1 className="font-serif text-3xl font-bold text-[var(--text)] mt-1">
            Build your commission.
          </h1>
        </div>

        {/* Action Controls: Undo/Redo, Share, Draft, WhatsApp */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex === 0}
            aria-label="Undo (Cmd+Z)"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] disabled:opacity-30 hover:bg-[var(--surface-muted)]"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            aria-label="Redo (Cmd+Shift+Z)"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text)] disabled:opacity-30 hover:bg-[var(--surface-muted)]"
          >
            <Redo className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleShareUrl}
            className="btn-secondary h-9 px-3 text-xs"
          >
            {copiedUrl ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{copiedUrl ? "Link Copied" : "Share"}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="btn-secondary h-9 px-3 text-xs"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span>{draftSaved ? "Draft Saved" : "Save Draft"}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Pane Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: Live Procedural Canvas Preview */}
        <div className="lg:col-span-7 lg:sticky lg:top-24">
          <div
            ref={previewRef}
            onMouseMove={handleMouseMove}
            className="relative aspect-square w-full rounded-3xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-2xl flex items-center justify-center p-8 overflow-hidden select-none"
          >
            {/* Morphing Base Silhouette */}
            <motion.div
              layout
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="relative shadow-2xl transition-all duration-500 overflow-hidden flex items-center justify-center border-4 border-white/20"
              style={{
                width: config.sizeInches === 12 ? "280px" : "340px",
                height: config.sizeInches === 12 ? "280px" : "340px",
                background: themeGradients[config.theme],
                borderRadius:
                  config.shape === "round"
                    ? "9999px"
                    : config.shape === "square"
                    ? "28px"
                    : config.shape === "hexagon"
                    ? "20% 80% 20% 80% / 80% 20% 80% 20%"
                    : "45% 25% / 15% 45%",
              }}
            >
              {/* Specular Highlight tracking pointer */}
              <div
                className="pointer-events-none absolute inset-0 opacity-25 mix-blend-screen"
                style={{
                  background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.8) 0%, transparent 50%)`,
                }}
              />

              {/* Gold Flecks layer */}
              {config.hasGoldFoil && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-40 mix-blend-color-dodge"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 30% 40%, #C9A227 0%, transparent 40%), radial-gradient(circle at 70% 60%, #E3C14E 0%, transparent 35%)",
                  }}
                />
              )}

              {/* Preserved Flora scatter simulation */}
              {config.hasFlowers && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70">
                  <span className="text-[10px] tracking-widest uppercase font-serif text-white/60">
                    Preserved {config.flowerType}
                  </span>
                </div>
              )}

              {/* Live Engraved Text */}
              {config.engravedText && (
                <div
                  className={`absolute z-10 text-center tracking-wider text-white drop-shadow-md px-4 ${
                    config.engravedFont === "serif"
                      ? "font-serif text-xl"
                      : config.engravedFont === "cursive"
                      ? "font-serif italic text-2xl"
                      : "font-sans text-sm font-semibold uppercase tracking-[0.2em]"
                  }`}
                >
                  {config.engravedText}
                </div>
              )}
            </motion.div>

            {/* Spec Label */}
            <div className="absolute bottom-6 left-6 glass-surface px-4 py-2 rounded-xl border border-[var(--border)] text-xs text-[var(--text)]">
              <span className="font-semibold">{config.sizeInches}&quot; {config.shape}</span> · {config.theme} palette
            </div>
          </div>
        </div>

        {/* Right: Controls & Live Price Panel */}
        <div className="lg:col-span-5 space-y-8">
          {/* Sizing & Dimensions */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
              1. Diameter / Size
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[12, 16].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => updateConfig({ sizeInches: sz })}
                  className={`rounded-xl p-3.5 text-left border transition-all ${
                    config.sizeInches === sz
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span className="text-sm font-serif">{sz} inch</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                    {sz === 12 ? "₹2,800 base" : "₹4,200 base"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Silhouette Shape */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
              2. Base Silhouette
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(["round", "square", "hexagon", "geode"] as const).map((sh) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => updateConfig({ shape: sh })}
                  className={`rounded-lg py-2 text-xs font-medium border transition-colors capitalize ${
                    config.shape === sh
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] font-semibold"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  {sh}
                </button>
              ))}
            </div>
          </div>

          {/* Color Themes */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
              3. Liquid Swirl Theme
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: "ocean", label: "Ocean Waves & Foam" },
                { id: "amethyst", label: "Amethyst Purple Geode" },
                { id: "emerald", label: "Emerald Shore & Moss" },
                { id: "marble", label: "White & Gold Marble" },
              ].map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => updateConfig({ theme: th.id as ConfigState["theme"] })}
                  className={`rounded-lg p-3 text-left border text-xs transition-colors ${
                    config.theme === th.id
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botanical Petals & Gold Inlay */}
          <div className="space-y-4 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
                  Include Preserved Botanicals (+₹200)
                </span>
                <p className="text-xs text-[var(--text-muted)]">Real dehydrated flowers sealed inside.</p>
              </div>
              <input
                type="checkbox"
                checked={config.hasFlowers}
                onChange={(e) => updateConfig({ hasFlowers: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]">
                  24K Gold Leafing Flakes (+₹150)
                </span>
                <p className="text-xs text-[var(--text-muted)]">Gilded floating metallic accents.</p>
              </div>
              <input
                type="checkbox"
                checked={config.hasGoldFoil}
                onChange={(e) => updateConfig({ hasGoldFoil: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
              />
            </div>
          </div>

          {/* Live Name / Date Engraving */}
          <div className="space-y-3 pt-4 border-t border-[var(--border)]">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold uppercase tracking-wider text-[var(--text)]">
                Hand-Engraved Text (+₹100)
              </label>
              <span className="text-[var(--text-muted)]">{config.engravedText.length}/24</span>
            </div>
            <input
              type="text"
              maxLength={24}
              value={config.engravedText}
              onChange={(e) => updateConfig({ engravedText: e.target.value })}
              placeholder="e.g. S & A or Est. 2024"
              className="input-field text-sm"
            />
            <div className="flex gap-2">
              {(["serif", "cursive", "sans"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => updateConfig({ engravedFont: f })}
                  className={`flex-1 rounded-lg py-1.5 text-xs border capitalize ${
                    config.engravedFont === f
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Sticky Live Price Panel (Section 8 spec) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-3 shadow-lg">
            <h3 className="font-serif text-lg font-semibold text-[var(--text)] pb-2 border-b border-[var(--border)]">
              Commission Estimate
            </h3>

            <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
              <div className="flex justify-between">
                <span>Base ({config.sizeInches} inch Resin Wall Art)</span>
                <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(basePrice)}</span>
              </div>
              {config.hasFlowers && (
                <div className="flex justify-between">
                  <span>Dried botanical flora</span>
                  <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(flowerSurcharge)}</span>
                </div>
              )}
              {config.hasGoldFoil && (
                <div className="flex justify-between">
                  <span>Gold leaf inlay</span>
                  <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(foilSurcharge)}</span>
                </div>
              )}
              {config.engravedText.trim() && (
                <div className="flex justify-between">
                  <span>Name engraving</span>
                  <span className="tabular-nums font-medium text-[var(--text)]">{formatINR(engravingSurcharge)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery ({delivery.label.split(" ")[0]})</span>
                <span className="tabular-nums font-medium text-[var(--text)]">
                  {delivery.charge === 0 ? "FREE" : formatINR(delivery.charge)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border)] flex justify-between items-baseline font-serif text-lg font-bold text-[var(--text)]">
              <span>Total</span>
              <span className="tabular-nums text-2xl text-[var(--primary)]">{formatINR(total)}</span>
            </div>

            <div className="pt-1 text-xs text-[var(--text-muted)]">
              Dispatch by{" "}
              <strong className="text-[var(--text)]">
                {dispatchDate.toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </strong>
            </div>

            <div className="pt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleAddToCart}
                className="btn-primary w-full"
              >
                <ShoppingBag className="h-4 w-4" /> Add Commission to Cart
              </button>

              <button
                type="button"
                onClick={handleWhatsAppInquiry}
                className="btn-secondary w-full text-xs"
              >
                <MessageCircle className="h-4 w-4 text-[var(--accent)]" /> Discuss with Saba on WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
