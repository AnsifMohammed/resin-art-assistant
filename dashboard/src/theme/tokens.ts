/**
 * Centralized Design System Tokens for Saba Art
 * 
 * Provides unified theme colors, typography scales, font sizes, line heights,
 * and chart palettes across the entire application for both TypeScript and CSS.
 */

export const fontFamilies = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  outfit: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

/**
 * Centralized Font Size Scale
 * Maps both semantic names (xs, sm, base, lg, etc.) and numeric pixel equivalents (10, 11, 12, 13, etc.)
 */
export const fontSizes = {
  // Numeric tokens (used in Tailwind classes text-10, text-11, etc.)
  "10": { size: "0.625rem", lineHeight: "0.875rem", px: 10 },
  "11": { size: "0.6875rem", lineHeight: "1rem", px: 11 },
  "12": { size: "0.75rem", lineHeight: "1rem", px: 12 },
  "13": { size: "0.8125rem", lineHeight: "1.125rem", px: 13 },
  "14": { size: "0.875rem", lineHeight: "1.25rem", px: 14 },
  "15": { size: "0.9375rem", lineHeight: "1.375rem", px: 15 },
  "16": { size: "1rem", lineHeight: "1.5rem", px: 16 },
  "18": { size: "1.125rem", lineHeight: "1.75rem", px: 18 },
  "20": { size: "1.25rem", lineHeight: "1.75rem", px: 20 },
  "24": { size: "1.5rem", lineHeight: "2rem", px: 24 },
  "28": { size: "1.75rem", lineHeight: "2.25rem", px: 28 },
  "32": { size: "2rem", lineHeight: "2.5rem", px: 32 },
  "36": { size: "2.25rem", lineHeight: "2.75rem", px: 36 },

  // Semantic aliases
  micro: { size: "0.625rem", lineHeight: "0.875rem", px: 10 },
  badge: { size: "0.6875rem", lineHeight: "1rem", px: 11 },
  xs: { size: "0.75rem", lineHeight: "1rem", px: 12 },
  bodySmall: { size: "0.8125rem", lineHeight: "1.125rem", px: 13 },
  sm: { size: "0.875rem", lineHeight: "1.25rem", px: 14 },
  base: { size: "1rem", lineHeight: "1.5rem", px: 16 },
  lg: { size: "1.125rem", lineHeight: "1.75rem", px: 18 },
  xl: { size: "1.25rem", lineHeight: "1.75rem", px: 20 },
  "2xl": { size: "1.5rem", lineHeight: "2rem", px: 24 },
  "3xl": { size: "1.75rem", lineHeight: "2.25rem", px: 28 },
  "4xl": { size: "2rem", lineHeight: "2.5rem", px: 32 },
} as const;

export const themeColors = {
  light: {
    bg: "#FAFAF9",
    surface: "#FFFFFF",
    surfaceMuted: "#F5F5F4",
    border: "#E7E5E4",
    text: "#1C1917",
    textMuted: "#706963",
    primary: "#F59E0B",
    primaryForeground: "#1C1917",
    primaryText: "#B45309",
    primarySoft: "#FEF3C7",
    success: "#047857",
    warning: "#92400E",
    danger: "#B91C1C",
    info: "#1D4ED8",
    teal: "#0F766E",
    ring: "#F59E0B",
    cardShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)",
  },
  dark: {
    bg: "#0B1120",
    surface: "#111827",
    surfaceMuted: "#1A2335",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#F1F5F9",
    textMuted: "#94A3B8",
    primary: "#F59E0B",
    primaryForeground: "#0B1120",
    primaryText: "#FBBF24",
    primarySoft: "rgba(245, 158, 11, 0.12)",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
    info: "#60A5FA",
    teal: "#2DD4BF",
    ring: "#F59E0B",
    cardShadow: "inset 0 1px 0 rgb(255 255 255 / 0.04)",
  },
} as const;

export const brandChannels = {
  whatsapp: "#25D366",
  instagram: "#E4405F",
} as const;

/**
 * Cohesive color series for charts and visualizations
 */
export const chartPalette = {
  light: {
    primary: "#F59E0B",
    teal: "#0F766E",
    emerald: "#10B981",
    indigo: "#6366F1",
    rose: "#F43F5E",
    amber: "#D97706",
    grid: "transparent",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#E7E5E4",
    tooltipText: "#1C1917",
  },
  dark: {
    primary: "#F59E0B",
    teal: "#2DD4BF",
    emerald: "#34D399",
    indigo: "#818CF8",
    rose: "#FB7185",
    amber: "#FBBF24",
    grid: "transparent",
    tooltipBg: "#111827",
    tooltipBorder: "rgba(255, 255, 255, 0.1)",
    tooltipText: "#F1F5F9",
  },
} as const;

export type ThemeMode = "light" | "dark";

export interface ThemeTokens {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly primaryText: string;
  readonly primarySoft: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  readonly teal: string;
  readonly ring: string;
  readonly cardShadow: string;
}

export interface ChartPaletteTokens {
  readonly primary: string;
  readonly teal: string;
  readonly emerald: string;
  readonly indigo: string;
  readonly rose: string;
  readonly amber: string;
  readonly grid: string;
  readonly tooltipBg: string;
  readonly tooltipBorder: string;
  readonly tooltipText: string;
}

