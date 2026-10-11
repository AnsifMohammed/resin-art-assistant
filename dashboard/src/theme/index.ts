export * from "./tokens.ts";

import { themeColors, chartPalette, type ThemeMode } from "./tokens.ts";

/**
 * Returns color tokens for the specified theme mode (or light by default)
 */
export function getThemeTokens(mode: ThemeMode = "light") {
  return themeColors[mode] ?? themeColors.light;
}

/**
 * Returns chart color palette for the specified theme mode
 */
export function getChartPalette(mode: ThemeMode = "light") {
  return chartPalette[mode] ?? chartPalette.light;
}
