"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches. Server snapshot is `false` so the
 * markup hydrates the same way it was rendered; the subscription keeps it
 * current across resizes.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
