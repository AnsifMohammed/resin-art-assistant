/**
 * Centralized Design System Tokens for Saba Art
 * 
 * Provides unified theme colors, brand channel colors and chart palettes for
 * TypeScript consumers (typography lives in index.css).
 */

export const themeColors = {
  light: {
    bg: "#FAFAF9",
    surface: "#FFFFFF",
    surfaceMuted: "#F5F5F4",
    border: "#E7E5E4",
    text: "#1C1917",
    textMuted: "#706963",
    primary: "#38C7D8",
    primaryForeground: "#FFFFFF",
    primaryText: "#0E7D8D",
    primarySoft: "rgba(56, 199, 216, 0.12)",
    success: "#047857",
    warning: "#92400E",
    danger: "#B91C1C",
    info: "#1D4ED8",
    teal: "#0F766E",
    ring: "#38C7D8",
    cardShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)",
  },
  dark: {
    bg: "#0B1120",
    surface: "#111827",
    surfaceMuted: "#1A2335",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#F1F5F9",
    textMuted: "#94A3B8",
    primary: "#38C7D8",
    primaryForeground: "#0B1120",
    primaryText: "#67E8F9",
    primarySoft: "rgba(56, 199, 216, 0.12)",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
    info: "#60A5FA",
    teal: "#2DD4BF",
    ring: "#38C7D8",
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
    primary: "#38C7D8",
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
    primary: "#38C7D8",
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

