"use client";

import { useEffect, useState } from "react";

/**
 * Progress through the hero's pinned intro, 0 → 1.
 *
 * Read straight off the `#hero` runway rather than passed down, so the nav and
 * the side menu can react to the sequence without the landing page having to
 * thread state through every level between them.
 */
export function useIntroProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = hero.getBoundingClientRect();
      const runway = rect.height - window.innerHeight;

      // No runway means the pinned intro is disabled (reduced motion), so the
      // chrome should simply stay put.
      if (runway <= 0) {
        setProgress(0);
        return;
      }

      const raw = -rect.top / runway;
      setProgress(Math.min(Math.max(raw, 0), 1));
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return progress;
}

/**
 * Opacity for page chrome during the intro: clears out on the first scroll and
 * comes back as the sequence lands, so the sequence owns the whole viewport.
 */
export function chromeOpacity(progress: number) {
  if (progress < 0.12) return 1 - progress / 0.12;
  if (progress < 0.88) return 0;
  return (progress - 0.88) / 0.12;
}
