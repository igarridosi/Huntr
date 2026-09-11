import { useMemo, useSyncExternalStore } from "react";

const RECENT_SEARCHES_KEY = "huntr:recent-searches";
const RECENT_SEARCHES_LIMIT = 8;
/** Fired on this window whenever the list is written, since `storage` only fires on others. */
const CHANGE_EVENT = "huntr:recent-searches-change";

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

export function getRecentSearches(): string[] {
  if (!isBrowser()) return [];
  try {
    return parseRecentSearches(window.localStorage.getItem(RECENT_SEARCHES_KEY));
  } catch {
    return [];
  }
}

export function addRecentSearch(ticker: string): string[] {
  if (!isBrowser()) return [];

  const normalized = sanitizeTicker(ticker);
  if (!normalized) return getRecentSearches();

  const next = [
    normalized,
    ...getRecentSearches().filter((item) => item !== normalized),
  ].slice(0, RECENT_SEARCHES_LIMIT);

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    return next;
  }

  return next;
}

function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? sanitizeTicker(item) : ""))
      .filter(Boolean)
      .slice(0, RECENT_SEARCHES_LIMIT);
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The recent searches as React state, sourced from localStorage.
 *
 * Reading localStorage into `useState` inside an effect is the classic
 * hydration dance - render empty, mount, set state, render again - and it is
 * what the React Compiler flags as a set-state-in-effect. `useSyncExternalStore`
 * is the primitive built for exactly this: the server snapshot is the empty
 * list, so server and first client render agree, and the subscription keeps
 * the list current when another tab (or this one) writes it.
 *
 * The snapshot is the raw string on purpose. `useSyncExternalStore` compares
 * snapshots by identity, and a freshly parsed array is never identical to the
 * last one, which loops; a string compares by value. Parsing happens once per
 * distinct string, below.
 */
export function useRecentSearches(): string[] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(RECENT_SEARCHES_KEY);
      } catch {
        return null;
      }
    },
    () => null
  );

  return useMemo(() => parseRecentSearches(raw), [raw]);
}
