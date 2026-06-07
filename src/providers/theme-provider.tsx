"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "huntr-theme";

/**
 * Wraps the app and provides the current theme to all consumers.
 *
 * Theme resolution order:
 *   1. localStorage  (user's explicit preference)
 *   2. prefers-color-scheme  (OS setting)
 *   3. "dark"  (product default)
 *
 * Applies / removes the `light` class on <html> so that CSS variable
 * overrides in globals.css take effect instantly.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // On first mount: resolve stored / system preference and apply it.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const system: Theme = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
    const resolved: Theme = stored ?? system;
    applyTheme(resolved);
    setThemeState(resolved);
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    setThemeState(t);
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Applies or removes the `light` class on <html>. */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "light") {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }
}
