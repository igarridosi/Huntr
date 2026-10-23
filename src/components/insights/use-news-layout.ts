"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How the reader wants "Why it's moving": normal cards, compact ones, or
 * the section hidden. A per-reader convenience, so it lives in this
 * browser's storage; storage that is blocked or empty means "normal".
 *
 * Read through useSyncExternalStore: the server and the first client render
 * agree on "normal", then the stored choice applies, with no state set in an
 * effect. A change in another tab follows through the storage event.
 */
export type NewsLayout = "normal" | "compact" | "hidden";

const KEY = "huntr:news-layout";
const CHANGE = "huntr:news-layout-change";
const LAYOUTS: readonly NewsLayout[] = ["normal", "compact", "hidden"];

/** The choice made on this page, for when storage is blocked and cannot keep it. */
let chosen: NewsLayout | null = null;

function read(): NewsLayout {
  if (chosen) return chosen;
  try {
    const stored = window.localStorage.getItem(KEY);
    return LAYOUTS.includes(stored as NewsLayout) ? (stored as NewsLayout) : "normal";
  } catch {
    return "normal";
  }
}

function subscribe(onChange: () => void) {
  // Another tab wrote to storage, so storage works and holds the latest choice.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    chosen = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useNewsLayout(): [NewsLayout, (layout: NewsLayout) => void] {
  const layout = useSyncExternalStore(subscribe, read, () => "normal" as NewsLayout);
  const setLayout = useCallback((next: NewsLayout) => {
    chosen = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: `chosen` holds it until the page is left.
    }
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return [layout, setLayout];
}
