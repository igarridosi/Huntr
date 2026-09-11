"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
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
const CHANGE_EVENT = "huntr:theme-change";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** localStorage preference, then the OS setting, then the product default. */
function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be blocked; fall through to the OS preference.
  }
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

function subscribeToTheme(onChange: () => void) {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

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
  /*
   * The theme is an external store - localStorage plus the OS media query -
   * and `useSyncExternalStore` is the primitive for reading one. The previous
   * version rendered "dark", mounted, read the store in an effect and set state,
   * which is the set-state-in-effect pattern the React Compiler rejects. Here
   * the server snapshot is "dark" so hydration agrees, and the client snapshot
   * is the resolved preference from the first client render onwards.
   */
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, readTheme, () => "dark");

  // Applying the class is a side effect on <html>, which is exactly what an
  // effect is for. It only writes the DOM; it does not set state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    // `storage` only fires on other tabs, so this one is told directly.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

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
