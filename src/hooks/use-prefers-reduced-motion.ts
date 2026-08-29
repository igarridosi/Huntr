"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the viewer has asked the system for less motion.
 *
 * CSS handles this on its own through a media query, but animation that lives
 * in JavaScript - a charting library's own tweens, for instance - has to ask.
 * Starts at `false` so the server and the first client render agree, then
 * corrects itself on mount and stays subscribed, because the preference can be
 * toggled while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    setPrefersReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
