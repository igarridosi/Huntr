"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { readThemePreference, resolveTheme, type Theme, type ThemePreference } from "@/lib/settings/preferences";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { Theme, ThemePreference };

interface ThemeContextValue {
  /** The theme in force right now. */
  theme: Theme;
  /** What the reader asked for: a fixed theme, or whatever the OS says. */
  preference: ThemePreference;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  /** "system" follows the OS from here on, and keeps following it. */
  setPreference: (p: ThemePreference) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  preference: "system",
  toggleTheme: () => {},
  setTheme: () => {},
  setPreference: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "huntr-theme";
const CHANGE_EVENT = "huntr:theme-change";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** The explicit choice on file, or "system" when there is none. */
function readPreference(): ThemePreference {
  try {
    return readThemePreference(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be blocked; that reads as no preference.
    return "system";
  }
}

/** localStorage preference, then the OS setting, then the product default. */
function readTheme(): Theme {
  return resolveTheme(readPreference(), window.matchMedia(LIGHT_QUERY).matches);
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
  // The choice itself, so the settings screen can show "System" as chosen
  // rather than as whichever theme the OS happens to be on today.
  const preference = useSyncExternalStore<ThemePreference>(subscribeToTheme, readPreference, () => "system");

  // Applying the class is a side effect on <html>, which is exactly what an
  // effect is for. It only writes the DOM; it does not set state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((p: ThemePreference) => {
    try {
      // No key means no preference, which is what "system" is.
      if (p === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // A blocked store still gets the class applied for this session.
    }
    // `storage` only fires on other tabs, so this one is told directly.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const setTheme = useCallback((t: Theme) => setPreference(t), [setPreference]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, preference, toggleTheme, setTheme, setPreference }}>
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
