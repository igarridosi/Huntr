"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The height an element can take without running off the bottom of the screen.
 *
 * CSS cannot express this on its own. `max-height: calc(100vh - 2rem)` is only
 * right for an element already at the top of the viewport; a sticky panel that
 * starts 250px down the page overflows the fold by exactly that offset until
 * you scroll it into place. And the offset is not a constant - it shrinks as
 * the page scrolls and the element sticks - so no single calc() covers both
 * states.
 *
 * So it is measured. The element's distance from the top of the viewport is
 * read on scroll and on resize, and the height follows it: the panel always
 * ends a little above the bottom edge, whether it is sitting in the flow or
 * pinned.
 *
 * Measured synchronously in the handler rather than batched into an animation
 * frame. One `getBoundingClientRect` on a single element is cheap, browsers
 * already coalesce scroll events to roughly one per frame, and the state
 * updater below discards a value that has not changed - so the render cost is
 * the same. The frame-batched version had a worse failure mode: a throttled
 * `requestAnimationFrame` (a background tab, an inactive window) meant the
 * callback never ran and the panel kept whatever height it had when the page
 * was last visible.
 */
export function useFitToViewport<T extends HTMLElement>(options?: {
  /** Space to leave under the element, in pixels. */
  gap?: number;
  /** Never go below this, so the panel cannot collapse to nothing. */
  minHeight?: number;
}) {
  const gap = options?.gap ?? 16;
  const minHeight = options?.minHeight ?? 240;

  const elementRef = useRef<T | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top;
    const available = window.innerHeight - top - gap;
    setMaxHeight((previous) => {
      const next = Math.max(minHeight, Math.round(available));
      // Sub-pixel churn from a scroll would otherwise re-render every frame.
      return previous !== null && Math.abs(previous - next) < 1 ? previous : next;
    });
  }, [gap, minHeight]);

  /**
   * A callback ref, not a plain one.
   *
   * The panel this measures does not exist when the page mounts - the whole
   * grid appears only once a company has been populated - so an effect that
   * measures on mount finds nothing and never runs again. Measuring at the
   * moment the node attaches is the only version that fires when there is
   * something to measure.
   */
  const ref = useCallback(
    (node: T | null) => {
      elementRef.current = node;
      if (node) measure();
    },
    [measure]
  );

  useEffect(() => {
    measure();

    // Captured on the document, not bound to the window.
    //
    // Scroll events do not bubble, and this app scrolls an inner container
    // rather than the document itself - so a window listener heard nothing and
    // the panel kept its initial height all the way down the page. Capture
    // catches the event from whichever element actually scrolled.
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);

    // The element's own top moves when anything above it changes size - the
    // ticker header gaining a second line, for instance.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer) observer.observe(document.documentElement);

    return () => {
      document.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, maxHeight };
}
