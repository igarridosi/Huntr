"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { DCFScenarioKey } from "@/lib/calculations";

/**
 * Which DCF scenario each company is held against, when the reader picked
 * one other than the scenario the DCF was saved on. Remembered in this
 * browser: a way of reading the valuation, not part of it (the DCF itself
 * is untouched). Blocked storage means every company uses its saved one.
 */
const KEY = "huntr:watchlist-scenarios";
const CHANGE = "huntr:watchlist-scenarios-change";
const EMPTY: Record<string, DCFScenarioKey> = {};

let cache: { raw: string | null; map: Record<string, DCFScenarioKey> } = { raw: null, map: EMPTY };

function read(): Record<string, DCFScenarioKey> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.map;
  }
  if (raw === cache.raw) return cache.map;
  let map: Record<string, DCFScenarioKey> = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object") {
      map = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (e): e is [string, DCFScenarioKey] => e[1] === "bear" || e[1] === "base" || e[1] === "bull"
        )
      );
    }
  } catch {
    map = EMPTY;
  }
  cache = { raw, map };
  return map;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useScenarioChoices(): [Record<string, DCFScenarioKey>, (ticker: string, scenario: DCFScenarioKey | null) => void] {
  const choices = useSyncExternalStore(subscribe, read, () => EMPTY);
  const choose = useCallback((ticker: string, scenario: DCFScenarioKey | null) => {
    const next = { ...read() };
    if (scenario) next[ticker.toUpperCase()] = scenario;
    else delete next[ticker.toUpperCase()];
    const raw = JSON.stringify(next);
    try {
      window.localStorage.setItem(KEY, raw);
      cache = { raw, map: next };
    } catch {
      // Storage blocked: held for this page only.
      cache = { raw: cache.raw, map: next };
    }
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return [choices, choose];
}
