"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The companies last opened in Tracks, newest first, remembered in this
 * browser: a shortcut, never state that has to persist. Read through
 * useSyncExternalStore, so the server and the first client render agree on
 * an empty list and nothing is set in an effect.
 */
const KEY = "huntr:tracks-recent";
const MAX = 8;
const CHANGE = "huntr:tracks-recent-change";
const EMPTY: readonly string[] = [];

let cache: { raw: string | null; list: readonly string[] } = { raw: null, list: EMPTY };

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.list;
  }
  if (raw === cache.raw) return cache.list;
  let list: readonly string[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((t): t is string => typeof t === "string").slice(0, MAX);
  } catch {
    // A value this code did not write: start over.
  }
  cache = { raw, list };
  return list;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => event.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useRecentTracks(): [readonly string[], (ticker: string) => void] {
  const recent = useSyncExternalStore(subscribe, read, () => EMPTY);
  const remember = useCallback((ticker: string) => {
    const next = [ticker, ...read().filter((t) => t !== ticker)].slice(0, MAX);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return;
    }
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return [recent, remember];
}
