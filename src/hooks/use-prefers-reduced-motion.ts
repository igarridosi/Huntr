"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the viewer has asked the system for less motion.
 *
 * CSS handles this on its own through a media query, but animation that lives
 * in JavaScript - a charting library's own tweens, for instance - has to ask.
 * A media query is an external store, so this reads it with
 * `useSyncExternalStore`: the server snapshot is `false` so hydration agrees,
 * and the subscription keeps it current because the preference can be toggled
 * while the page is open.
 */
function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
