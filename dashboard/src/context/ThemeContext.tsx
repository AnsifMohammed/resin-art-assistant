import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getThemeTokens,
  getChartPalette,
  type ThemeTokens,
  type ChartPaletteTokens,
} from "../theme/index.ts";

export type ThemeOption = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: ThemeOption;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  tokens: ThemeTokens;
  chartPalette: ChartPaletteTokens;
  setTheme: (theme: ThemeOption) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "saba_art_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeOption>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeOption | null;
    return saved === "dark" || saved === "system" ? saved : "light";
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const isDark = theme === "dark" || (theme === "system" && mediaQuery.matches);
      const activeTheme: ResolvedTheme = isDark ? "dark" : "light";
      setResolvedTheme(activeTheme);

      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    applyTheme();

    const listener = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [theme]);

  function setTheme(newTheme: ThemeOption) {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  const isDark = resolvedTheme === "dark";
  const tokens = getThemeTokens(resolvedTheme);
  const chartPalette = getChartPalette(resolvedTheme);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        isDark,
        tokens,
        chartPalette,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
