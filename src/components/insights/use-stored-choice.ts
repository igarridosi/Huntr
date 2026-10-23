"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One of a few choices, remembered in this browser: a per-reader
 * convenience (card size, a view), never state that has to persist. Blocked
 * or empty storage means the fallback, and a choice made while storage is
 * blocked holds until the page is left.
 *
 * Read through useSyncExternalStore: the server and the first client render
 * agree on the fallback, then the stored choice applies, with no state set
 * in an effect. A change in another tab follows through the storage event.
 */
const memory = new Map<string, string>();
const CHANGE = "huntr:stored-choice-change";

export function useStoredChoice<T extends string>(key: string, choices: readonly T[], fallback: T): [T, (choice: T) => void] {
  const read = useCallback((): T => {
    const held = memory.get(key);
    if (held && choices.includes(held as T)) return held as T;
    try {
      const stored = window.localStorage.getItem(key);
      return stored && choices.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      return fallback;
    }
  }, [key, choices, fallback]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      // Another tab wrote to storage, so storage works and holds the latest choice.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        memory.delete(key);
        onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(CHANGE, onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGE, onChange);
      };
    },
    [key]
  );

  const choice = useSyncExternalStore(subscribe, read, () => fallback);

  const setChoice = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: `memory` holds it until the page is left.
      }
      window.dispatchEvent(new Event(CHANGE));
    },
    [key]
  );

  return [choice, setChoice];
}
